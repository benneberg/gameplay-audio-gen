# ECHO ENGINE — Product Requirements Document

**Version:** 1.0  
**Parent Project:** Shadowflap  
**Status:** Approved for implementation  
**Last Updated:** 2025

---

## 1. Executive Summary

Echo Engine is a reusable, zero-dependency procedural audio engine that
generates continuously evolving atmospheric soundscapes in the browser.
Its first consumer is the game Shadowflap, but it is designed to be
independent and portable.

The engine replaces conventional soundtracks with an autonomous audio
system that reacts to gameplay, varies across sessions, and creates a
sense of living, unpredictable machinery.

---

## 2. Problem Statement

Shadowflap currently uses a basic shifting-tone audio system. It lacks:

- Deep variation across sessions
- Meaningful response to gameplay events
- Controlled yet unpredictable sonic evolution
- A reusable architecture
- A sound-design workflow (currently requires code changes to experiment)

## 3. Solution

Echo Engine provides:

1. **Real-time procedural audio generation** via the Web Audio API
2. **Continuous autonomous modulation** for evolving, non-repetitive sound
3. **Gameplay event and state integration** through a minimal API
4. **Seeded session variation** for distinct experiences per playthrough
5. **A Sound Laboratory** — a standalone mobile-first web app for sound
   design, experimentation, testing and preset management

## 4. Target Users

| User | Need |
|------|------|
| **Sound designer / developer** | Experiment with parameters, save presets, iterate rapidly |
| **Shadowflap player** | Immersive, evolving, responsive audio experience |
| **Game developer** | Integrate adaptive audio without understanding audio internals |

## 5. Core Features (v1.0)

### 5.1 Audio Generation

- **3 oscillator voices** (selectable waveform: sine, triangle, sawtooth, square)
  - Independent frequency, detune, gain
  - Independent LFO modulation
- **1 noise generator** (white / pink noise)
  - Bandpass-filtered for texture control
  - Independent gain and modulation
- **1 main filter** (lowpass / highpass / bandpass / notch / peaking)
  - Modulatable cutoff frequency and Q (resonance)
- **Feedback delay** effect
- **Procedural reverb** (generated impulse response)
- **Stereo panning** with LFO modulation
- **Master volume** control

### 5.2 Modulation System

- **3 LFOs** with independent rate (0.01–20 Hz), depth, waveform,
  and routing targets
- **3 random walks** with configurable step size, range, and target
- **Modulation targets:** oscillator frequency, filter cutoff, filter Q,
  stereo pan, master gain, LFO rate (meta-modulation)
- All modulation runs continuously and autonomously

### 5.3 Atmosphere Controller

High-level macro controls that internally adjust multiple parameters:

| Macro | Range | Effect |
|-------|-------|--------|
| **Tension** | 0.0 – 1.0 | Increases dissonance, filter cutoff movement, LFO speeds |
| **Instability** | 0.0 – 1.0 | Increases random walk activity, parameter jitter, gain fluctuation |
| **Complexity** | 0.0 – 1.0 | Increases oscillator layering, filter modulation depth, effect mix |

### 5.4 Seeded Randomization

- Mulberry32 seeded PRNG
- Configurable seed value
- Same seed → same initial parameters + modulation trajectory
- New seed → new sonic identity
- Seed displayed and editable in Sound Lab

### 5.5 Event System

Discrete gameplay events trigger transient audio responses:

| Event | Audio Response (initial design) |
|-------|----------------------------------|
| `newGame` | Generate new sonic identity (new seed if auto-seeded) |
| `portal` | Frequency sweep up, resonance spike, brief spectral shift |
| `danger` | Tension increase, dissonance layer, faster LFOs |
| `pass` | Gradual tension decrease, smooth return to baseline |
| `collision` | Brief distortion / dissonance burst |
| `nearMiss` | Subtle dissonance pulse, brief instability spike |
| `gameOver` | Sustained low tone, slow filter descent, reverb swell |

### 5.6 State-Based Modulation

Continuous gameplay state values (0.0–1.0) modulate the soundscape:

| State | Effect |
|-------|--------|
| `tension` | Maps to atmosphere tension |
| `progress` | Maps to complexity + slight instability increase |
| `proximity` | Maps to tension + filter cutoff adjustment |

### 5.7 Preset System

- Save current engine state as JSON preset
- Load preset to restore engine state
- Built-in default presets
- Export preset as JSON file
- Import preset from JSON file
- Preset sharing via URL hash (Sound Lab)

### 5.8 Sound Laboratory (Standalone App)

See [SOUND-LAB-SPEC.md](SOUND-LAB-SPEC.md) for full UI specification.

Core capabilities:
- Start / stop audio
- Real-time parameter controls (all engine parameters)
- Visual waveform + spectrum display
- Atmosphere macro controls
- Gameplay event simulation
- Preset save / load / export / import
- Seed display and control
- Mobile-first touch-optimized interface

---

## 6. Non-Goals (v1.0)

- No AudioWorklet processing
- No sample library playback (planned for v1.1)
- No multi-channel / spatial audio (stereo only)
- No recording / export of audio
- No MIDI support
- No networking
- No shadowflap game integration (Phase 3)
- No desktop-native UI (web only)

---

## 7. Constraints

| Constraint | Requirement |
|-----------|-------------|
| **Browser support** | Chrome 90+, Firefox 90+, Safari 15+, Edge 90+ |
| **Mobile** | iOS 15+, Android Chrome 90+ |
| **Bundle size** | Engine < 30 KB gzipped (no deps) |
| **Latency** | Audio startup < 200ms after user gesture |
| **CPU** | < 5% CPU on mid-range mobile (measured during steady playback) |
| **Memory** | < 20 MB total audio graph memory |
| **AudioContext** | Must handle mobile autoplay restrictions, suspend/resume |
| **Offline** | Sound Lab must work offline after first load (PWA-ready) |

---

## 8. Success Criteria

The system is successful when:

1. ✅ It generates an evolving atmospheric soundscape with no obvious repetition
   over 10+ minutes of continuous playback
2. ✅ Two sessions with different seeds sound distinctly different
3. ✅ Two sessions with the same seed are reproducible
4. ✅ Gameplay events produce audible, appropriate audio responses
5. ✅ The Sound Lab allows parameter experimentation on a mobile phone
6. ✅ Presets can be saved, loaded and shared
7. ✅ Engine integrates with Shadowflap via its public API only
8. ✅ Meets performance constraints on target devices

---

## 9. Roadmap

| Phase | Scope | Status |
|-------|-------|--------|
| **Phase 1** | Core engine — generators, modulation, atmosphere | **← v1.0** |
| **Phase 2** | Sound Laboratory — full UI + presets | **← v1.0** |
| **Phase 3** | Shadowflap integration | v1.1 |
| **Phase 4** | Sample library, advanced modulation, refinement | v1.2 |

---

## 10. Open Questions

| # | Question | Decision |
|---|----------|----------|
| 1 | Should samples be included in v1.0? | **No** — procedural only for v1 |
| 2 | Should the Sound Lab be a PWA? | **Yes** — PWA-ready with manifest + service worker |
| 3 | Preset sharing mechanism? | **URL hash** + file export/import |
| 4 | Maximum simultaneous oscillators? | **3** for v1.0 |
| 5 | Reverb impulse response generation? | **Procedural** (noise + exponential decay) |
| 6 | Should the engine support AudioWorklet? | **No** — only if perf demands in future |
| 7 | Dark theme only for Sound Lab? | **Yes** — matches Shadowflap aesthetic |
