import type { LFOConfig, ModulationTarget, RandomWalkConfig } from '../types';
import type { AudioGraphNodes } from './audio-graph';
import type { SeededRNG } from './rng';

export interface ActiveWalkState extends RandomWalkConfig {
  targetParam: AudioParam | null;
  current: number;
}

export class ModulationEngine {
  private ctx: AudioContext;
  private nodes: AudioGraphNodes;
  private rng: SeededRNG;
  public lfoConfigs: [LFOConfig, LFOConfig, LFOConfig];
  public walks: ActiveWalkState[] = [];
  private walkTimers: Array<ReturnType<typeof setInterval> | null> = [null, null, null];
  private paused = false;

  constructor(ctx: AudioContext, nodes: AudioGraphNodes, rng: SeededRNG) {
    this.ctx = ctx;
    this.nodes = nodes;
    this.rng = rng;
    this.lfoConfigs = [
      { waveform: 'sine', rate: 0.1, depth: 20, target: 'osc1.frequency' },
      { waveform: 'triangle', rate: 0.05, depth: 500, target: 'filter.frequency' },
      { waveform: 'sine', rate: 0.02, depth: 0.8, target: 'panner.pan' },
    ];
  }

  configureLFO(lfoNum: 1 | 2 | 3, config: LFOConfig): void {
    const idx = lfoNum - 1;
    this.lfoConfigs[idx] = { ...config };

    const lfo = lfoNum === 1 ? this.nodes.lfo1 : lfoNum === 2 ? this.nodes.lfo2 : this.nodes.lfo3;
    const lfoDepth =
      lfoNum === 1
        ? this.nodes.lfo1Depth
        : lfoNum === 2
          ? this.nodes.lfo2Depth
          : this.nodes.lfo3Depth;

    lfo.type = config.waveform;
    lfo.frequency.setTargetAtTime(config.rate, this.ctx.currentTime, 0.03);
    lfoDepth.gain.setTargetAtTime(config.depth, this.ctx.currentTime, 0.03);

    lfoDepth.disconnect();
    const targetParam = this.resolveTarget(config.target);
    if (targetParam) {
      lfoDepth.connect(targetParam);
    }
  }

  setLFORate(lfoNum: 1 | 2 | 3, rate: number): void {
    const safeRate = Math.max(0.001, Math.min(20, rate));
    this.lfoConfigs[lfoNum - 1].rate = safeRate;
    const lfo = lfoNum === 1 ? this.nodes.lfo1 : lfoNum === 2 ? this.nodes.lfo2 : this.nodes.lfo3;
    lfo.frequency.setTargetAtTime(safeRate, this.ctx.currentTime, 0.05);
  }

  setLFODepth(lfoNum: 1 | 2 | 3, depth: number): void {
    this.lfoConfigs[lfoNum - 1].depth = depth;
    const lfoDepth =
      lfoNum === 1
        ? this.nodes.lfo1Depth
        : lfoNum === 2
          ? this.nodes.lfo2Depth
          : this.nodes.lfo3Depth;
    lfoDepth.gain.setTargetAtTime(depth, this.ctx.currentTime, 0.05);
  }

  configureWalk(walkNum: number, config: RandomWalkConfig): void {
    const min = Math.min(config.min, config.max);
    const max = Math.max(config.min, config.max);
    const walk: ActiveWalkState = {
      ...config,
      min,
      max,
      interval: Math.max(50, Math.min(1000, config.interval)),
      smoothing: Math.max(0.01, Math.min(1.0, config.smoothing)),
      targetParam: this.resolveTarget(config.target),
      current: min + (max - min) * 0.5,
    };

    this.walks[walkNum] = walk;
    this.restartWalkTimer(walkNum);
  }

  private restartWalkTimer(walkNum: number): void {
    const existing = this.walkTimers[walkNum];
    if (existing) {
      clearInterval(existing);
      this.walkTimers[walkNum] = null;
    }
    const walk = this.walks[walkNum];
    if (!walk || this.paused) return;

    this.walkTimers[walkNum] = setInterval(() => {
      this.updateWalk(walk);
    }, walk.interval);
  }

  updateWalk(walk: ActiveWalkState): void {
    if (!walk.targetParam || this.ctx.state !== 'running') return;
    const step = (this.rng.next() * 2 - 1) * walk.stepSize;
    walk.current = Math.max(walk.min, Math.min(walk.max, walk.current + step));
    walk.targetParam.setTargetAtTime(walk.current, this.ctx.currentTime, walk.smoothing);
  }

  pause(): void {
    this.paused = true;
    for (let i = 0; i < this.walkTimers.length; i++) {
      const t = this.walkTimers[i];
      if (t) {
        clearInterval(t);
        this.walkTimers[i] = null;
      }
    }
  }

  resume(): void {
    this.paused = false;
    for (let i = 0; i < this.walks.length; i++) {
      if (this.walks[i]) {
        this.restartWalkTimer(i);
      }
    }
  }

  resolveTarget(path: ModulationTarget | string): AudioParam | null {
    const map: Record<string, AudioParam> = {
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
      'noise.filterFreq': this.nodes.noiseFilter.frequency,
      'noise.filterFrequency': this.nodes.noiseFilter.frequency,
      'delay.time': this.nodes.delay.delayTime,
      'delay.feedback': this.nodes.delayFeedback.gain,
      'delay.mix': this.nodes.delayMix.gain,
      'reverb.mix': this.nodes.reverbMix.gain,
      'panner.pan': this.nodes.panner.pan,
      'masterGain': this.nodes.masterGain.gain,
      'lfo1.rate': this.nodes.lfo1.frequency,
      'lfo2.rate': this.nodes.lfo2.frequency,
      'lfo3.rate': this.nodes.lfo3.frequency,
      'lfo1.depth': this.nodes.lfo1Depth.gain,
      'lfo2.depth': this.nodes.lfo2Depth.gain,
      'lfo3.depth': this.nodes.lfo3Depth.gain,
    };
    return map[path] || null;
  }

  destroy(): void {
    this.pause();
    this.walks = [];
  }
}
