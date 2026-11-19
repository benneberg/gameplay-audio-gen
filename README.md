# Echo Engine & Sound Lab

> Autonomous procedural Web Audio synthesizer and mobile-first Sound Laboratory for **Shadowflap**.

Echo Engine generates continuously evolving, non-repetitive atmospheric soundscapes directly in modern desktop and mobile browsers using the Web Audio API. Its companion **Sound Lab** provides a touch-optimized PWA interface for real-time synthesis design, modulation routing, gameplay event simulation, and preset sharing.

## Key Features

- **Zero-Dependency Audio Core**: Built purely on the Web Audio API (`src/echo-engine/`) with audio-thread scheduling and node reuse.
- **3 Oscillator Voices + Filtered Noise**: Independent waveform, frequency, detune, and gain controls alongside white/pink noise texture filtering.
- **Autonomous Modulation**: 3 native Web Audio LFOs and 3 seeded Mulberry32 random walks routing across oscillators, filter cutoff/Q, stereo pan, delay, gain, and LFO rates.
- **Atmosphere & Event Engine**: High-level macros (`tension`, `instability`, `complexity`), continuous gameplay state mapping (`progress`, `proximity`, `danger`), and 7 discrete gameplay event triggers (`newGame`, `portal`, `danger`, `pass`, `collision`, `nearMiss`, `gameOver`).
- **Mobile-First Sound Lab (PWA)**: Touch sliders, oscilloscope waveform & logarithmic spectrum canvas visualizer, offline Workbox caching, and preset persistence (`localStorage`, JSON export/import, and `#preset=` URL hash sharing).

## Quick Start

```bash
npm install
npm run dev
```

Build the standalone static bundle (configured with relative `./` paths for GitHub Pages):

```bash
npm run build
```

## Deploying to GitHub Pages

1. Push this repository to GitHub (`main` branch).
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. The included `.github/workflows/deploy-pages.yml` workflow builds `dist/` and deploys automatically on push.

## Engine Usage

```ts
import { EchoEngine } from './src/echo-engine/echo-engine';

const engine = new EchoEngine({ seed: 42, volume: 0.7 });
await engine.start(); // Call inside a user gesture handler

engine.setAtmosphere(0.5, 0.3, 0.7);
engine.setState('proximity', 0.6);
engine.triggerEvent('portal', { intensity: 0.9 });
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
    │   ├── types.ts            # TypeScript definitions
    │   ├── core/               # RNG, AudioGraph, Modulation, Atmosphere, Events
    │   └── presets/            # Built-in presets & PresetManager
    └── components/             # Mobile-first Sound Lab UI & Visualizer
```

## Documentation

| Document | Description |
|----------|-------------|
| [docs/PRD.md](docs/PRD.md) | Product Requirements Document — vision, features, constraints, roadmap |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System architecture, Web Audio graph topology, modulation & lifecycle |
| [docs/API-SPEC.md](docs/API-SPEC.md) | Public JavaScript/TypeScript API, states, events, and parameter paths |
| [docs/SOUND-LAB-SPEC.md](docs/SOUND-LAB-SPEC.md) | Mobile-first Sound Lab UI/UX, touch controls, breakpoints, PWA |
| [docs/PRESET-SPEC.md](docs/PRESET-SPEC.md) | Preset JSON schema, built-in presets, serialization & URL sharing |
| [docs/IMPLEMENTATION-GUIDE.md](docs/IMPLEMENTATION-GUIDE.md) | Implementation patterns, Web Audio specifics, and testing checklist |
