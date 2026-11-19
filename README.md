# Echo Engine & Sound Lab

> Autonomous procedural Web Audio synthesizer and mobile-first Sound Laboratory for **Shadowflap**.

Echo Engine generates continuously evolving, dark atmospheric soundscapes directly in modern desktop and mobile browsers using the Web Audio API. Its companion **Sound Lab** provides a touch-optimized PWA interface for real-time synthesis design, profile selection, XY atmosphere control, keyboard/piano-roll auditioning, and preset sharing.

## Conceptual Hierarchy

```text
Soundscape Profile   (Abyss · Void · Dissonance · Machine — fundamental sonic identity)
       ↓
     Preset          (curated or user-saved configuration within that identity)
       ↓
  Session Seed       (deterministic variation via isolated PRNG streams)
       ↓
Gameplay Adaptation  (explicit continuous state mappings + discrete event triggers)
       ↓
Evolving Soundscape  (continuous Web Audio output)
```

## Key Features

- **Zero-Dependency Persistent Audio Graph**: Built purely on the Web Audio API (`src/echo-engine/`), creating core oscillators, sub-octave, cross-FM, ring mod, Shepard infinity ladder, formant noise, damped feedback delay, procedural cavern reverb, soft-clip waveshaper, and dynamics compressor once and reusing them continuously.
- **White, Pink & Brown Noise + Whisper Formants**: Independent color selection alongside resonant noise filtering and parallel vocal-air bandpass formant shaping.
- **Separate Seeded PRNG Streams**: Mulberry32 streams isolated per concern (`buffers`, `identity`, `walk`, `events`, `texture`) so buffer/IR generation order never alters stochastic random-walk trajectories.
- **Explicit Atmosphere Controller**: `AtmosphereController` owns all continuous gameplay mappings (`tension`, `instability`, `complexity`, `progress`, `proximity`, `danger`) without implicit cross-coupling.
- **Playable Keyboard & 16-Step Piano Roll (`KEYS`)**: 2-octave touch/QWERTY keyboard with octave shift (`OCT −` / `OCT +`), scale quantization/dimming, glide/sustain modes, and a scale-locked 16-step sequencer routed through the live filter and cavern FX chain.
- **Mobile-First Sound Lab (PWA)**: Touch XY Atmosphere Matrix pad, oscilloscope/spectrum visualizer, recoverable background-resume banner for browser autoplay policies, offline Workbox caching, and preset persistence (`localStorage`, JSON export/import, and `#preset=` URL hash sharing).

## Quick Start

```bash
npm install --legacy-peer-deps
npm run dev
```

Build the standalone static bundle (configured with relative `./` paths for GitHub Pages):

```bash
npm run build
```

## Deploying to GitHub Pages

1. Push this repository to GitHub (`main` or `master` branch).
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. The included `.github/workflows/deploy-pages.yml` workflow builds `dist/` and deploys automatically on push.

## Engine Usage

```ts
import { EchoEngine } from './src/echo-engine/echo-engine';

const engine = new EchoEngine({ seed: 1012, profile: 'abyss', volume: 0.72 });
await engine.start(); // Call inside a user gesture handler

engine.setProfile('dissonance');
engine.setAtmosphere(0.45, 0.35, 0.65);
engine.setState('proximity', 0.6); // Explicit mapping without mutating tension
engine.triggerEvent('whisper', { intensity: 0.85 });
```

## Project Structure

```text
├── README.md
├── docs/                       # Technical specification package
│   ├── PRD.md
│   ├── ARCHITECTURE.md
│   ├── API-SPEC.md
│   ├── SOUND-LAB-SPEC.md
│   ├── PRESET-SPEC.md
│   └── IMPLEMENTATION-GUIDE.md
├── public/                     # PWA icons (SVG + PNG + maskable)
└── src/
    ├── echo-engine/            # Core procedural audio engine
    │   ├── echo-engine.ts      # Public API orchestrator
    │   ├── profiles.ts         # Abyss / Void / Dissonance / Machine identities
    │   ├── types.ts            # TypeScript definitions
    │   ├── core/               # SeededStreams, AudioGraph, Modulation, Atmosphere, Events
    │   └── presets/            # Built-in presets & PresetManager
    └── components/             # Mobile-first Sound Lab UI, XYPad, KeysTab & Visualizer
```

## Documentation

| Document | Description |
|----------|-------------|
| [docs/PRD.md](docs/PRD.md) | Product Requirements Document — vision, features, constraints, roadmap |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System architecture, Web Audio graph topology, modulation & lifecycle |
| [docs/API-SPEC.md](docs/API-SPEC.md) | Public JavaScript/TypeScript API, profiles, states, events, and parameter paths |
| [docs/SOUND-LAB-SPEC.md](docs/SOUND-LAB-SPEC.md) | Mobile-first Sound Lab UI/UX, touch controls, breakpoints, PWA |
| [docs/PRESET-SPEC.md](docs/PRESET-SPEC.md) | Preset JSON schema, built-in presets, serialization & URL sharing |
| [docs/IMPLEMENTATION-GUIDE.md](docs/IMPLEMENTATION-GUIDE.md) | Implementation patterns, Web Audio specifics, and testing checklist |
