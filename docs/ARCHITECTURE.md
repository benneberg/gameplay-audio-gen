# ECHO ENGINE — System Architecture

**Version:** 2.0

---

## 1. Conceptual Hierarchy & High-Level Architecture

Echo Engine separates **sonic identity**, **configuration**, **seeded variation**, and **gameplay adaptation** into five distinct layers:

1. **Soundscape Profile** (`abyss` · `void` · `dissonance` · `machine`) — Fundamental sonic identity controlling timbre bias, preferred noise color, filter range, delay damping, and harmonic detune curves.
2. **Preset** — Particular sound configuration within that identity.
3. **Session Seed** — Controlled deterministic variation via independent Mulberry32 PRNG streams.
4. **Gameplay Adaptation** — Explicit continuous state dimensions (`tension`, `instability`, `complexity`, `progress`, `proximity`, `danger`) + discrete event triggers.
5. **Evolving Soundscape** — Continuous audio output.

```text
┌────────────────────────────────────────────────────────────────────┐
│                           ECHO ENGINE                              │
│                                                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐ │
│  │  Soundscape  │  │    Preset    │  │   SeededStreams (Mul32)   │ │
│  │   Profiles   │  │   Manager    │  │ buffers|identity|walk|evt│ │
│  └──────┬───────┘  └──────┬───────┘  └────────────┬─────────────┘ │
│         │                 │                       │                │
│  ┌──────▼─────────────────▼───────────────────────▼─────────────┐ │
│  │                   Atmosphere Controller                      │ │
│  │  Explicit mappings: (Profile + Preset + GameplayState)       │ │
│  └────────────────────────┬─────────────────────────────────────┘ │
│                           │                                       │
│  ┌────────────────────────▼─────────────────────────────────────┐ │
│  │                    Modulation Engine                         │ │
│  │  Audio-thread LFOs · JS interval random walks · Shepard      │ │
│  └────────────────────────┬─────────────────────────────────────┘ │
│                           │                                       │
│  ┌────────────────────────▼─────────────────────────────────────┐ │
│  │                 Persistent Audio Graph                       │ │
│  │  Voices/Noise/Keys → Filter → Panner → WaveShaper            │ │
│  │  → [Dry | Low-Pass Damped Delay | Dark Cavern Reverb]        │ │
│  │  → Safety Compressor → Master Gain → Analyser → Destination  │ │
│  └────────────────────────┬─────────────────────────────────────┘ │
│                           │                                       │
│  ┌────────────────────────▼─────────────────────────────────────┐ │
│  │                      Event Engine                            │ │
│  │  Gameplay automations + transient 3D/formant/sub apparitions │ │
│  └──────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────┘
```

---

## 2. Module Breakdown

### 2.1 EchoEngine (`src/echo-engine/echo-engine.ts`)

Main orchestrator and public API surface.

**State machine:**
```text
IDLE → STARTING → PLAYING ──(visibility hidden)──→ SUSPENDED
                     ▲                                 │
                     └──(best-effort resume OK)────────┤
                                                       ▼
                                                 RECOVERABLE
                                        (autoplay policy blocked;
                                         one-tap user gesture UI)
```

### 2.2 Persistent Audio Graph (`src/echo-engine/core/audio-graph.ts`)

All core processing nodes are created once when audio starts and reused continuously without rebuilding the graph per parameter change.

**Signal chain:**
- **Drone Sources**: `osc1`, `osc2`, `osc3` + `subOsc` (0.5× root) + `fmOsc` (cross-FM with optional self-feedback) → `filter` (`BiquadFilterNode`)
- **Noise & Whisper Formants**: `noise` (`white` | `pink` | `brown` buffer generated via `streams.buffers`) → `noiseFilter` → `noiseGain` → `filter`, plus parallel `formantFilter` (high-Q bandpass) → `formantGain` → `preFxBus`
- **Texture Layers**: `ringOsc` + `ringMix` (ring modulator branch) and 6-voice `shepardOscs` → `shepardBus` → `preFxBus`
- **Keyboard / Sequencer Bus**: `keyBus` feeds played notes into `postGain` so notes share the active spatial/delay/reverb/saturation stage
- **Shaper & Space**: `postGain` → `panner` (`StereoPannerNode`) → `shaper` (`WaveShaperNode` soft-clip drive + quantization curve, 2x oversampled)
- **Damped Feedback Delay**: `shaper` → `delay` → `delayDamping` (low-pass filter inside the feedback loop so echoes darken as they recede) → `delayFeedback` → `delay`, and `delayDamping` → `delayMix`
- **Procedural Dark Cavern Reverb**: `shaper` + `delayMix` → `reverb` (`ConvolverNode` loaded with a code-generated 1-pole low-pass damped stereo impulse response, zero external audio assets) → `reverbMix`
- **Safety Output Stage**: Dry + Delay + Reverb sum into `compressor` (`DynamicsCompressorNode`, threshold `-10 dB`, ratio `12:1`) → `masterGain` → `analyser` → `ctx.destination`

### 2.3 Separate Seeded PRNG Streams (`src/echo-engine/core/rng.ts`)

Rather than sharing one global generator across unrelated tasks, `createSeededStreams(baseSeed)` derives independent Mulberry32 streams via bit-mixed FNV-1a tags:
- `streams.buffers`: procedural noise buffers and cavern reverb IRs
- `streams.identity`: `reseed()` / sonic identity variation
- `streams.walk`: stochastic random-walk steps
- `streams.events`: discrete event / apparition variations
- `streams.texture`: UI pattern generator variations

Changing buffer generation order or reverb decay never shifts subsequent random-walk sequences.

### 2.4 ModulationEngine (`src/echo-engine/core/modulation.ts`)

- **3 Audio-Thread LFOs**: Native `OscillatorNode → GainNode → AudioParam`. Defaults favor subtle detune breathing (`osc1.detune`), spectral sweep (`filter.frequency`), and slow stereo drift (`panner.pan`) rather than repetitive siren pitch sweeps.
- **3 Stochastic Random Walks**: Implemented as **JavaScript `setInterval` drift timers** (not an audio-thread scheduler) that update bounded target values using `streams.walk` and schedule smooth transitions via `AudioParam.setTargetAtTime`.
- **Shepard Infinity Ladder**: Schedules overlapping octave-staggered glissandi across 6 sine oscillators when `shepardMix > 0.02`.

### 2.5 AtmosphereController (`src/echo-engine/core/atmosphere.ts`)

Owns ALL continuous gameplay-to-audio mappings explicitly as pure calculations from `(profile, basePreset, gameplayState)`:
- Updating `setState('proximity', v)` explicitly adjusts filter openness, sub-octave weight, delay damping brightness, and cavern dry/wet balance **without implicitly mutating `tension` or overwriting preset fields**.
- `tension`, `instability`, `complexity`, `progress`, `proximity`, and `danger` remain clean, independent dimensions.

### 2.6 Background Resume & Autoplay Policy (`visibilitychange`)

- When the browser hides the tab while playing, `EchoEngine` pauses modulation timers, releases active keyboard voices, ramps master gain down, and calls `ctx.suspend()`.
- When the page becomes visible again, `EchoEngine` attempts a best-effort `ctx.resume()`. If browser/iOS autoplay policy prevents resuming without a fresh gesture (`ctx.state !== 'running'`), the engine transitions to `'recoverable'` and emits `'resumeRequired'` so the Sound Lab displays an immediate one-tap **Tap to Resume** banner.
