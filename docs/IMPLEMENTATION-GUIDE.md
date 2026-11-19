# ECHO ENGINE — Implementation Guide

**Version:** 1.0  
**Target:** First working version (Phase 1 + Phase 2)

---

## 1. Implementation Order

Build in this order for fastest working result:

```
Step 1: Seeded RNG (rng.js)                   — 30 min
Step 2: Audio Graph builder (audio-graph.js)   — 2 hrs
Step 3: Modulation Engine (modulation.js)      — 2 hrs
Step 4: Atmosphere Controller (atmosphere.js)  — 1 hr
Step 5: Event Engine (events.js)               — 1 hr
Step 6: EchoEngine orchestrator (echo-engine.js) — 1 hr
Step 7: Preset Manager (preset-manager.js)     — 1 hr
Step 8: Sound Lab HTML/CSS (index.html, lab.css) — 3 hrs
Step 9: Sound Lab UI controller (app.js, ui.js) — 2 hrs
Step 10: Visualizer (visualizer.js)            — 1 hr
Step 11: Event Simulator (event-simulator.js)  — 30 min
Step 12: Preset UI integration                 — 1 hr
Step 13: PWA manifest + service worker          — 1 hr
Step 14: Testing + debugging                    — 2 hrs
                                           Total: ~18 hrs
```

---

## 2. Core Implementation Details

### 2.1 Seeded RNG (rng.js)

```js
export function createRNG(seed) {
  let state = seed | 0;
  return {
    next() {
      state = (state + 0x6D2B79F5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    nextRange(min, max) {
      return min + this.next() * (max - min);
    },
    nextInt(min, max) {
      return Math.floor(this.nextRange(min, max + 1));
    },
    reset(newSeed) {
      state = (newSeed !== undefined ? newSeed : seed) | 0;
    }
  };
}
```

---

### 2.2 Audio Graph Builder (audio-graph.js)

```js
export function buildAudioGraph(ctx) {
  const nodes = {};

  // === Oscillators ===
  nodes.osc1 = ctx.createOscillator();
  nodes.osc1.type = 'sawtooth';
  nodes.osc1.frequency.value = 120;

  nodes.osc2 = ctx.createOscillator();
  nodes.osc2.type = 'triangle';
  nodes.osc2.frequency.value = 180;

  nodes.osc3 = ctx.createOscillator();
  nodes.osc3.type = 'sine';
  nodes.osc3.frequency.value = 240;

  // === Oscillator Gains ===
  nodes.osc1Gain = ctx.createGain();
  nodes.osc1Gain.gain.value = 0.3;

  nodes.osc2Gain = ctx.createGain();
  nodes.osc2Gain.gain.value = 0.2;

  nodes.osc3Gain = ctx.createGain();
  nodes.osc3Gain.gain.value = 0.25;

  // === Noise Source (generated buffer) ===
  nodes.noise = ctx.createBufferSource();
  nodes.noise.buffer = generateNoiseBuffer(ctx, 'pink', 4);
  nodes.noise.loop = true;

  nodes.noiseFilter = ctx.createBiquadFilter();
  nodes.noiseFilter.type = 'bandpass';
  nodes.noiseFilter.frequency.value = 800;

  nodes.noiseGain = ctx.createGain();
  nodes.noiseGain.gain.value = 0.15;

  // === Main Filter ===
  nodes.filter = ctx.createBiquadFilter();
  nodes.filter.type = 'lowpass';
  nodes.filter.frequency.value = 1200;
  nodes.filter.Q.value = 8;

  nodes.postGain = ctx.createGain();
  nodes.postGain.gain.value = 1.0;

  // === Delay ===
  nodes.delay = ctx.createDelay(2.0);
  nodes.delay.delayTime.value = 0.3;

  nodes.delayFeedback = ctx.createGain();
  nodes.delayFeedback.gain.value = 0.4;

  nodes.delayMix = ctx.createGain();
  nodes.delayMix.gain.value = 0.3;

  // === Reverb ===
  nodes.reverb = ctx.createConvolver();
  nodes.reverb.buffer = generateReverbIR(ctx, 2.5, 2);

  nodes.reverbMix = ctx.createGain();
  nodes.reverbMix.gain.value = 0.2;

  // === Stereo Panner ===
  nodes.panner = ctx.createStereoPanner();
  nodes.panner.pan.value = 0;

  // === Master Gain ===
  nodes.masterGain = ctx.createGain();
  nodes.masterGain.gain.value = 0.7;

  // === Analyser ===
  nodes.analyser = ctx.createAnalyser();
  nodes.analyser.fftSize = 2048;

  // === LFOs ===
  nodes.lfo1 = ctx.createOscillator();
  nodes.lfo1.type = 'sine';
  nodes.lfo1.frequency.value = 0.1;
  nodes.lfo1Depth = ctx.createGain();
  nodes.lfo1Depth.gain.value = 20;

  nodes.lfo2 = ctx.createOscillator();
  nodes.lfo2.type = 'triangle';
  nodes.lfo2.frequency.value = 0.05;
  nodes.lfo2Depth = ctx.createGain();
  nodes.lfo2Depth.gain.value = 500;

  nodes.lfo3 = ctx.createOscillator();
  nodes.lfo3.type = 'sine';
  nodes.lfo3.frequency.value = 0.02;
  nodes.lfo3Depth = ctx.createGain();
  nodes.lfo3Depth.gain.value = 0.8;

  // === Connections ===
  // Sources → mix
  nodes.osc1.connect(nodes.osc1Gain);
  nodes.osc2.connect(nodes.osc2Gain);
  nodes.osc3.connect(nodes.osc3Gain);
  nodes.noise.connect(nodes.noiseFilter);
  nodes.noiseFilter.connect(nodes.noiseGain);

  // Mix bus: connect all source gains to filter
  nodes.osc1Gain.connect(nodes.filter);
  nodes.osc2Gain.connect(nodes.filter);
  nodes.osc3Gain.connect(nodes.filter);
  nodes.noiseGain.connect(nodes.filter);

  // Filter → post gain
  nodes.filter.connect(nodes.postGain);

  // Post gain → delay (wet) and direct (dry)
  nodes.postGain.connect(nodes.delayMix); // wet
  nodes.postGain.connect(nodes.panner);    // dry

  // Delay feedback loop
  nodes.postGain.connect(nodes.delay);
  nodes.delay.connect(nodes.delayFeedback);
  nodes.delayFeedback.connect(nodes.delay);
  nodes.delay.connect(nodes.delayMix);

  // Delay mix → reverb
  nodes.delayMix.connect(nodes.reverbMix);

  // Reverb (wet) and delay mix (dry-ish) → panner
  nodes.reverbMix.connect(nodes.panner);

  // Panner → master → analyser → destination
  nodes.panner.connect(nodes.masterGain);
  nodes.masterGain.connect(nodes.analyser);
  nodes.analyser.connect(ctx.destination);

  // LFO connections (initial routing)
  nodes.lfo1.connect(nodes.lfo1Depth);
  nodes.lfo2.connect(nodes.lfo2Depth);
  nodes.lfo3.connect(nodes.lfo3Depth);

  // Default LFO targets
  nodes.lfo1Depth.connect(nodes.osc1.frequency);
  nodes.lfo2Depth.connect(nodes.filter.frequency);
  nodes.lfo3Depth.connect(nodes.panner.pan);

  // Start oscillators and LFOs
  nodes.osc1.start();
  nodes.osc2.start();
  nodes.osc3.start();
  nodes.noise.start();
  nodes.lfo1.start();
  nodes.lfo2.start();
  nodes.lfo3.start();

  return nodes;
}

// === Noise Buffer Generator ===
function generateNoiseBuffer(ctx, type, duration) {
  const length = ctx.sampleRate * duration;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  if (type === 'white') {
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
  } else if (type === 'pink') {
    // Paul Kellet's refined pink noise algorithm
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }
  }
  return buffer;
}

// === Procedural Reverb IR Generator ===
function generateReverbIR(ctx, decay, channels) {
  const length = ctx.sampleRate * decay;
  const buffer = ctx.createBuffer(channels, length, ctx.sampleRate);

  for (let ch = 0; ch < channels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return buffer;
}
```

---

### 2.3 Modulation Engine (modulation.js)

```js
export class ModulationEngine {
  constructor(ctx, nodes, rng) {
    this.ctx = ctx;
    this.nodes = nodes;
    this.rng = rng;
    this.walks = [];
    this.walkTimers = [];
  }

  // === LFO Configuration ===
  configureLFO(lfoNum, { waveform, rate, depth, target }) {
    const lfo = this.nodes[`lfo${lfoNum}`];
    const lfoDepth = this.nodes[`lfo${lfoNum}Depth`];

    lfo.type = waveform;
    lfo.frequency.value = rate;
    lfoDepth.gain.value = depth;

    // Reconnect LFO to target
    lfoDepth.disconnect();
    const targetParam = this.resolveTarget(target);
    if (targetParam) {
      lfoDepth.connect(targetParam);
    }
  }

  // === Random Walk Configuration ===
  configureWalk(walkNum, { target, min, max, stepSize, interval, smoothing }) {
    const walk = {
      target,
      targetParam: this.resolveTarget(target),
      min, max, stepSize,
      smoothing,
      current: min + (max - min) * 0.5
    };

    this.walks[walkNum] = walk;

    // Clear existing timer
    if (this.walkTimers[walkNum]) {
      clearInterval(this.walkTimers[walkNum]);
    }

    // Start walk timer
    this.walkTimers[walkNum] = setInterval(() => {
      this.updateWalk(walk);
    }, interval);
  }

  updateWalk(walk) {
    if (!walk.targetParam) return;

    const step = (this.rng.next() * 2 - 1) * walk.stepSize;
    walk.current = Math.max(walk.min, Math.min(walk.max, walk.current + step));
    walk.targetParam.setTargetAtTime(walk.current, this.ctx.currentTime, walk.smoothing);
  }

  // === Resolve parameter path to AudioParam ===
  resolveTarget(path) {
    const map = {
      'osc1.frequency': this.nodes.osc1.frequency,
      'osc2.frequency': this.nodes.osc2.frequency,
      'osc3.frequency': this.nodes.osc3.frequency,
      'osc1.detune': this.nodes.osc1.detune,
      'osc2.detune': this.nodes.osc2.detune,
      'osc3.detune': this.nodes.osc3.detune,
      'osc1.gain': this.nodes.osc1Gain.gain,
      'osc2.gain': this.nodes.osc2Gain.gain,
      'osc3.gain': this.nodes.osc3Gain.gain,
      'filter.frequency': this.nodes.filter.frequency,
      'filter.Q': this.nodes.filter.Q,
      'noise.gain': this.nodes.noiseGain.gain,
      'delay.time': this.nodes.delay.delayTime,
      'delay.feedback': this.nodes.delayFeedback.gain,
      'delay.mix': this.nodes.delayMix.gain,
      'reverb.mix': this.nodes.reverbMix.gain,
      'panner.pan': this.nodes.panner.pan,
      'masterGain': this.nodes.masterGain.gain,
    };
    return map[path] || null;
  }

  // === Set LFO rate dynamically ===
  setLFORate(lfoNum, rate) {
    const lfo = this.nodes[`lfo${lfoNum}`];
    lfo.frequency.setTargetAtTime(rate, this.ctx.currentTime, 0.1);
  }

  // === Cleanup ===
  destroy() {
    this.walkTimers.forEach(t => clearInterval(t));
    this.walkTimers = [];
  }
}
```

---

### 2.4 Atmosphere Controller (atmosphere.js)

```js
export class AtmosphereController {
  constructor(ctx, nodes, modulation) {
    this.ctx = ctx;
    this.nodes = nodes;
    this.modulation = modulation;
    this.current = { tension: 0, instability: 0, complexity: 0 };
    this.rampTime = 0.5; // seconds for smooth transitions
  }

  setAtmosphere(tension, instability, complexity) {
    this.current = {
      tension: this.clamp(tension, 0, 1),
      instability: this.clamp(instability, 0, 1),
      complexity: this.clamp(complexity, 0, 1)
    };
    this.apply();
  }

  apply() {
    const { tension, instability, complexity } = this.current;
    const t = this.ctx.currentTime;
    const r = this.rampTime;

    // === Tension mapping ===
    this.rampParam(this.nodes.osc1.detune, tension * 50, t, r);
    this.rampParam(this.nodes.osc2.detune, -tension * 30, t, r);
    this.rampParam(this.nodes.filter.Q, 8 + tension * 15, t, r);
    this.rampParam(this.nodes.noiseGain.gain, 0.05 + tension * 0.25, t, r);
    this.rampParam(this.nodes.delayFeedback.gain, 0.3 + tension * 0.4, t, r);

    // === Instability mapping ===
    // Adjust random walk step sizes
    if (this.modulation.walks[0]) {
      this.modulation.walks[0].stepSize = 0.5 + instability * 2.5;
    }
    if (this.modulation.walks[1]) {
      this.modulation.walks[1].stepSize = 0.5 + instability * 2.5;
    }

    // === Complexity mapping ===
    this.rampParam(this.nodes.osc1Gain.gain, 0.1 + complexity * 0.3, t, r);
    this.rampParam(this.nodes.osc2Gain.gain, 0.05 + complexity * 0.3, t, r);
    this.rampParam(this.nodes.osc3Gain.gain, 0.0 + complexity * 0.3, t, r);
    this.rampParam(this.nodes.delayMix.gain, 0.1 + complexity * 0.4, t, r);
    this.rampParam(this.nodes.reverbMix.gain, 0.1 + complexity * 0.3, t, r);
  }

  rampParam(param, value, time, rampTime) {
    param.linearRampToValueAtTime(value, time + rampTime);
  }

  clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }
}
```

---

### 2.5 Event Engine (events.js)

```js
export class EventEngine {
  constructor(ctx, nodes) {
    this.ctx = ctx;
    this.nodes = nodes;
    this.definitions = this.buildDefinitions();
  }

  buildDefinitions() {
    return {
      portal: {
        duration: 2.0,
        automations: [
          { param: 'filter.frequency', from: 400, to: 4000, time: 0.5 },
          { param: 'filter.frequency', from: 4000, to: 400, time: 1.5, after: 0.5 },
          { param: 'filter.Q', from: 8, to: 25, time: 0.3 },
          { param: 'filter.Q', from: 25, to: 8, time: 1.7, after: 0.3 },
          { param: 'delay.feedback', from: 0.4, to: 0.8, time: 0.3 },
          { param: 'delay.feedback', from: 0.8, to: 0.4, time: 1.7, after: 0.3 },
        ]
      },
      collision: {
        duration: 0.5,
        automations: [
          { param: 'noise.gain', from: 0.15, to: 0.6, time: 0.05 },
          { param: 'noise.gain', from: 0.6, to: 0.15, time: 0.45, after: 0.05 },
          { param: 'filter.Q', from: 8, to: 40, time: 0.05 },
          { param: 'filter.Q', from: 40, to: 8, time: 0.45, after: 0.05 },
          { param: 'masterGain', from: 0.7, to: 0.4, time: 0.02 },
          { param: 'masterGain', from: 0.4, to: 0.7, time: 0.48, after: 0.02 },
        ]
      },
      gameOver: {
        duration: 4.0,
        automations: [
          { param: 'filter.frequency', from: 1200, to: 100, time: 3.5 },
          { param: 'filter.Q', from: 8, to: 2, time: 3.5 },
          { param: 'reverb.mix', from: 0.2, to: 0.8, time: 2.0 },
          { param: 'delay.feedback', from: 0.4, to: 0.85, time: 2.5 },
          { param: 'noise.gain', from: 0.15, to: 0.05, time: 3.0 },
        ]
      },
      danger: {
        duration: 1.5,
        automations: [
          { param: 'osc1.detune', from: 0, to: 35, time: 0.5 },
          { param: 'osc1.detune', from: 35, to: 0, time: 1.0, after: 0.5 },
          { param: 'osc2.detune', from: -5, to: -25, time: 0.5 },
          { param: 'osc2.detune', from: -25, to: -5, time: 1.0, after: 0.5 },
          { param: 'noise.gain', from: 0.15, to: 0.35, time: 0.3 },
          { param: 'noise.gain', from: 0.35, to: 0.15, time: 1.2, after: 0.3 },
        ]
      },
      nearMiss: {
        duration: 0.8,
        automations: [
          { param: 'filter.Q', from: 8, to: 20, time: 0.1 },
          { param: 'filter.Q', from: 20, to: 8, time: 0.7, after: 0.1 },
          { param: 'noise.gain', from: 0.15, to: 0.3, time: 0.05 },
          { param: 'noise.gain', from: 0.3, to: 0.15, time: 0.75, after: 0.05 },
        ]
      },
      pass: {
        duration: 1.5,
        automations: [
          { param: 'filter.frequency', from: 1200, to: 800, time: 1.0 },
          { param: 'filter.frequency', from: 800, to: 1200, time: 0.5, after: 1.0 },
          { param: 'delay.mix', from: 0.3, to: 0.15, time: 1.0 },
          { param: 'delay.mix', from: 0.15, to: 0.3, time: 0.5, after: 1.0 },
        ]
      },
    };
  }

  trigger(eventName, options = {}) {
    const def = this.definitions[eventName];
    if (!def) return;

    const intensity = options.intensity || 1.0;
    const t = this.ctx.currentTime;

    def.automations.forEach(aut => {
      const param = this.resolveParam(aut.param);
      if (!param) return;

      const startTime = t + (aut.after || 0);
      const scaledFrom = aut.from;
      const scaledTo = aut.from + (aut.to - aut.from) * intensity;

      param.setValueAtTime(scaledFrom, startTime);
      param.linearRampToValueAtTime(scaledTo, startTime + aut.time);
    });
  }

  resolveParam(path) {
    const map = {
      'filter.frequency': this.nodes.filter.frequency,
      'filter.Q': this.nodes.filter.Q,
      'noise.gain': this.nodes.noiseGain.gain,
      'masterGain': this.nodes.masterGain.gain,
      'delay.feedback': this.nodes.delayFeedback.gain,
      'delay.mix': this.nodes.delayMix.gain,
      'reverb.mix': this.nodes.reverbMix.gain,
      'osc1.detune': this.nodes.osc1.detune,
      'osc2.detune': this.nodes.osc2.detune,
    };
    return map[path] || null;
  }
}
```

---

### 2.6 EchoEngine Main Class (echo-engine.js)

```js
import { createRNG } from './core/rng.js';
import { buildAudioGraph } from './core/audio-graph.js';
import { ModulationEngine } from './core/modulation.js';
import { AtmosphereController } from './core/atmosphere.js';
import { EventEngine } from './core/events.js';

export class EchoEngine {
  constructor(config = {}) {
    this.config = {
      seed: config.seed || Date.now(),
      volume: config.volume ?? 0.7,
      analyser: config.analyser ?? true,
    };

    this.state = 'idle';
    this.ctx = null;
    this.nodes = null;
    this.rng = null;
    this.modulation = null;
    this.atmosphere = null;
    this.events = null;
    this.gameStates = {};
    this.callbacks = {};
  }

  async start() {
    if (this.state === 'playing') return;
    if (this.state === 'destroyed') throw new Error('Engine destroyed');

    this.state = 'starting';

    // Create AudioContext (must be called from user gesture)
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    await this.ctx.resume();

    if (!this.nodes) {
      // Initialize RNG
      this.rng = createRNG(this.config.seed);

      // Build audio graph
      this.nodes = buildAudioGraph(this.ctx);

      // Initialize modulation
      this.modulation = new ModulationEngine(this.ctx, this.nodes, this.rng);
      this.modulation.configureLFO(1, { waveform: 'sine', rate: 0.1, depth: 20, target: 'osc1.frequency' });
      this.modulation.configureLFO(2, { waveform: 'triangle', rate: 0.05, depth: 500, target: 'filter.frequency' });
      this.modulation.configureLFO(3, { waveform: 'sine', rate: 0.02, depth: 0.8, target: 'panner.pan' });

      this.modulation.configureWalk(0, { target: 'filter.Q', min: 2, max: 20, stepSize: 1, interval: 100, smoothing: 0.1 });
      this.modulation.configureWalk(1, { target: 'filter.frequency', min: 400, max: 3000, stepSize: 150, interval: 200, smoothing: 0.2 });
      this.modulation.configureWalk(2, { target: 'masterGain', min: 0.5, max: 1, stepSize: 0.05, interval: 150, smoothing: 0.15 });

      // Initialize atmosphere
      this.atmosphere = new AtmosphereController(this.ctx, this.nodes, this.modulation);
      this.atmosphere.setAtmosphere(0.3, 0.4, 0.5);

      // Initialize events
      this.events = new EventEngine(this.ctx, this.nodes);

      // Set master volume
      this.nodes.masterGain.gain.value = this.config.volume;
    }

    this.state = 'playing';
    this.emit('started');
  }

  stop() {
    if (this.ctx && this.state === 'playing') {
      this.ctx.suspend();
      this.state = 'suspended';
      this.emit('stopped');
    }
  }

  destroy() {
    if (this.modulation) this.modulation.destroy();
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }
    this.nodes = null;
    this.state = 'destroyed';
  }

  // === Atmosphere ===
  setAtmosphere(tension, instability, complexity) {
    if (this.atmosphere) this.atmosphere.setAtmosphere(tension, instability, complexity);
  }

  setTension(v) {
    this.setAtmosphere(v, this.atmosphere?.current.instability ?? 0.4, this.atmosphere?.current.complexity ?? 0.5);
  }

  setInstability(v) {
    this.setAtmosphere(this.atmosphere?.current.tension ?? 0.3, v, this.atmosphere?.current.complexity ?? 0.5);
  }

  setComplexity(v) {
    this.setAtmosphere(this.atmosphere?.current.tension ?? 0.3, this.atmosphere?.current.instability ?? 0.4, v);
  }

  getAtmosphere() {
    return this.atmosphere ? { ...this.atmosphere.current } : null;
  }

  // === Game State ===
  setState(key, value) {
    this.gameStates[key] = value;
    // Map game states to atmosphere
    if (key === 'tension') this.setTension(value);
    if (key === 'progress') this.setComplexity(0.3 + value * 0.7);
    if (key === 'proximity') this.setTension(0.1 + value * 0.9);
    if (key === 'danger') {
      this.setTension(0.2 + value * 0.8);
      this.setInstability(0.2 + value * 0.6);
    }
  }

  getState(key) {
    return this.gameStates[key] ?? 0;
  }

  // === Events ===
  triggerEvent(name, options) {
    if (this.events) this.events.trigger(name, options);
    this.emit('eventTriggered', { name, options });
  }

  // === Direct Parameters ===
  setParam(path, value) {
    if (this.modulation) {
      const param = this.modulation.resolveTarget(path);
      if (param) {
        param.setTargetAtTime(value, this.ctx.currentTime, 0.05);
      }
    }
  }

  getParam(path) {
    if (this.modulation) {
      const param = this.modulation.resolveTarget(path);
      return param ? param.value : null;
    }
    return null;
  }

  setParamType(path, type) {
    if (!this.nodes) return;
    const map = {
      'osc1.waveform': () => this.nodes.osc1.type = type,
      'osc2.waveform': () => this.nodes.osc2.type = type,
      'osc3.waveform': () => this.nodes.osc3.type = type,
      'filter.type': () => this.nodes.filter.type = type,
      'noise.type': () => {
        this.nodes.noise.buffer = generateNoiseBuffer(this.ctx, type, 4);
      },
      'lfo1.waveform': () => this.nodes.lfo1.type = type,
      'lfo2.waveform': () => this.nodes.lfo2.type = type,
      'lfo3.waveform': () => this.nodes.lfo3.type = type,
    };
    if (map[path]) map[path]();
  }

  // === Volume ===
  setVolume(v) {
    this.config.volume = Math.max(0, Math.min(1, v));
    if (this.nodes) {
      this.nodes.masterGain.gain.setTargetAtTime(this.config.volume, this.ctx.currentTime, 0.05);
    }
  }

  getVolume() {
    return this.config.volume;
  }

  // === Seed ===
  getSeed() {
    return this.config.seed;
  }

  setSeed(seed) {
    this.config.seed = seed;
    if (this.rng) this.rng.reset(seed);
    this.emit('seedChanged', { seed });
  }

  reseed(seed) {
    const s = seed || Date.now();
    this.setSeed(s);
  }

  // === Presets ===
  savePreset(name) {
    return {
      version: '1.0',
      name: name || 'Untitled',
      seed: this.config.seed,
      // ... capture all parameters from nodes and modulation
      // (see PRESET-SPEC.md for full format)
    };
  }

  loadPreset(preset) {
    if (!this.nodes) return;
    // Apply all preset parameters
    // ... (implement per PRESET-SPEC.md)
    this.emit('presetLoaded', { name: preset.name });
  }

  // === Utility ===
  getAnalyser() {
    return this.nodes?.analyser || null;
  }

  getAudioContext() {
    return this.ctx;
  }

  isRunning() {
    return this.state === 'playing';
  }

  onEvent(callback) {
    this.callbacks.event = callback;
  }

  emit(event, data) {
    if (this.callbacks.event) {
      this.callbacks.event(event, data || {});
    }
  }
}
```

---

## 3. Sound Lab Application (lab/)

### 3.1 index.html Structure

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no, viewport-fit=cover">
  <meta name="theme-color" content="#ff8c00">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <title>Echo Engine Sound Lab</title>
  <link rel="manifest" href="manifest.json">
  <link rel="stylesheet" href="css/lab.css">
</head>
<body>
  <!-- Audio unlock overlay -->
  <div id="unlock-overlay" class="overlay">
    <div class="unlock-content">
      <div class="unlock-icon">🔊</div>
      <p>Tap to enable audio</p>
    </div>
  </div>

  <!-- App -->
  <div id="app" class="app">
    <!-- Top bar -->
    <header class="top-bar">
      <h1>☠ ECHO LAB</h1>
      <div class="seed-display">
        <span class="seed-icon">🎲</span>
        <span class="seed-label">Seed:</span>
        <span id="seed-value">42</span>
      </div>
    </header>

    <!-- Visualizer -->
    <div class="visualizer-area">
      <canvas id="visualizer"></canvas>
      <button id="viz-toggle" class="viz-toggle">📊</button>
    </div>

    <!-- Status bar -->
    <div class="status-bar">
      <div class="status-left">
        <span id="status-indicator" class="status-dot"></span>
        <span id="status-text">STOPPED</span>
      </div>
      <div class="status-right">
        <span id="volume-display">Vol: 70%</span>
      </div>
    </div>

    <!-- Tab content area (scrollable) -->
    <main class="content-area" id="content-area">
      <!-- Content changes per tab -->
    </main>

    <!-- Action buttons -->
    <div class="action-bar">
      <button id="btn-play" class="btn btn-play">▶ Play</button>
      <button id="btn-stop" class="btn btn-stop">⏹ Stop</button>
      <button id="btn-new" class="btn">🎲 New</button>
    </div>

    <!-- Bottom navigation -->
    <nav class="bottom-nav">
      <button class="nav-btn active" data-tab="gen">
        <span class="nav-icon">⚙</span>
        <span class="nav-label">GEN</span>
      </button>
      <button class="nav-btn" data-tab="mod">
        <span class="nav-icon">🎛</span>
        <span class="nav-label">MOD</span>
      </button>
      <button class="nav-btn" data-tab="src">
        <span class="nav-icon">🔊</span>
        <span class="nav-label">SRC</span>
      </button>
      <button class="nav-btn" data-tab="evt">
        <span class="nav-icon">🎮</span>
        <span class="nav-label">EVT</span>
      </button>
      <button class="nav-btn" data-tab="prst">
        <span class="nav-icon">💾</span>
        <span class="nav-label">PRST</span>
      </button>
    </nav>
  </div>

  <script type="module" src="js/app.js"></script>
</body>
</html>
```

### 3.2 Key CSS Patterns (lab.css)

```css
/* === Reset & Base === */
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

:root {
  --bg: #0a0a0f;
  --surface: #141419;
  --surface-elevated: #1c1c24;
  --text: #e0e0e6;
  --text-secondary: #808090;
  --accent: #ff8c00;
  --accent-light: #ffaa33;
  --danger: #ff3344;
  --track: #2a2a35;
  --border: #222230;
  --waveform: #00ff88;

  --top-bar-h: 56px;
  --status-bar-h: 40px;
  --action-bar-h: 48px;
  --nav-h: 56px;
  --safe-bottom: env(safe-area-inset-bottom, 0px);
}

html, body {
  height: 100%;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--bg);
  color: var(--text);
  -webkit-font-smoothing: antialiased;
  user-select: none;
  -webkit-user-select: none;
  touch-action: manipulation;
}

/* === App Layout === */
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh;
  padding-bottom: var(--safe-bottom);
}

/* === Touch Slider === */
.param-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  padding: 8px 16px;
  gap: 8px;
}

.param-label {
  flex: 1;
  font-size: 13px;
  font-weight: 500;
}

.param-value {
  font-size: 13px;
  font-family: monospace;
  color: var(--accent);
  min-width: 60px;
  text-align: right;
}

.param-slider {
  flex-basis: 100%;
  -webkit-appearance: none;
  appearance: none;
  height: 44px;
  background: transparent;
  cursor: pointer;
}

.param-slider::-webkit-slider-runnable-track {
  height: 8px;
  border-radius: 4px;
  background: var(--track);
}

.param-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--accent);
  margin-top: -6px;
  border: 2px solid var(--bg);
}

.param-slider::-moz-range-track {
  height: 8px;
  border-radius: 4px;
  background: var(--track);
}

.param-slider::-moz-range-thumb {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--accent);
  border: 2px solid var(--bg);
}

/* === Segmented Control === */
.segmented {
  display: flex;
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}

.segmented button {
  flex: 1;
  padding: 10px 12px;
  background: var(--surface);
  border: none;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.segmented button.active {
  background: var(--accent);
  color: var(--bg);
  font-weight: 600;
}

/* === Action Buttons === */
.action-bar {
  display: flex;
  gap: 8px;
  padding: 8px 16px;
  background: var(--surface);
  border-top: 1px solid var(--border);
}

.btn {
  flex: 1;
  height: 48px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-elevated);
  color: var(--text);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.btn:active {
  background: var(--accent);
  color: var(--bg);
}

.btn-play { border-color: var(--accent); color: var(--accent); }
.btn-stop { border-color: var(--danger); color: var(--danger); }

/* === Bottom Nav === */
.bottom-nav {
  display: flex;
  height: var(--nav-h);
  background: var(--surface);
  border-top: 1px solid var(--border);
}

.nav-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  gap: 2px;
  padding: 4px 0;
}

.nav-btn.active {
  color: var(--accent);
}

.nav-btn.active::before {
  content: '';
  position: absolute;
  top: 0;
  width: 40%;
  height: 2px;
  background: var(--accent);
  border-radius: 1px;
}

.nav-icon { font-size: 20px; }
.nav-label { font-size: 10px; font-weight: 500; }

/* === Visualizer === */
.visualizer-area {
  position: relative;
  height: 25vh;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}

.visualizer-area canvas {
  width: 100%;
  height: 100%;
}

.viz-toggle {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--surface-elevated);
  border: 1px solid var(--border);
  color: var(--text);
  cursor: pointer;
  font-size: 16px;
}

/* === Event Buttons Grid === */
.event-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  padding: 16px;
}

.event-btn {
  height: 56px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface-elevated);
  color: var(--text);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all 0.15s;
}

.event-btn:active {
  background: var(--accent);
  color: var(--bg);
  transform: scale(0.97);
}

/* === Preset List === */
.preset-list {
  padding: 8px 16px;
}

.preset-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--surface-elevated);
  border: 1px solid var(--border);
  border-radius: 8px;
  margin-bottom: 8px;
}

.preset-item .preset-name {
  font-size: 14px;
  font-weight: 500;
}

.preset-item .preset-load-btn {
  padding: 8px 16px;
  border: 1px solid var(--accent);
  border-radius: 6px;
  background: transparent;
  color: var(--accent);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

/* === Overlay === */
.overlay {
  position: fixed;
  inset: 0;
  background: var(--bg);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.unlock-icon { font-size: 48px; margin-bottom: 16px; }
.unlock-content { text-align: center; font-size: 18px; }
```

---

## 4. PWA Service Worker (sw.js)

```js
const CACHE_NAME = 'echo-lab-v1';
const ASSETS = [
  '/',
  '/lab/index.html',
  '/lab/css/lab.css',
  '/lab/js/app.js',
  '/lab/js/ui.js',
  '/lab/js/visualizer.js',
  '/src/echo-engine.js',
  '/src/core/rng.js',
  '/src/core/audio-graph.js',
  '/src/core/modulation.js',
  '/src/core/atmosphere.js',
  '/src/core/events.js',
  '/src/presets/preset-manager.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then(res => res || fetch(e.request))
  );
});
```

---

## 5. Testing Checklist

### Audio Engine
- [ ] AudioContext creates and resumes on user gesture
- [ ] All 3 oscillators produce sound at configured frequencies
- [ ] Noise generator produces white and pink noise
- [ ] Main filter responds to frequency and Q changes
- [ ] All 3 LFOs modulate their targets at configured rates
- [ ] All 3 random walks update and modulate their targets
- [ ] Delay effect produces audible echo with feedback
- [ ] Reverb effect produces audible room ambience
- [ ] Stereo panning works (left/right shift)
- [ ] Master volume controls output level
- [ ] Atmosphere macros affect multiple parameters simultaneously
- [ ] Each event produces a distinct audible response
- [ ] Game state changes modulate the soundscape

### Session Variation
- [ ] Different seeds produce different initial parameter values
- [ ] Same seed produces identical (or near-identical) output
- [ ] Extended playback (10 min) shows no obvious repetition

### Sound Lab
- [ ] Audio unlock overlay appears and dismisses correctly
- [ ] Play/Stop buttons work correctly
- [ ] All tabs render correct controls
- [ ] Sliders update engine parameters in real-time
- [ ] Segmented controls change oscillator waveforms
- [ ] Visualizer shows waveform and spectrum
- [ ] Event buttons trigger audible responses
- [ ] Atmosphere sliders work
- [ ] Preset save stores to localStorage
- [ ] Preset load restores all parameters
- [ ] Preset export downloads JSON file
- [ ] Preset import loads from file

### Mobile
- [ ] App fits on phone screen without page scrolling
- [ ] Touch targets are ≥ 44×44px
- [ ] Audio starts after tap (iOS Safari)
- [ ] Audio resumes after tab switch
- [ ] Performance is smooth (< 5% CPU)
- [ ] Works in portrait orientation

### Desktop
- [ ] Responsive layout on large screens
- [ ] Keyboard navigation works
- [ ] Hover states visible

---

## 6. Browser Compatibility Notes

| Feature | Fallback |
|---------|----------|
| `AudioContext` | Use `webkitAudioContext` prefix |
| `StereoPannerNode` | Not available on very old Safari — use two GainNodes |
| `ConvolverNode` | Fully supported |
| `createBufferSource` with pink noise | Fully supported |
| CSS `env()` for safe area | Graceful degradation (0px) |
| CSS `height: 100dvh` | Fallback to `100vh` |

---

## 7. Performance Budget

| Metric | Target | Measurement |
|--------|--------|-------------|
| Engine JS size | < 30 KB gzipped | Bundle analyzer |
| Lab JS size | < 20 KB gzipped | Bundle analyzer |
| Total CSS | < 15 KB gzipped | Bundle analyzer |
| Audio graph nodes | < 30 nodes | DevTools |
| JS timers | 3 (walk intervals) | Manual |
| Audio startup | < 200ms after gesture | Performance API |
| CPU usage (steady state) | < 5% on mid-range mobile | DevTools profiler |
| Memory | < 20 MB | DevTools memory |
