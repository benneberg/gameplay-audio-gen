# ECHO ENGINE — System Architecture

**Version:** 1.0

---

## 1. High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     ECHO ENGINE                         │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐             │
│  │  Public   │  │  Preset  │  │  Seeded  │             │
│  │   API     │  │  Manager │  │   RNG    │             │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘             │
│       │              │              │                    │
│  ┌────▼──────────────▼──────────────▼─────┐            │
│  │          Atmosphere Controller          │            │
│  │  (tension, instability, complexity)     │            │
│  └────────────────┬────────────────────────┘            │
│                   │                                      │
│  ┌────────────────▼────────────────────────┐            │
│  │          Modulation Engine               │            │
│  │  (LFOs, Random Walks, Mod Matrix)       │            │
│  └────────────────┬────────────────────────┘            │
│                   │                                      │
│  ┌────────────────▼────────────────────────┐            │
│  │           Audio Graph                    │            │
│  │  Sources → Filter → Effects → Output    │            │
│  └────────────────┬────────────────────────┘            │
│                   │                                      │
│  ┌────────────────▼────────────────────────┐            │
│  │          Event Engine                    │            │
│  │  (gameplay event responses)             │            │
│  └─────────────────────────────────────────┘            │
│                                                         │
└─────────────────────────────────────────────────────────┘
                          │
                    Public API
                          │
          ┌───────────────┴───────────────┐
          │                               │
    ┌─────▼─────┐                 ┌───────▼───────┐
    │  SHADOWFLAP│                 │  SOUND LAB     │
    │   (game)   │                 │  (standalone)  │
    └────────────┘                 └────────────────┘
```

---

## 2. Module Breakdown

### 2.1 EchoEngine (core/echo-engine.js)

The main entry point. Orchestrates all subsystems.

**Responsibilities:**
- Initialize and manage AudioContext lifecycle
- Create and connect the audio graph
- Coordinate modulation, atmosphere, and events
- Expose the public API
- Manage engine state (idle, starting, playing, suspended)

**State machine:**
```
IDLE → STARTING → PLAYING → SUSPENDING → SUSPENDED
         │                      │              │
         └──── RESUMING ←──────┘──────────────┘
                     │
                   PLAYING
```

### 2.2 AudioGraph (core/audio-graph.js)

Builds and manages the Web Audio node graph.

**Responsibilities:**
- Create all AudioNodes (oscillators, filters, effects, gains)
- Connect nodes in the correct topology
- Expose node references for modulation and control
- Handle node lifecycle (create once, reuse)

**Node inventory (fixed at creation):**
- 3 × OscillatorNode
- 3 × GainNode (oscillator gains)
- 1 × BufferSourceNode (noise)
- 1 × GainNode (noise gain)
- 1 × BiquadFilterNode (noise filter)
- 1 × BiquadFilterNode (main filter)
- 1 × GainNode (post-filter gain)
- 1 × DelayNode + GainNode (feedback delay)
- 1 × ConvolverNode (reverb) + GainNode (reverb mix)
- 1 × StereoPannerNode
- 1 × GainNode (master volume)
- 3 × OscillatorNode (LFOs) + 3 × GainNode (LFO depth)
- 3 × AudioParam targets for random walks (via `setTargetAtTime`)
- 1 × AnalyserNode (for visualization)

**Audio graph signal flow:**

```
Oscillator 1 ─→ [Gain 1] ─────────────────┐
Oscillator 2 ─→ [Gain 2] ─────────────────┤
Oscillator 3 ─→ [Gain 3] ─────────────────┤
                                            ├─→ [Mix Sum] ─→ [Main Filter] ─→ [Post Gain] ─→ [Delay] ─→ [Reverb] ─→ [Panner] ─→ [Master Gain] ─→ [Analyser] ─→ [Destination]
Noise ─→ [Noise Filter] ─→ [Noise Gain] ──┘                                                                        ↑
                                                                                                                    │
                                                                                                              (wet mix)
LFO 1 ─→ [LFO Depth 1] ─→ targets: osc1.freq, osc2.freq, osc3.freq
LFO 2 ─→ [LFO Depth 2] ─→ targets: filter.freq, filter.Q
LFO 3 ─→ [LFO Depth 3] ─→ targets: panner.pan, delay.time
```

**Note:** Delay and reverb are parallel to serial (delay feeds into reverb).
Reverb also receives a direct dry signal. Wet/dry mix controlled per-effect.

### 2.3 ModulationEngine (core/modulation.js)

Manages all modulation sources and routing.

**Components:**

#### LFOs (3 instances)
Each LFO is implemented as a native `OscillatorNode` → `GainNode` (depth) → target `AudioParam`:
- Efficient: runs on audio thread, zero JS overhead per frame
- Rate: 0.01–20 Hz
- Depth: target-specific units
- Waveform: sine, triangle, sawtooth, square
- Target: any routable AudioParam

#### Random Walks (3 instances)
JavaScript-driven parameter evolution using `setTargetAtTime`:
- Current value tracks a random walk between [min, max]
- Updated at configurable interval (default: 100ms)
- Step size configurable
- Smooth transitions via `setTargetAtTime(value, currentTime, timeConstant)`

**Random Walk update loop:**
```js
updateWalk(walk) {
  const step = (rng() * 2 - 1) * walk.stepSize;
  walk.current = clamp(walk.current + step, walk.min, walk.max);
  walk.targetParam.setTargetAtTime(walk.current, ctx.currentTime, walk.smoothing);
}
```

#### Modulation Matrix
A routing table that maps modulation sources to targets:
```js
{
  source: 'lfo1',
  target: 'osc1.frequency',
  depth: 20,
  offset: 120  // base value
}
```

### 2.4 AtmosphereController (core/atmosphere.js)

Maps high-level atmosphere macros to detailed parameter adjustments.

**Inputs:** tension, instability, complexity (each 0.0–1.0)

**Mapping table:**
```
tension (0-1) →
  osc1.detune:       0 → 50 cents (dissonance)
  osc2.detune:       0 → -30 cents
  osc3.frequency:    base → base * (1 + tension * 0.3)
  lfo1.rate:         0.1 → 2.0 Hz
  lfo2.depth:        200 → 1500 Hz
  filter.Q:          base → base + tension * 15
  noise.gain:        0.05 → 0.3
  delay.feedback:    0.3 → 0.7

instability (0-1) →
  randomWalk1.stepSize:  0.5 → 3.0
  randomWalk2.stepSize:  0.5 → 3.0
  randomWalk3.stepSize:  0.3 → 2.0
  lfo1.rate:             base * (1 + instability * 0.5)
  masterGain modulation: depth 0 → 0.15
  randomWalk1.interval:  200 → 50ms

complexity (0-1) →
  osc1.gain:     0 → 0.4
  osc2.gain:     0 → 0.35
  osc3.gain:     0 → 0.3
  noise.gain:    base * (0.5 + complexity)
  delay.mix:     0 → 0.5
  reverb.mix:    0.1 → 0.4
  filter.freq modulation depth: 200 → 1200 Hz
```

**Processing:** When atmosphere values change, the controller interpolates
all mapped parameter targets using `linearRampToValueAtTime` for smooth
transitions.

### 2.5 EventEngine (core/events.js)

Handles discrete gameplay events and produces transient audio responses.

**Event → Audio Response mapping:**

Each event is defined as a sequence of parameter automations over time:

```js
const eventResponses = {
  portal: {
    duration: 2.0,  // seconds
    automations: [
      { param: 'filter.frequency', from: 400, to: 4000, time: 0.5, curve: 'exponential' },
      { param: 'filter.frequency', from: 4000, to: 400, time: 1.5, curve: 'exponential' },
      { param: 'filter.Q', from: 8, to: 25, time: 0.3, curve: 'linear' },
      { param: 'filter.Q', from: 25, to: 8, time: 1.7, curve: 'linear' },
      { param: 'osc1.detune', from: 0, to: 100, time: 1.0, curve: 'linear' },
      { param: 'osc1.detune', from: 100, to: 0, time: 1.0, curve: 'linear' },
      { param: 'delay.feedback', from: 0.4, to: 0.8, time: 0.3, curve: 'linear' },
      { param: 'delay.feedback', from: 0.8, to: 0.4, time: 1.7, curve: 'linear' },
    ]
  },
  collision: {
    duration: 0.5,
    automations: [
      { param: 'noise.gain', from: 0.1, to: 0.6, time: 0.05, curve: 'linear' },
      { param: 'noise.gain', from: 0.6, to: 0.1, time: 0.45, curve: 'exponential' },
      { param: 'filter.Q', from: 8, to: 40, time: 0.05, curve: 'linear' },
      { param: 'filter.Q', from: 40, to: 8, time: 0.45, curve: 'exponential' },
      { param: 'masterGain', from: 1.0, to: 0.7, time: 0.02, curve: 'linear' },
      { param: 'masterGain', from: 0.7, to: 1.0, time: 0.48, curve: 'exponential' },
    ]
  },
  // ... other events
};
```

**Execution:** Events schedule automations via Web Audio `setValueAtTime`
/ `linearRampToValueAtTime` / `exponentialRampToValueAtTime` — all
happening on the audio thread with zero JavaScript frame dependency.

**Concurrent events:** Multiple events can fire simultaneously.
Each event's automations are scheduled independently. However, conflicting
parameter changes are resolved by last-write-wins.

### 2.6 SeededRNG (core/rng.js)

Mulberry32 pseudorandom number generator.

```js
function createRNG(seed) {
  let state = seed | 0;
  return {
    next() {
      state = (state + 0x6D2B79F5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    reset(newSeed) {
      state = (newSeed !== undefined ? newSeed : seed) | 0;
    }
  };
}
```

**Properties:**
- Fast (no dependencies)
- Deterministic from seed
- Distribution sufficient for audio parameter variation
- `next()` returns float in [0.0, 1.0)

### 2.7 PresetManager (presets/preset-manager.js)

Handles preset serialization, deserialization, and storage.

**Storage backends (in priority order):**
1. localStorage (primary — fast, synchronous)
2. File system (export/import)
3. URL hash (sharing)

See [PRESET-SPEC.md](PRESET-SPEC.md) for the full preset format.

---

## 3. Data Flow

### 3.1 Initialization Flow

```
User gesture → new EchoEngine(config)
  → Create RNG(seed)
  → Create AudioContext
  → Build AudioGraph (create all nodes, connect)
  → Initialize ModulationEngine (create LFOs, walks)
  → Initialize AtmosphereController (apply initial macros)
  → Initialize EventEngine (load event definitions)
  → Apply initial preset / default parameters
  → Resume AudioContext
  → Start modulation loops (random walk intervals)
  → State = PLAYING
```

### 3.2 Runtime Data Flow

```
                    ┌──────────────┐
                    │   User /     │
                    │   Game /     │
                    │   Sound Lab  │
                    └──────┬───────┘
                           │
              setState() / triggerEvent()
                           │
                    ┌──────▼───────┐
                    │   Public API │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
        ┌─────▼─────┐ ┌───▼────┐ ┌────▼─────┐
        │ Atmosphere│ │ Event  │ │ Direct   │
        │ Controller│ │ Engine │ │ Param    │
        └─────┬─────┘ └───┬────┘ └────┬─────┘
              │            │            │
              └────────────┼────────────┘
                           │
                    ┌──────▼───────┐
                    │  Modulation  │
                    │  Engine      │
                    │  (LFOs +     │
                    │   Walks)     │
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │  Audio Graph │
                    │  (Web Audio) │
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │  Speakers /  │
                    │  Headphones  │
                    └──────────────┘
```

### 3.3 Session Startup Flow

```
newGame(seed?) →
  → If seed provided: RNG.reset(seed)
  → If auto-seed: seed = Date.now(), RNG.reset(seed)
  → Re-randomize initial parameter values using RNG
  → Reset all modulation walks to new starting positions
  → Reset atmosphere macros to default
  → Clear any active event automations
  → Start generation
```

---

## 4. AudioContext Lifecycle (Mobile-Critical)

```
┌─────────────────────────────────────────────────────┐
│                 AudioContext States                   │
│                                                      │
│  "suspended" ──(user gesture)──→ "running"           │
│       ↑                             │                │
│       │                             │                │
│       ├──(tab hidden)──────────────┤                │
│       │                             │                │
│       └──(tab visible + resume)────┘                │
│                                                      │
│  "closed" (engine.destroy())                         │
└─────────────────────────────────────────────────────┘
```

**Critical mobile considerations:**
1. AudioContext must be created and resumed within a user gesture handler
2. On iOS, `ctx.resume()` must be called in the gesture handler
3. `visibilitychange` event → suspend/resume AudioContext
4. All AudioNodes are created once and reused (no runtime node creation)
5. Random walk intervals use `setInterval` — cleared on suspend, restarted on resume

---

## 5. Performance Architecture

### 5.1 Zero-Frame Audio

All time-based audio parameter changes use Web Audio's native scheduling:
- `setValueAtTime()`
- `linearRampToValueAtTime()`
- `exponentialRampToValueAtTime()`
- `setTargetAtTime()`

These execute on the audio thread and are unaffected by JavaScript frame drops.

### 5.2 Limited JavaScript Timers

| Timer | Interval | Purpose | Cleared on |
|-------|----------|---------|------------|
| Random Walk 1 | 50–200ms | Update walk 1 value | Suspend / destroy |
| Random Walk 2 | 50–200ms | Update walk 2 value | Suspend / destroy |
| Random Walk 3 | 50–200ms | Update walk 3 value | Suspend / destroy |

**No `requestAnimationFrame` in the engine.** rAF is used only by the
Sound Lab visualizer (optional, can be disabled).

### 5.3 Node Reuse

All AudioNodes are created during initialization and never destroyed or
recreated during runtime. Parameter changes modify existing nodes.

### 5.4 Analyser for Visualization (Optional)

A single `AnalyserNode` is included in the graph for the Sound Lab
visualizer. It can be disconnected in production if visualization is
not needed (saves a small amount of CPU).

---

## 6. Threading Model

- **Audio thread:** Web Audio API native scheduling (LFOs, ramps, timing)
- **Main thread (JS):** Random walk updates (3 setInterval timers),
  event processing, API calls
- **No Web Workers or AudioWorklets in v1.0**
