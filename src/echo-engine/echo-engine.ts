import {
  type AudioGraphNodes,
  buildAudioGraph,
  generateNoiseBuffer,
  generateReverbIR,
} from './core/audio-graph';
import { AtmosphereController } from './core/atmosphere';
import { EventEngine } from './core/events';
import { ModulationEngine } from './core/modulation';
import { createRNG, type SeededRNG } from './core/rng';
import { BUILT_IN_PRESETS } from './presets/defaults';
import { validateAndNormalizePreset } from './presets/preset-manager';
import type {
  AtmosphereState,
  EchoEngineConfig,
  EngineCallback,
  EngineEventName,
  EngineState,
  EventName,
  EventOptions,
  FilterType,
  LFOConfig,
  ModulationTarget,
  NoiseFilterType,
  NoiseType,
  OscillatorWaveform,
  Preset,
  RandomWalkConfig,
} from './types';

export class EchoEngine {
  private config: {
    seed: number;
    volume: number;
    analyser: boolean;
  };
  private engineState: EngineState = 'idle';
  private ctx: AudioContext | null = null;
  private nodes: AudioGraphNodes | null = null;
  private rng: SeededRNG;
  private modulation: ModulationEngine | null = null;
  private atmosphere: AtmosphereController | null = null;
  private events: EventEngine | null = null;
  private gameStates: Record<string, number> = {
    tension: 0.3,
    progress: 0.0,
    proximity: 0.0,
    danger: 0.0,
  };
  private callbacks: EngineCallback[] = [];
  private activePreset: Preset;
  private wasPlayingBeforeHide = false;
  private visibilityHandler: (() => void) | null = null;

  constructor(config: EchoEngineConfig = {}) {
    const initialPreset = config.preset
      ? validateAndNormalizePreset(config.preset)
      : structuredClone(BUILT_IN_PRESETS[0]);

    const seed = config.seed ?? initialPreset.seed ?? (Date.now() % 100000);
    initialPreset.seed = seed;

    this.config = {
      seed,
      volume: config.volume ?? initialPreset.master.gain ?? 0.7,
      analyser: config.analyser ?? true,
    };

    initialPreset.master.gain = this.config.volume;
    this.activePreset = initialPreset;
    this.rng = createRNG(seed);

    this.setupVisibilityListener();

    if (config.autoStart) {
      void this.start().catch(() => {
        // Auto-start may fail before user gesture; handled gracefully
      });
    }
  }

  private setupVisibilityListener(): void {
    if (typeof document === 'undefined') return;
    this.visibilityHandler = () => {
      if (document.hidden) {
        if (this.engineState === 'playing') {
          this.wasPlayingBeforeHide = true;
          this.stop();
        }
      } else if (this.wasPlayingBeforeHide && this.engineState === 'suspended') {
        this.wasPlayingBeforeHide = false;
        void this.start().catch(() => {
          // Some mobile browsers require fresh gesture after long background
        });
      }
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  async start(): Promise<void> {
    if (this.engineState === 'playing') return;
    if (this.engineState === 'destroyed') {
      throw new Error('EchoEngine has been destroyed');
    }

    this.setEngineState('starting');

    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }

    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    if (!this.nodes) {
      this.rng.reset(this.config.seed);
      this.nodes = buildAudioGraph(this.ctx, this.config.analyser, this.rng);
      this.modulation = new ModulationEngine(this.ctx, this.nodes, this.rng);
      this.atmosphere = new AtmosphereController(this.ctx, this.nodes, this.modulation);
      this.events = new EventEngine(this.ctx, this.nodes);
      this.applyPresetToGraph(this.activePreset);
    } else {
      this.modulation?.resume();
    }

    this.setEngineState('playing');
    this.emit('started', { seed: this.config.seed });
  }

  stop(): void {
    if (this.ctx && this.engineState === 'playing') {
      this.modulation?.pause();
      void this.ctx.suspend();
      this.setEngineState('suspended');
      this.emit('stopped', {});
    }
  }

  destroy(): void {
    if (this.visibilityHandler && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
    this.modulation?.destroy();
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
    this.nodes = null;
    this.modulation = null;
    this.atmosphere = null;
    this.events = null;
    this.setEngineState('destroyed');
  }

  getState(): EngineState;
  getState(key: string): number;
  getState(key?: string): EngineState | number {
    if (key !== undefined) {
      return this.gameStates[key] ?? 0;
    }
    return this.engineState;
  }

  private setEngineState(next: EngineState): void {
    if (this.engineState !== next) {
      this.engineState = next;
      this.emit('stateChange', { state: next });
    }
  }

  // === Atmosphere Controls ===

  setAtmosphere(tension: number, instability: number, complexity: number): void {
    const clamped = {
      tension: Math.max(0, Math.min(1, tension)),
      instability: Math.max(0, Math.min(1, instability)),
      complexity: Math.max(0, Math.min(1, complexity)),
    };
    this.activePreset.atmosphere = { ...clamped };
    if (this.atmosphere) {
      this.atmosphere.setAtmosphere(clamped.tension, clamped.instability, clamped.complexity, true);
      this.syncActivePresetFromNodes();
    }
  }

  setTension(value: number): void {
    const a = this.activePreset.atmosphere;
    this.setAtmosphere(value, a.instability, a.complexity);
  }

  setInstability(value: number): void {
    const a = this.activePreset.atmosphere;
    this.setAtmosphere(a.tension, value, a.complexity);
  }

  setComplexity(value: number): void {
    const a = this.activePreset.atmosphere;
    this.setAtmosphere(a.tension, a.instability, value);
  }

  getAtmosphere(): AtmosphereState {
    return { ...this.activePreset.atmosphere };
  }

  // === Gameplay State ===

  setState(key: string, value: number): void {
    const clamped = Math.max(0, Math.min(1, value));
    this.gameStates[key] = clamped;

    if (key === 'tension') {
      this.setTension(clamped);
    } else if (key === 'progress') {
      const complexity = 0.25 + clamped * 0.75;
      const instability = Math.min(1, 0.2 + clamped * 0.45);
      this.setAtmosphere(this.activePreset.atmosphere.tension, instability, complexity);
    } else if (key === 'proximity') {
      const tension = 0.1 + clamped * 0.85;
      this.setTension(tension);
      this.setParam('filter.frequency', 450 + clamped * 3200);
    } else if (key === 'danger') {
      this.setAtmosphere(
        0.15 + clamped * 0.85,
        0.2 + clamped * 0.7,
        this.activePreset.atmosphere.complexity
      );
    }
  }

  // === Discrete Events ===

  triggerEvent(eventName: EventName | string, options?: EventOptions): void {
    if (eventName === 'newGame') {
      const newSeed = Math.floor(Date.now() % 1000000);
      this.reseed(newSeed, true);
    }
    if (this.events && this.ctx && this.ctx.state === 'running') {
      this.events.trigger(eventName, options);
    }
    this.emit('eventTriggered', { name: eventName, options: options ?? {} });
  }

  // === Direct Parameter Access ===

  setParam(paramPath: string, value: number): void {
    this.updatePresetField(paramPath, value);

    if (!this.ctx || !this.nodes || !this.modulation) return;
    const t = this.ctx.currentTime;

    if (paramPath === 'reverb.decay') {
      this.nodes.reverb.buffer = generateReverbIR(this.ctx, value, 2, this.rng);
      return;
    }

    if (paramPath === 'reverb.mix') {
      const effective = this.activePreset.effects.reverb.enabled ? value : 0;
      this.nodes.reverbMix.gain.setTargetAtTime(effective, t, 0.04);
      return;
    }

    if (paramPath === 'masterGain') {
      this.config.volume = Math.max(0, Math.min(1, value));
      this.nodes.masterGain.gain.setTargetAtTime(this.config.volume, t, 0.04);
      return;
    }

    if (paramPath === 'lfo1.rate') {
      this.modulation.setLFORate(1, value);
      return;
    }
    if (paramPath === 'lfo2.rate') {
      this.modulation.setLFORate(2, value);
      return;
    }
    if (paramPath === 'lfo3.rate') {
      this.modulation.setLFORate(3, value);
      return;
    }
    if (paramPath === 'lfo1.depth') {
      this.modulation.setLFODepth(1, value);
      return;
    }
    if (paramPath === 'lfo2.depth') {
      this.modulation.setLFODepth(2, value);
      return;
    }
    if (paramPath === 'lfo3.depth') {
      this.modulation.setLFODepth(3, value);
      return;
    }

    const param = this.modulation.resolveTarget(paramPath);
    if (param) {
      param.setTargetAtTime(value, t, 0.04);
    }
  }

  getParam(paramPath: string): number | null {
    switch (paramPath) {
      case 'osc1.frequency':
        return this.activePreset.sources.osc1.frequency;
      case 'osc2.frequency':
        return this.activePreset.sources.osc2.frequency;
      case 'osc3.frequency':
        return this.activePreset.sources.osc3.frequency;
      case 'osc1.detune':
        return this.activePreset.sources.osc1.detune;
      case 'osc2.detune':
        return this.activePreset.sources.osc2.detune;
      case 'osc3.detune':
        return this.activePreset.sources.osc3.detune;
      case 'osc1.gain':
        return this.activePreset.sources.osc1.gain;
      case 'osc2.gain':
        return this.activePreset.sources.osc2.gain;
      case 'osc3.gain':
        return this.activePreset.sources.osc3.gain;
      case 'noise.gain':
        return this.activePreset.sources.noise.gain;
      case 'noise.filterFreq':
      case 'noise.filterFrequency':
        return this.activePreset.sources.noise.filterFrequency;
      case 'filter.frequency':
        return this.activePreset.filter.frequency;
      case 'filter.Q':
        return this.activePreset.filter.Q;
      case 'delay.time':
        return this.activePreset.effects.delay.time;
      case 'delay.feedback':
        return this.activePreset.effects.delay.feedback;
      case 'delay.mix':
        return this.activePreset.effects.delay.mix;
      case 'reverb.mix':
        return this.activePreset.effects.reverb.mix;
      case 'reverb.decay':
        return this.activePreset.effects.reverb.decay;
      case 'panner.pan':
        return this.activePreset.master.pan;
      case 'masterGain':
        return this.config.volume;
      case 'lfo1.rate':
        return this.activePreset.modulation.lfo1.rate;
      case 'lfo1.depth':
        return this.activePreset.modulation.lfo1.depth;
      case 'lfo2.rate':
        return this.activePreset.modulation.lfo2.rate;
      case 'lfo2.depth':
        return this.activePreset.modulation.lfo2.depth;
      case 'lfo3.rate':
        return this.activePreset.modulation.lfo3.rate;
      case 'lfo3.depth':
        return this.activePreset.modulation.lfo3.depth;
      default: {
        if (this.modulation) {
          const p = this.modulation.resolveTarget(paramPath);
          return p ? p.value : null;
        }
        return null;
      }
    }
  }

  setParamType(paramPath: string, type: string): void {
    switch (paramPath) {
      case 'osc1.waveform':
        this.activePreset.sources.osc1.waveform = type as OscillatorWaveform;
        if (this.nodes) this.nodes.osc1.type = type as OscillatorType;
        break;
      case 'osc2.waveform':
        this.activePreset.sources.osc2.waveform = type as OscillatorWaveform;
        if (this.nodes) this.nodes.osc2.type = type as OscillatorType;
        break;
      case 'osc3.waveform':
        this.activePreset.sources.osc3.waveform = type as OscillatorWaveform;
        if (this.nodes) this.nodes.osc3.type = type as OscillatorType;
        break;
      case 'noise.type':
        this.activePreset.sources.noise.type = type as NoiseType;
        if (this.ctx && this.nodes) {
          // AudioBufferSourceNode buffers cannot be swapped after start; create a fresh source seamlessly
          const oldNoise = this.nodes.noise;
          const nextNoise = this.ctx.createBufferSource();
          nextNoise.buffer = generateNoiseBuffer(this.ctx, type as NoiseType, 4, this.rng);
          nextNoise.loop = true;
          nextNoise.connect(this.nodes.noiseFilter);
          nextNoise.start();
          try {
            oldNoise.stop();
            oldNoise.disconnect();
          } catch {
            // Ignore if already stopped
          }
          this.nodes.noise = nextNoise;
        }
        break;
      case 'noise.filterType':
        this.activePreset.sources.noise.filterType = type as NoiseFilterType;
        if (this.nodes) this.nodes.noiseFilter.type = type as BiquadFilterType;
        break;
      case 'filter.type':
        this.activePreset.filter.type = type as FilterType;
        if (this.nodes) this.nodes.filter.type = type as BiquadFilterType;
        break;
      case 'lfo1.waveform':
        this.activePreset.modulation.lfo1.waveform = type as OscillatorWaveform;
        if (this.nodes) this.nodes.lfo1.type = type as OscillatorType;
        break;
      case 'lfo2.waveform':
        this.activePreset.modulation.lfo2.waveform = type as OscillatorWaveform;
        if (this.nodes) this.nodes.lfo2.type = type as OscillatorType;
        break;
      case 'lfo3.waveform':
        this.activePreset.modulation.lfo3.waveform = type as OscillatorWaveform;
        if (this.nodes) this.nodes.lfo3.type = type as OscillatorType;
        break;
    }
  }

  setLFOTarget(lfoNum: 1 | 2 | 3, target: ModulationTarget): void {
    const key = lfoNum === 1 ? 'lfo1' : lfoNum === 2 ? 'lfo2' : 'lfo3';
    this.activePreset.modulation[key].target = target;
    if (this.modulation) {
      this.modulation.configureLFO(lfoNum, this.activePreset.modulation[key]);
    }
  }

  configureLFO(lfoNum: 1 | 2 | 3, config: LFOConfig): void {
    const key = lfoNum === 1 ? 'lfo1' : lfoNum === 2 ? 'lfo2' : 'lfo3';
    this.activePreset.modulation[key] = { ...config };
    if (this.modulation) {
      this.modulation.configureLFO(lfoNum, config);
    }
  }

  configureRandomWalk(walkNum: 0 | 1 | 2, config: RandomWalkConfig): void {
    const key =
      walkNum === 0 ? 'randomWalk1' : walkNum === 1 ? 'randomWalk2' : 'randomWalk3';
    this.activePreset.modulation[key] = { ...config };
    if (this.modulation) {
      this.modulation.configureWalk(walkNum, config);
    }
  }

  setReverbEnabled(enabled: boolean): void {
    this.activePreset.effects.reverb.enabled = enabled;
    if (this.ctx && this.nodes) {
      const mix = enabled ? this.activePreset.effects.reverb.mix : 0;
      this.nodes.reverbMix.gain.setTargetAtTime(mix, this.ctx.currentTime, 0.04);
    }
  }

  // === Presets ===

  savePreset(name: string): Preset {
    const snapshot = this.getPreset();
    snapshot.name = name?.trim() || 'Untitled Preset';
    return snapshot;
  }

  loadPreset(preset: Preset): void {
    const normalized = validateAndNormalizePreset(preset);
    this.activePreset = structuredClone(normalized);
    this.config.seed = normalized.seed;
    this.config.volume = normalized.master.gain;
    this.rng.reset(normalized.seed);

    if (this.ctx && this.nodes) {
      this.applyPresetToGraph(normalized);
    }

    this.emit('seedChanged', { seed: normalized.seed });
    this.emit('presetLoaded', { name: normalized.name, preset: structuredClone(normalized) });
  }

  getPreset(): Preset {
    return structuredClone(this.activePreset);
  }

  getBuiltInPresets(): Preset[] {
    return BUILT_IN_PRESETS.map((p) => structuredClone(p));
  }

  // === Seed & Randomization ===

  getSeed(): number {
    return this.config.seed;
  }

  setSeed(seed: number): void {
    const cleanSeed = Math.floor(Math.abs(seed)) || 1;
    this.config.seed = cleanSeed;
    this.activePreset.seed = cleanSeed;
    this.rng.reset(cleanSeed);
    this.emit('seedChanged', { seed: cleanSeed });
  }

  reseed(seed?: number, generateSonicIdentity = true): number {
    const nextSeed = seed !== undefined ? Math.floor(Math.abs(seed)) || 1 : Math.floor(Math.random() * 999999) + 1;
    this.setSeed(nextSeed);

    if (generateSonicIdentity) {
      this.applySeededVariation(nextSeed);
    }

    return nextSeed;
  }

  private applySeededVariation(seed: number): void {
    const sessionRng = createRNG(seed);
    const waveforms: OscillatorWaveform[] = ['sine', 'triangle', 'sawtooth', 'square'];
    const roots = [48, 55, 65, 73, 82, 98, 110, 123, 146];
    const baseFreq = roots[sessionRng.nextInt(0, roots.length - 1)];
    const ratios = [1, 1.5, 2, 1.333, 1.2, 2.5];

    this.activePreset.sources.osc1 = {
      waveform: waveforms[sessionRng.nextInt(0, waveforms.length - 1)],
      frequency: Math.round(baseFreq),
      detune: Math.round(sessionRng.nextRange(-15, 15)),
      gain: Number(sessionRng.nextRange(0.2, 0.42).toFixed(2)),
    };
    this.activePreset.sources.osc2 = {
      waveform: waveforms[sessionRng.nextInt(0, waveforms.length - 1)],
      frequency: Math.round(baseFreq * ratios[sessionRng.nextInt(0, ratios.length - 1)]),
      detune: Math.round(sessionRng.nextRange(-30, 30)),
      gain: Number(sessionRng.nextRange(0.12, 0.35).toFixed(2)),
    };
    this.activePreset.sources.osc3 = {
      waveform: waveforms[sessionRng.nextInt(0, 2)],
      frequency: Math.round(baseFreq * ratios[sessionRng.nextInt(0, ratios.length - 1)]),
      detune: Math.round(sessionRng.nextRange(-25, 25)),
      gain: Number(sessionRng.nextRange(0.1, 0.3).toFixed(2)),
    };

    this.activePreset.sources.noise.type = sessionRng.next() > 0.35 ? 'pink' : 'white';
    this.activePreset.sources.noise.filterFrequency = Math.round(sessionRng.nextRange(350, 2200));
    this.activePreset.sources.noise.gain = Number(sessionRng.nextRange(0.06, 0.24).toFixed(2));

    this.activePreset.filter.frequency = Math.round(sessionRng.nextRange(450, 3200));
    this.activePreset.filter.Q = Number(sessionRng.nextRange(2, 16).toFixed(1));

    this.activePreset.effects.delay.time = Number(sessionRng.nextRange(0.15, 1.2).toFixed(2));
    this.activePreset.effects.delay.feedback = Number(sessionRng.nextRange(0.25, 0.65).toFixed(2));
    this.activePreset.effects.delay.mix = Number(sessionRng.nextRange(0.15, 0.48).toFixed(2));
    this.activePreset.effects.reverb.mix = Number(sessionRng.nextRange(0.15, 0.5).toFixed(2));
    this.activePreset.effects.reverb.decay = Number(sessionRng.nextRange(1.5, 4.2).toFixed(1));

    this.activePreset.modulation.lfo1.rate = Number(sessionRng.nextRange(0.02, 0.6).toFixed(2));
    this.activePreset.modulation.lfo2.rate = Number(sessionRng.nextRange(0.01, 0.35).toFixed(2));
    this.activePreset.modulation.lfo3.rate = Number(sessionRng.nextRange(0.01, 0.15).toFixed(2));

    this.activePreset.atmosphere = {
      tension: Number(sessionRng.nextRange(0.15, 0.65).toFixed(2)),
      instability: Number(sessionRng.nextRange(0.15, 0.65).toFixed(2)),
      complexity: Number(sessionRng.nextRange(0.3, 0.75).toFixed(2)),
    };

    if (this.ctx && this.nodes) {
      this.applyPresetToGraph(this.activePreset);
    }
    this.emit('presetLoaded', { name: `Seed ${seed}`, preset: this.getPreset() });
  }

  // === Volume ===

  setVolume(value: number): void {
    const v = Math.max(0, Math.min(1, value));
    this.config.volume = v;
    this.activePreset.master.gain = v;
    if (this.ctx && this.nodes) {
      this.nodes.masterGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.04);
    }
  }

  getVolume(): number {
    return this.config.volume;
  }

  // === Utility ===

  getAnalyser(): AnalyserNode | null {
    return this.nodes?.analyser ?? null;
  }

  getAudioContext(): AudioContext | null {
    return this.ctx;
  }

  isRunning(): boolean {
    return this.engineState === 'playing';
  }

  onEvent(callback: EngineCallback): () => void {
    this.callbacks.push(callback);
    return () => {
      this.callbacks = this.callbacks.filter((cb) => cb !== callback);
    };
  }

  private emit(event: EngineEventName, data: Record<string, unknown>): void {
    for (const cb of this.callbacks) {
      cb(event, data);
    }
  }

  private applyPresetToGraph(preset: Preset): void {
    if (!this.ctx || !this.nodes || !this.modulation || !this.atmosphere) return;
    const t = this.ctx.currentTime;

    // Oscillators
    this.nodes.osc1.type = preset.sources.osc1.waveform;
    this.nodes.osc1.frequency.setTargetAtTime(preset.sources.osc1.frequency, t, 0.05);
    this.nodes.osc1.detune.setTargetAtTime(preset.sources.osc1.detune, t, 0.05);
    this.nodes.osc1Gain.gain.setTargetAtTime(preset.sources.osc1.gain, t, 0.05);

    this.nodes.osc2.type = preset.sources.osc2.waveform;
    this.nodes.osc2.frequency.setTargetAtTime(preset.sources.osc2.frequency, t, 0.05);
    this.nodes.osc2.detune.setTargetAtTime(preset.sources.osc2.detune, t, 0.05);
    this.nodes.osc2Gain.gain.setTargetAtTime(preset.sources.osc2.gain, t, 0.05);

    this.nodes.osc3.type = preset.sources.osc3.waveform;
    this.nodes.osc3.frequency.setTargetAtTime(preset.sources.osc3.frequency, t, 0.05);
    this.nodes.osc3.detune.setTargetAtTime(preset.sources.osc3.detune, t, 0.05);
    this.nodes.osc3Gain.gain.setTargetAtTime(preset.sources.osc3.gain, t, 0.05);

    // Noise
    this.setParamType('noise.type', preset.sources.noise.type);
    this.nodes.noiseFilter.type = preset.sources.noise.filterType;
    this.nodes.noiseFilter.frequency.setTargetAtTime(preset.sources.noise.filterFrequency, t, 0.05);
    this.nodes.noiseGain.gain.setTargetAtTime(preset.sources.noise.gain, t, 0.05);

    // Main filter
    this.nodes.filter.type = preset.filter.type;
    this.nodes.filter.frequency.setTargetAtTime(preset.filter.frequency, t, 0.05);
    this.nodes.filter.Q.setTargetAtTime(preset.filter.Q, t, 0.05);

    // Modulation
    this.modulation.configureLFO(1, preset.modulation.lfo1);
    this.modulation.configureLFO(2, preset.modulation.lfo2);
    this.modulation.configureLFO(3, preset.modulation.lfo3);

    this.modulation.configureWalk(0, preset.modulation.randomWalk1);
    this.modulation.configureWalk(1, preset.modulation.randomWalk2);
    this.modulation.configureWalk(2, preset.modulation.randomWalk3);

    // Effects
    this.nodes.delay.delayTime.setTargetAtTime(preset.effects.delay.time, t, 0.05);
    this.nodes.delayFeedback.gain.setTargetAtTime(preset.effects.delay.feedback, t, 0.05);
    this.nodes.delayMix.gain.setTargetAtTime(preset.effects.delay.mix, t, 0.05);

    this.nodes.reverb.buffer = generateReverbIR(this.ctx, preset.effects.reverb.decay, 2, this.rng);
    const revMix = preset.effects.reverb.enabled ? preset.effects.reverb.mix : 0;
    this.nodes.reverbMix.gain.setTargetAtTime(revMix, t, 0.05);

    // Master & Pan
    this.nodes.panner.pan.setTargetAtTime(preset.master.pan, t, 0.05);
    this.nodes.masterGain.gain.setTargetAtTime(preset.master.gain, t, 0.05);

    // Record atmosphere values without clobbering exact preset voice gains
    this.atmosphere.setAtmosphere(
      preset.atmosphere.tension,
      preset.atmosphere.instability,
      preset.atmosphere.complexity,
      false
    );
  }

  private syncActivePresetFromNodes(): void {
    const a = this.activePreset.atmosphere;
    this.activePreset.sources.osc1.detune = Math.round(a.tension * 50);
    this.activePreset.sources.osc2.detune = Math.round(-a.tension * 30);
    this.activePreset.filter.Q = Number((5 + a.tension * 15).toFixed(1));
    this.activePreset.sources.noise.gain = Number((0.05 + a.tension * 0.25).toFixed(2));
    this.activePreset.effects.delay.feedback = Number(
      Math.min(0.92, 0.25 + a.tension * 0.45).toFixed(2)
    );
    this.activePreset.sources.osc1.gain = Number((0.1 + a.complexity * 0.3).toFixed(2));
    this.activePreset.sources.osc2.gain = Number((0.05 + a.complexity * 0.3).toFixed(2));
    this.activePreset.sources.osc3.gain = Number((a.complexity * 0.3).toFixed(2));
    this.activePreset.effects.delay.mix = Number((0.08 + a.complexity * 0.42).toFixed(2));
    this.activePreset.effects.reverb.mix = Number((0.1 + a.complexity * 0.35).toFixed(2));
    this.activePreset.modulation.lfo1.rate = Number(
      ((0.05 + a.tension * 1.95) * (1 + a.instability * 0.5)).toFixed(2)
    );
    this.activePreset.modulation.lfo2.depth = Math.round(150 + a.complexity * 1050);
  }

  private updatePresetField(path: string, value: number): void {
    switch (path) {
      case 'osc1.frequency':
        this.activePreset.sources.osc1.frequency = value;
        break;
      case 'osc2.frequency':
        this.activePreset.sources.osc2.frequency = value;
        break;
      case 'osc3.frequency':
        this.activePreset.sources.osc3.frequency = value;
        break;
      case 'osc1.detune':
        this.activePreset.sources.osc1.detune = value;
        break;
      case 'osc2.detune':
        this.activePreset.sources.osc2.detune = value;
        break;
      case 'osc3.detune':
        this.activePreset.sources.osc3.detune = value;
        break;
      case 'osc1.gain':
        this.activePreset.sources.osc1.gain = value;
        break;
      case 'osc2.gain':
        this.activePreset.sources.osc2.gain = value;
        break;
      case 'osc3.gain':
        this.activePreset.sources.osc3.gain = value;
        break;
      case 'noise.gain':
        this.activePreset.sources.noise.gain = value;
        break;
      case 'noise.filterFreq':
      case 'noise.filterFrequency':
        this.activePreset.sources.noise.filterFrequency = value;
        break;
      case 'filter.frequency':
        this.activePreset.filter.frequency = value;
        break;
      case 'filter.Q':
        this.activePreset.filter.Q = value;
        break;
      case 'delay.time':
        this.activePreset.effects.delay.time = value;
        break;
      case 'delay.feedback':
        this.activePreset.effects.delay.feedback = value;
        break;
      case 'delay.mix':
        this.activePreset.effects.delay.mix = value;
        break;
      case 'reverb.mix':
        this.activePreset.effects.reverb.mix = value;
        break;
      case 'reverb.decay':
        this.activePreset.effects.reverb.decay = value;
        break;
      case 'panner.pan':
        this.activePreset.master.pan = value;
        break;
      case 'masterGain':
        this.activePreset.master.gain = value;
        break;
      case 'lfo1.rate':
        this.activePreset.modulation.lfo1.rate = value;
        break;
      case 'lfo1.depth':
        this.activePreset.modulation.lfo1.depth = value;
        break;
      case 'lfo2.rate':
        this.activePreset.modulation.lfo2.rate = value;
        break;
      case 'lfo2.depth':
        this.activePreset.modulation.lfo2.depth = value;
        break;
      case 'lfo3.rate':
        this.activePreset.modulation.lfo3.rate = value;
        break;
      case 'lfo3.depth':
        this.activePreset.modulation.lfo3.depth = value;
        break;
    }
  }
}
