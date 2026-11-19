import type { EventName, EventOptions } from '../types';
import type { AudioGraphNodes } from './audio-graph';

interface AutomationStep {
  param: keyof ReturnType<EventEngine['getParamMap']>;
  fromOffset?: number;
  to: number;
  time: number;
  after?: number;
  curve?: 'linear' | 'exponential';
  returnToBase?: boolean;
}

export class EventEngine {
  private ctx: AudioContext;
  private nodes: AudioGraphNodes;

  constructor(ctx: AudioContext, nodes: AudioGraphNodes) {
    this.ctx = ctx;
    this.nodes = nodes;
  }

  private getParamMap() {
    return {
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
  }

  trigger(eventName: EventName | string, options: EventOptions = {}): void {
    const intensity = Math.max(0.1, Math.min(1.0, options.intensity ?? 1.0));
    const t = this.ctx.currentTime;
    const paramMap = this.getParamMap();

    const steps = this.getStepsForEvent(eventName, paramMap, intensity);
    if (!steps.length) return;

    // Track current baselines per param before scheduling
    const baselines = new Map<string, number>();
    for (const step of steps) {
      if (!baselines.has(step.param)) {
        baselines.set(step.param, paramMap[step.param].value);
      }
    }

    for (const step of steps) {
      const param = paramMap[step.param];
      if (!param) continue;

      const base = baselines.get(step.param) ?? param.value;
      const startTime = t + (step.after ?? 0);
      const endTime = startTime + Math.max(0.01, step.time);
      const targetVal = step.returnToBase ? base : step.to;

      if (!step.after) {
        param.cancelScheduledValues(t);
        param.setValueAtTime(
          step.curve === 'exponential' ? Math.max(0.001, base) : base,
          startTime
        );
      }

      if (step.curve === 'exponential' && base > 0.001 && targetVal > 0.001) {
        param.exponentialRampToValueAtTime(Math.max(0.001, targetVal), endTime);
      } else {
        param.linearRampToValueAtTime(targetVal, endTime);
      }
    }
  }

  private getStepsForEvent(
    eventName: string,
    paramMap: ReturnType<EventEngine['getParamMap']>,
    intensity: number
  ): AutomationStep[] {
    const baseFilterFreq = Math.max(80, paramMap['filter.frequency'].value);
    const baseFilterQ = Math.max(0.5, paramMap['filter.Q'].value);
    const baseNoise = paramMap['noise.gain'].value;
    const baseFeedback = paramMap['delay.feedback'].value;
    const baseDelayMix = paramMap['delay.mix'].value;
    const baseReverbMix = paramMap['reverb.mix'].value;
    const baseMaster = Math.max(0.1, paramMap['masterGain'].value);
    const baseOsc1Detune = paramMap['osc1.detune'].value;
    const baseOsc2Detune = paramMap['osc2.detune'].value;

    switch (eventName) {
      case 'newGame':
        return [
          { param: 'filter.frequency', to: Math.min(8000, baseFilterFreq + 1800 * intensity), time: 0.35, curve: 'exponential' },
          { param: 'filter.frequency', to: baseFilterFreq, time: 1.1, after: 0.35, curve: 'exponential', returnToBase: true },
          { param: 'reverb.mix', to: Math.min(0.75, baseReverbMix + 0.25 * intensity), time: 0.3, curve: 'linear' },
          { param: 'reverb.mix', to: baseReverbMix, time: 1.2, after: 0.3, curve: 'linear', returnToBase: true },
        ];

      case 'portal':
        return [
          { param: 'filter.frequency', to: Math.min(9000, 400 + 3800 * intensity), time: 0.45, curve: 'exponential' },
          { param: 'filter.frequency', to: baseFilterFreq, time: 1.45, after: 0.45, curve: 'exponential', returnToBase: true },
          { param: 'filter.Q', to: Math.min(35, baseFilterQ + 18 * intensity), time: 0.3, curve: 'linear' },
          { param: 'filter.Q', to: baseFilterQ, time: 1.6, after: 0.3, curve: 'linear', returnToBase: true },
          { param: 'osc1.detune', to: baseOsc1Detune + 95 * intensity, time: 0.8, curve: 'linear' },
          { param: 'osc1.detune', to: baseOsc1Detune, time: 1.1, after: 0.8, curve: 'linear', returnToBase: true },
          { param: 'delay.feedback', to: Math.min(0.88, baseFeedback + 0.35 * intensity), time: 0.3, curve: 'linear' },
          { param: 'delay.feedback', to: baseFeedback, time: 1.6, after: 0.3, curve: 'linear', returnToBase: true },
        ];

      case 'collision':
        return [
          { param: 'noise.gain', to: Math.min(0.85, baseNoise + 0.55 * intensity), time: 0.04, curve: 'linear' },
          { param: 'noise.gain', to: baseNoise, time: 0.46, after: 0.04, curve: 'linear', returnToBase: true },
          { param: 'filter.Q', to: Math.min(38, baseFilterQ + 28 * intensity), time: 0.04, curve: 'linear' },
          { param: 'filter.Q', to: baseFilterQ, time: 0.46, after: 0.04, curve: 'linear', returnToBase: true },
          { param: 'osc1.detune', to: baseOsc1Detune - 120 * intensity, time: 0.05, curve: 'linear' },
          { param: 'osc1.detune', to: baseOsc1Detune, time: 0.45, after: 0.05, curve: 'linear', returnToBase: true },
          { param: 'masterGain', to: Math.max(0.15, baseMaster * (1 - 0.35 * intensity)), time: 0.02, curve: 'linear' },
          { param: 'masterGain', to: baseMaster, time: 0.48, after: 0.02, curve: 'linear', returnToBase: true },
        ];

      case 'gameOver':
        return [
          { param: 'filter.frequency', to: Math.max(90, baseFilterFreq * (1 - 0.8 * intensity)), time: 3.0, curve: 'exponential' },
          { param: 'filter.Q', to: Math.max(1.5, baseFilterQ * 0.35), time: 3.0, curve: 'linear' },
          { param: 'reverb.mix', to: Math.min(0.9, baseReverbMix + 0.55 * intensity), time: 2.0, curve: 'linear' },
          { param: 'delay.feedback', to: Math.min(0.88, baseFeedback + 0.4 * intensity), time: 2.2, curve: 'linear' },
          { param: 'noise.gain', to: Math.max(0.03, baseNoise * 0.4), time: 2.8, curve: 'linear' },
        ];

      case 'danger':
        return [
          { param: 'osc1.detune', to: baseOsc1Detune + 42 * intensity, time: 0.45, curve: 'linear' },
          { param: 'osc1.detune', to: baseOsc1Detune, time: 1.0, after: 0.45, curve: 'linear', returnToBase: true },
          { param: 'osc2.detune', to: baseOsc2Detune - 34 * intensity, time: 0.45, curve: 'linear' },
          { param: 'osc2.detune', to: baseOsc2Detune, time: 1.0, after: 0.45, curve: 'linear', returnToBase: true },
          { param: 'noise.gain', to: Math.min(0.6, baseNoise + 0.22 * intensity), time: 0.25, curve: 'linear' },
          { param: 'noise.gain', to: baseNoise, time: 1.2, after: 0.25, curve: 'linear', returnToBase: true },
        ];

      case 'nearMiss':
        return [
          { param: 'filter.Q', to: Math.min(30, baseFilterQ + 14 * intensity), time: 0.08, curve: 'linear' },
          { param: 'filter.Q', to: baseFilterQ, time: 0.72, after: 0.08, curve: 'linear', returnToBase: true },
          { param: 'noise.gain', to: Math.min(0.55, baseNoise + 0.2 * intensity), time: 0.05, curve: 'linear' },
          { param: 'noise.gain', to: baseNoise, time: 0.75, after: 0.05, curve: 'linear', returnToBase: true },
          { param: 'osc2.detune', to: baseOsc2Detune + 28 * intensity, time: 0.1, curve: 'linear' },
          { param: 'osc2.detune', to: baseOsc2Detune, time: 0.7, after: 0.1, curve: 'linear', returnToBase: true },
        ];

      case 'pass':
        return [
          { param: 'filter.frequency', to: Math.max(180, baseFilterFreq * (1 - 0.35 * intensity)), time: 0.7, curve: 'exponential' },
          { param: 'filter.frequency', to: baseFilterFreq, time: 0.8, after: 0.7, curve: 'exponential', returnToBase: true },
          { param: 'delay.mix', to: Math.max(0.05, baseDelayMix * 0.55), time: 0.7, curve: 'linear' },
          { param: 'delay.mix', to: baseDelayMix, time: 0.8, after: 0.7, curve: 'linear', returnToBase: true },
        ];

      default:
        return [];
    }
  }
}
