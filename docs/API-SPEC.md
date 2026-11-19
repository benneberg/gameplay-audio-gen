# ECHO ENGINE — Public JavaScript API Specification

**Version:** 1.0

---

## 1. Module Import

```js
import { EchoEngine } from './echo-engine.js';
```

The engine is a single ES module export. No global side effects on import.

---

## 2. Constructor

```js
const engine = new EchoEngine(config);
```

### Config Object

```ts
interface EchoEngineConfig {
  seed?: number;             // PRNG seed (default: Date.now())
  preset?: Preset;           // Initial preset (default: built-in)
  volume?: number;           // Master volume 0.0–1.0 (default: 0.7)
  autoStart?: boolean;       // Auto-start on construction (default: false)
  analyser?: boolean;        // Include AnalyserNode (default: true)
}
```

### Example

```js
const engine = new EchoEngine({
  seed: 42,
  volume: 0.8,
  autoStart: false
});
```

---

## 3. Lifecycle Methods

### `async start(): Promise<void>`

Starts or resumes audio generation.

- Creates AudioContext if needed (must be called from user gesture)
- Resumes AudioContext
- Starts all oscillators and modulation
- Resolves when audio is running
- Idempotent (safe to call multiple times)

### `stop(): void`

Stops audio generation.

- Suspends AudioContext (does not close)
- All oscillators continue in suspended state
- Can resume with `start()`

### `destroy(): void`

Permanently destroys the engine.

- Closes AudioContext
- Clears all timers
- Disconnects all nodes
- Engine instance is unusable after this

### `getState(): EngineState`

Returns current engine state.

```ts
type EngineState = 'idle' | 'starting' | 'playing' | 'suspended' | 'destroyed';
```

---

## 4. Atmosphere Controls

### `setAtmosphere(tension: number, instability: number, complexity: number): void`

Set all three atmosphere macros simultaneously.

```js
engine.setAtmosphere(0.5, 0.3, 0.7);
```

### `setTension(value: number): void`

Set tension (0.0–1.0).

### `setInstability(value: number): void`

Set instability (0.0–1.0).

### `setComplexity(value: number): void`

Set complexity (0.0–1.0).

### `getAtmosphere(): { tension: number, instability: number, complexity: number }`

Get current atmosphere values.

---

## 5. Gameplay State (Continuous)

### `setState(key: string, value: number): void`

Set a named continuous gameplay state.

**Recognized state keys:**

| Key | Range | Effect |
|-----|-------|--------|
| `tension` | 0.0–1.0 | Alias for `setTension()` |
| `progress` | 0.0–1.0 | Increases complexity + slight instability |
| `proximity` | 0.0–1.0 | Increases tension + filter cutoff |
| `danger` | 0.0–1.0 | Increases tension + instability |

```js
engine.setState('progress', 0.6);
engine.setState('proximity', 0.3);
```

### `getState(key: string): number`

Get current value of a gameplay state.

---

## 6. Event Triggers (Discrete)

### `triggerEvent(eventName: string, options?: EventOptions): void`

Trigger a discrete gameplay event.

```js
engine.triggerEvent('portal');
engine.triggerEvent('collision', { intensity: 0.8 });
```

### EventOptions

```ts
interface EventOptions {
  intensity?: number;  // 0.0–1.0, scales the event's audio response
}
```

### Supported Events (v1.0)

| Event Name | Description |
|-----------|-------------|
| `newGame` | New session, re-seed and reset |
| `portal` | Portal interaction — spectral sweep |
| `danger` | Danger approaching — tension increase |
| `pass` | Obstacle passed — tension release |
| `collision` | Collision — dissonance burst |
| `nearMiss` | Near miss — subtle instability |
| `gameOver` | Game over — atmospheric transition |

---

## 7. Direct Parameter Access

### `setParam(paramPath: string, value: number): void`

Set a specific audio parameter directly.

**Parameter paths:**

| Path | Type | Range | Unit |
|------|------|-------|------|
| `osc1.frequency` | float | 20–2000 | Hz |
| `osc2.frequency` | float | 20–2000 | Hz |
| `osc3.frequency` | float | 20–2000 | Hz |
| `osc1.detune` | float | -1200–1200 | cents |
| `osc2.detune` | float | -1200–1200 | cents |
| `osc3.detune` | float | -1200–1200 | cents |
| `osc1.gain` | float | 0.0–1.0 | amplitude |
| `osc2.gain` | float | 0.0–1.0 | amplitude |
| `osc3.gain` | float | 0.0–1.0 | amplitude |
| `noise.gain` | float | 0.0–1.0 | amplitude |
| `noise.filterFreq` | float | 50–8000 | Hz |
| `filter.frequency` | float | 20–12000 | Hz |
| `filter.Q` | float | 0.1–40 | — |
| `delay.time` | float | 0.01–2.0 | seconds |
| `delay.feedback` | float | 0.0–0.95 | — |
| `delay.mix` | float | 0.0–1.0 | wet/dry |
| `reverb.mix` | float | 0.0–1.0 | wet/dry |
| `panner.pan` | float | -1.0–1.0 | stereo |
| `masterGain` | float | 0.0–1.0 | amplitude |
| `lfo1.rate` | float | 0.01–20 | Hz |
| `lfo1.depth` | float | (target-specific) | — |
| `lfo2.rate` | float | 0.01–20 | Hz |
| `lfo2.depth` | float | (target-specific) | — |
| `lfo3.rate` | float | 0.01–20 | Hz |
| `lfo3.depth` | float | (target-specific) | — |

```js
engine.setParam('filter.frequency', 2000);
engine.setParam('osc1.detune', 30);
```

### `getParam(paramPath: string): number`

Get current value of a parameter.

### `setParamType(paramPath: string, type: string): void`

Set a parameter type (for enumerated params).

| Path | Allowed Types |
|------|---------------|
| `osc1.waveform` | `sine`, `triangle`, `sawtooth`, `square` |
| `osc2.waveform` | `sine`, `triangle`, `sawtooth`, `square` |
| `osc3.waveform` | `sine`, `triangle`, `sawtooth`, `square` |
| `noise.type` | `white`, `pink` |
| `filter.type` | `lowpass`, `highpass`, `bandpass`, `notch`, `peaking` |
| `lfo1.waveform` | `sine`, `triangle`, `sawtooth`, `square` |
| `lfo2.waveform` | `sine`, `triangle`, `sawtooth`, `square` |
| `lfo3.waveform` | `sine`, `triangle`, `sawtooth`, `square` |

---

## 8. Preset System

### `savePreset(name: string): Preset`

Save current engine state as a preset.

```js
const preset = engine.savePreset('Dark Machine');
```

### `loadPreset(preset: Preset): void`

Load a preset, restoring all parameters.

```js
engine.loadPreset(savedPreset);
```

### `getPreset(): Preset`

Get current state as a preset object.

### `getBuiltInPresets(): Preset[]`

Get array of built-in presets.

---

## 9. Seed & Randomization

### `getSeed(): number`

Get the current session seed.

### `setSeed(seed: number): void`

Change the seed (does not reset session).

### `reseed(seed?: number): void`

Re-seed and re-randomize the current session.
If no seed provided, uses `Date.now()`.

---

## 10. Volume

### `setVolume(value: number): void`

Set master volume (0.0–1.0).

### `getVolume(): number`

Get master volume.

---

## 11. Utility

### `getAnalyser(): AnalyserNode | null`

Get the AnalyserNode for visualization (if enabled).

### `getAudioContext(): AudioContext`

Get the underlying AudioContext (for advanced use / visualization).

### `isRunning(): boolean`

Check if audio is actively generating.

---

## 12. Events (Optional Callback)

### `onEvent(callback: (eventName: string, data: object) => void): void`

Register a callback for engine events (primarily for debugging/logging).

**Engine-emitted events:**
- `started` — Audio generation started
- `stopped` — Audio generation stopped
- `stateChange` — Engine state changed
- `eventTriggered` — Gameplay event triggered
- `presetLoaded` — Preset loaded
- `seedChanged` — Seed changed

---

## 13. TypeScript Types (Reference)

```ts
interface Preset {
  version: string;
  name: string;
  seed: number;
  sources: {
    osc1: OscillatorConfig;
    osc2: OscillatorConfig;
    osc3: OscillatorConfig;
    noise: NoiseConfig;
  };
  filter: FilterConfig;
  modulation: {
    lfo1: LFOConfig;
    lfo2: LFOConfig;
    lfo3: LFOConfig;
    randomWalk1: RandomWalkConfig;
    randomWalk2: RandomWalkConfig;
    randomWalk3: RandomWalkConfig;
  };
  effects: {
    delay: DelayConfig;
    reverb: ReverbConfig;
  };
  atmosphere: {
    tension: number;
    instability: number;
    complexity: number;
  };
  masterGain: number;
  pan: number;
}
```
