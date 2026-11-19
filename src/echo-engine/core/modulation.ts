import type { LFOConfig, ModulationTarget, RandomWalkConfig } from '../types';
import type { AudioGraphNodes } from './audio-graph';
import type { SeededRNG } from './rng';

export interface ActiveWalkState extends RandomWalkConfig {
  targetParam: AudioParam | null;
  current: number;
}

/**
 * Manages continuous Web Audio LFOs and JavaScript interval-based stochastic
 * random walks (note: random-walk timers run on the JS main-thread event loop
 * and schedule smoothed AudioParam transitions via setTargetAtTime).
 */
export class ModulationEngine {
  private ctx: AudioContext;
  private nodes: AudioGraphNodes;
  private walkRng: SeededRNG;
  public lfoConfigs: [LFOConfig, LFOConfig, LFOConfig];
  public walks: ActiveWalkState[] = [];
  private walkTimers: Array<ReturnType<typeof setInterval> | null> = [null, null, null];
  private shepardTimer: ReturnType<typeof setInterval> | null = null;
  private shepardNextTimes: number[] = [];
  private shepardMix = 0;
  private shepardRate = 0.05;
  private shepardBaseFreq = 85;
  private paused = false;

  constructor(ctx: AudioContext, nodes: AudioGraphNodes, walkRng: SeededRNG) {
    this.ctx = ctx;
    this.nodes = nodes;
    this.walkRng = walkRng;
    this.lfoConfigs = [
      { waveform: 'sine', rate: 0.07, depth: 9, target: 'osc1.detune' },
      { waveform: 'triangle', rate: 0.04, depth: 130, target: 'filter.frequency' },
      { waveform: 'sine', rate: 0.025, depth: 0.45, target: 'panner.pan' },
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
    lfo.frequency.setTargetAtTime(Math.max(0.005, config.rate), this.ctx.currentTime, 0.03);
    lfoDepth.gain.setTargetAtTime(config.depth, this.ctx.currentTime, 0.03);

    lfoDepth.disconnect();
    const targetParam = this.resolveTarget(config.target);
    if (targetParam) {
      lfoDepth.connect(targetParam);
    }
  }

  setLFORate(lfoNum: 1 | 2 | 3, rate: number): void {
    const safeRate = Math.max(0.005, Math.min(20, rate));
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
      interval: Math.max(60, Math.min(1200, config.interval)),
      smoothing: Math.max(0.02, Math.min(1.0, config.smoothing)),
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
    const step = (this.walkRng.next() * 2 - 1) * walk.stepSize;
    walk.current = Math.max(walk.min, Math.min(walk.max, walk.current + step));
    walk.targetParam.setTargetAtTime(walk.current, this.ctx.currentTime, walk.smoothing);
  }

  configureShepard(mix: number, rate: number, baseFreq: number): void {
    this.shepardMix = Math.max(0, Math.min(1, mix));
    this.shepardRate = Math.max(0.015, Math.min(0.25, rate));
    this.shepardBaseFreq = Math.max(35, Math.min(220, baseFreq));

    this.nodes.shepardBus.gain.setTargetAtTime(
      this.shepardMix * 0.34,
      this.ctx.currentTime,
      0.08
    );

    if (this.shepardMix > 0.02 && !this.paused) {
      this.startShepardTimer();
    } else if (this.shepardMix <= 0.02) {
      this.stopShepardTimer();
    }
  }

  private startShepardTimer(): void {
    if (this.shepardTimer) return;
    const period = 1 / this.shepardRate;
    const now = this.ctx.currentTime;
    this.shepardNextTimes = this.nodes.shepardOscs.map((_, i) => now + i * (period / 6));

    const scheduleStep = () => {
      if (this.paused || this.ctx.state !== 'running' || this.shepardMix <= 0.02) return;
      const tPeriod = 1 / Math.max(0.015, this.shepardRate);
      const tNow = this.ctx.currentTime;
      const fTop = this.shepardBaseFreq * 2.5;

      this.nodes.shepardOscs.forEach((osc, i) => {
        while (this.shepardNextTimes[i] < tNow + 2.2) {
          const t0 = Math.max(this.shepardNextTimes[i], tNow + 0.02);
          const f0 = fTop * Math.pow(2, -i / 6);
          const g = this.nodes.shepardGains[i];
          try {
            osc.frequency.setValueAtTime(f0, t0);
            osc.frequency.exponentialRampToValueAtTime(Math.max(24, f0 / 2), t0 + tPeriod);
            g.gain.setValueAtTime(0.0001, t0);
            g.gain.linearRampToValueAtTime(0.45, t0 + tPeriod * 0.45);
            g.gain.linearRampToValueAtTime(0.0001, t0 + tPeriod * 0.98);
          } catch {
            // Ignore overlapping ramp bounds
          }
          this.shepardNextTimes[i] = t0 + tPeriod;
        }
      });
    };

    scheduleStep();
    this.shepardTimer = setInterval(scheduleStep, 350);
  }

  private stopShepardTimer(): void {
    if (this.shepardTimer) {
      clearInterval(this.shepardTimer);
      this.shepardTimer = null;
    }
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
    this.stopShepardTimer();
  }

  resume(): void {
    this.paused = false;
    for (let i = 0; i < this.walks.length; i++) {
      if (this.walks[i]) {
        this.restartWalkTimer(i);
      }
    }
    if (this.shepardMix > 0.02) {
      this.startShepardTimer();
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
      'fm.depth': this.nodes.fmGain.gain,
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
