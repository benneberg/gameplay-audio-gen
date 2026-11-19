# ECHO ENGINE — Public JavaScript / TypeScript API Specification

**Version:** 2.0

---

## 1. Module Import

```ts
import { EchoEngine } from './src/echo-engine/echo-engine';
```

---

## 2. Constructor

```ts
const engine = new EchoEngine(config);
```

```ts
interface EchoEngineConfig {
  seed?: number;
  profile?: 'abyss' | 'void' | 'dissonance' | 'machine';
  preset?: Preset;
  volume?: number;      // 0.0–1.0
  autoStart?: boolean;
  analyser?: boolean;
}
```

---

## 3. Lifecycle & Recovery Methods

- `async start(): Promise<void>` — Creates/resumes `AudioContext` inside a user gesture, builds the persistent graph on first start, and starts modulation. Emits `'resumeRequired'` and enters `'recoverable'` if browser autoplay policy blocks resume.
- `stop(): void` — Releases active keyboard voices, pauses JS random-walk timers, and suspends `AudioContext`.
- `destroy(): void` — Tears down timers, visibility listeners, and closes `AudioContext`.
- `getState(): EngineState` — Returns `'idle' | 'starting' | 'playing' | 'suspended' | 'recoverable' | 'destroyed'`.

---

## 4. Soundscape Profile Controls

- `setProfile(profileId: 'abyss' | 'void' | 'dissonance' | 'machine'): void` — Switches the high-level sonic identity without replacing the active preset or session seed.
- `getProfile(): SoundscapeProfileId`

---

## 5. Explicit Atmosphere & Gameplay State

- `setAtmosphere(tension: number, instability: number, complexity: number): void`
- `setTension(value: number): void`
- `setInstability(value: number): void`
- `setComplexity(value: number): void`
- `getAtmosphere(): AtmosphereState`
- `setState(key: 'tension' | 'instability' | 'complexity' | 'progress' | 'proximity' | 'danger', value: number): void` — Updates that single dimension explicitly in `AtmosphereController` without hidden coupling to other dimensions.
- `getState(key: string): number`
- `getGameplayState(): GameplayState`

---

## 6. Event Triggers

`triggerEvent(eventName: EventName | string, options?: { intensity?: number }): void`

**Supported events:**
- Gameplay: `newGame`, `portal`, `danger`, `pass`, `collision`, `nearMiss`, `gameOver`
- Apparitions / Cinematic: `whisper`, `growl`, `subDrop`, `creak`, `wail`, `lurch`, `shepardDive`

---

## 7. Playable Keyboard & Piano Roll Notes

- `noteOn(voiceId: string, midi: number, opts?: NotePlayOptions): void`
- `retuneVoice(voiceId: string, midi: number, tuningScale?: number): void` (used by Glide mode)
- `noteOff(voiceId: string, overrideReleaseSec?: number): void`
- `playNote(midi: number, opts?: NotePlayOptions): void` (scheduled one-shot note for sequencer steps)
- `releaseAllNotes(): void`

---

## 8. Direct Parameter Access

### `setParam(paramPath: string, value: number)` / `getParam(paramPath: string)`

Includes v1 paths (`osc1..3.*`, `noise.gain`, `noise.filterFrequency`, `filter.frequency`, `filter.Q`, `delay.time`, `delay.feedback`, `delay.mix`, `reverb.mix`, `reverb.decay`, `panner.pan`, `masterGain`, `lfo1..3.*`) plus:
- `delay.damping` (300–6000 Hz low-pass damping in delay loop)
- `noise.formantFreq`, `noise.formantLevel`
- `synthesis.subLevel`, `synthesis.fmRatio`, `synthesis.fmDepth`, `synthesis.fmFeedback`
- `synthesis.ringFreq`, `synthesis.ringMix`
- `synthesis.drive`, `synthesis.crush`
- `synthesis.shepardMix`, `synthesis.shepardRate`

### `setParamType(paramPath: string, type: string)`
- `noise.type`: `'white' | 'pink' | 'brown'`
- `osc1..3.waveform` / `lfo1..3.waveform`: `'sine' | 'triangle' | 'sawtooth' | 'square'`
- `filter.type`: `'lowpass' | 'highpass' | 'bandpass' | 'notch' | 'peaking'`
- `noise.filterType`: `'lowpass' | 'bandpass' | 'highpass'`

---

## 9. Engine Events (`onEvent`)

- `started`, `stopped`, `stateChange`, `resumeRequired`, `eventTriggered`, `presetLoaded`, `profileChanged`, `seedChanged`
