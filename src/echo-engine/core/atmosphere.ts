import type { AtmosphereState } from '../types';
import type { AudioGraphNodes } from './audio-graph';
import type { ModulationEngine } from './modulation';

export class AtmosphereController {
  private ctx: AudioContext;
  private nodes: AudioGraphNodes;
  private modulation: ModulationEngine;
  public current: AtmosphereState = { tension: 0.3, instability: 0.4, complexity: 0.5 };
  private rampTime = 0.45;

  constructor(ctx: AudioContext, nodes: AudioGraphNodes, modulation: ModulationEngine) {
    this.ctx = ctx;
    this.nodes = nodes;
    this.modulation = modulation;
  }

  setAtmosphere(tension: number, instability: number, complexity: number, applyToAudio = true): void {
    this.current = {
      tension: this.clamp(tension, 0, 1),
      instability: this.clamp(instability, 0, 1),
      complexity: this.clamp(complexity, 0, 1),
    };
    if (applyToAudio) {
      this.apply();
    }
  }

  apply(): void {
    const { tension, instability, complexity } = this.current;
    const t = this.ctx.currentTime;
    const r = this.rampTime;

    // Tension mapping: dissonance, resonance, noise presence, feedback, LFO rate
    this.rampParam(this.nodes.osc1.detune, tension * 50, t, r);
    this.rampParam(this.nodes.osc2.detune, -tension * 30, t, r);
    this.rampParam(this.nodes.filter.Q, 5 + tension * 15, t, r);
    this.rampParam(this.nodes.noiseGain.gain, 0.05 + tension * 0.25, t, r);
    this.rampParam(this.nodes.delayFeedback.gain, Math.min(0.92, 0.25 + tension * 0.45), t, r);
    this.modulation.setLFORate(1, (0.05 + tension * 1.95) * (1 + instability * 0.5));

    // Instability mapping: random walk step sizes
    if (this.modulation.walks[0]) {
      this.modulation.walks[0].stepSize = 0.5 + instability * 2.5;
    }
    if (this.modulation.walks[1]) {
      this.modulation.walks[1].stepSize = 40 + instability * 220;
    }
    if (this.modulation.walks[2]) {
      this.modulation.walks[2].stepSize = 0.02 + instability * 0.12;
    }

    // Complexity mapping: voice layering, effect mix, filter modulation depth
    this.rampParam(this.nodes.osc1Gain.gain, 0.1 + complexity * 0.3, t, r);
    this.rampParam(this.nodes.osc2Gain.gain, 0.05 + complexity * 0.3, t, r);
    this.rampParam(this.nodes.osc3Gain.gain, complexity * 0.3, t, r);
    this.rampParam(this.nodes.delayMix.gain, 0.08 + complexity * 0.42, t, r);
    this.rampParam(this.nodes.reverbMix.gain, 0.1 + complexity * 0.35, t, r);
    this.modulation.setLFODepth(2, 150 + complexity * 1050);
  }

  private rampParam(param: AudioParam, value: number, time: number, rampTime: number): void {
    try {
      param.cancelScheduledValues(time);
      param.setValueAtTime(param.value, time);
      param.linearRampToValueAtTime(value, time + rampTime);
    } catch {
      param.setTargetAtTime(value, time, 0.1);
    }
  }

  private clamp(v: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, v));
  }
}
