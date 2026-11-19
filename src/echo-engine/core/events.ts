import type { EventName, EventOptions } from '../types';
import type { AudioGraphNodes } from './audio-graph';
import type { SeededRNG } from './rng';

interface AutomationStep {
  param: keyof ReturnType<EventEngine['getParamMap']>;
  to: number;
  time: number;
  after?: number;
  curve?: 'linear' | 'exponential';
  returnToBase?: boolean;
}

export class EventEngine {
  private ctx: AudioContext;
  private nodes: AudioGraphNodes;
  private eventRng: SeededRNG;

  constructor(ctx: AudioContext, nodes: AudioGraphNodes, eventRng: SeededRNG) {
    this.ctx = ctx;
    this.nodes = nodes;
    this.eventRng = eventRng;
  }

  private getParamMap() {
    return {
      'filter.frequency': this.nodes.filter.frequency,
      'filter.Q': this.nodes.filter.Q,
      'noise.gain': this.nodes.noiseGain.gain,
      'noise.filterFrequency': this.nodes.noiseFilter.frequency,
      'masterGain': this.nodes.masterGain.gain,
      'delay.feedback': this.nodes.delayFeedback.gain,
      'delay.mix': this.nodes.delayMix.gain,
      'reverb.mix': this.nodes.reverbMix.gain,
      'osc1.detune': this.nodes.osc1.detune,
      'osc2.detune': this.nodes.osc2.detune,
      'fm.depth': this.nodes.fmGain.gain,
    };
  }

  trigger(eventName: EventName | string, options: EventOptions = {}): void {
    const intensity = Math.max(0.1, Math.min(1.0, options.intensity ?? 0.85));
    const t = this.ctx.currentTime;
    const paramMap = this.getParamMap();

    // Transient synthesized/noise events routed through preFxBus -> damped delay/reverb/compressor
    switch (eventName) {
      case 'whisper':
        this.spawnWhisper(intensity);
        return;
      case 'growl':
        this.spawnGrowl(intensity);
        return;
      case 'subDrop':
        this.spawnSubDrop(intensity);
        return;
      case 'creak':
        this.spawnTransient({
          freqStart: 68 + this.eventRng.next() * 55,
          freqEnd: 38 + this.eventRng.next() * 35,
          duration: 1.5 + this.eventRng.next() * 0.7,
          type: 'sawtooth',
          fmFreq: 11 + this.eventRng.next() * 24,
          fmIndex: 85 * intensity,
          gain: 0.22 * intensity,
          lp: 880,
          pan: this.eventRng.next() * 1.4 - 0.7,
        });
        return;
      case 'wail': {
        const f = 220 + this.eventRng.next() * 240;
        this.spawnTransient({
          freqStart: f,
          freqEnd: f * 0.48,
          duration: 2.5,
          type: 'triangle',
          fmFreq: 5.2,
          fmIndex: f * 0.06,
          gain: 0.16 * intensity,
          lp: 1650,
          attack: 0.55,
          pan: this.eventRng.next() * 1.4 - 0.7,
        });
        return;
      }
      case 'lurch':
        this.spawnTransient({
          freqStart: Math.max(80, this.nodes.osc1.frequency.value * 2.5),
          freqEnd: Math.max(26, this.nodes.osc1.frequency.value * 0.5),
          duration: 1.15,
          type: 'square',
          fmFreq: 42,
          fmIndex: 180 * intensity,
          gain: 0.24 * intensity,
          lp: 1200,
        });
        break;
      case 'shepardDive':
        this.nodes.shepardBus.gain.setTargetAtTime(0.32 * intensity, t, 0.12);
        this.nodes.shepardBus.gain.setTargetAtTime(0.05, t + 2.4, 0.7);
        return;
    }

    if (eventName === 'portal') {
      this.spawnTransient({
        freqStart: 170 + this.eventRng.next() * 80,
        freqEnd: 640 + this.eventRng.next() * 180,
        duration: 1.05,
        type: 'triangle',
        fmFreq: 105,
        fmIndex: 120 * intensity,
        gain: 0.22 * intensity,
        lp: 2200,
        pan: (this.eventRng.next() * 2 - 1) * 0.65,
      });
    } else if (eventName === 'collision') {
      this.spawnSubDrop(intensity);
    } else if (eventName === 'nearMiss') {
      this.spawnTransient({
        freqStart: 540 + this.eventRng.next() * 140,
        freqEnd: 125,
        duration: 0.48,
        type: 'sawtooth',
        fmFreq: 210,
        fmIndex: 180 * intensity,
        gain: 0.22 * intensity,
        lp: 1900,
        pan: this.eventRng.next() > 0.5 ? 0.8 : -0.8,
      });
    }

    const steps = this.getStepsForEvent(eventName, paramMap, intensity);
    if (!steps.length) return;

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

  private spawnTransient(opts: {
    freqStart: number;
    freqEnd: number;
    duration: number;
    type?: OscillatorType;
    fmFreq?: number;
    fmIndex?: number;
    gain?: number;
    lp?: number;
    attack?: number;
    pan?: number;
  }): void {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const dur = Math.max(0.15, opts.duration);
    const osc = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const modGain = ctx.createGain();
    const filt = ctx.createBiquadFilter();
    const env = ctx.createGain();
    const pan = ctx.createStereoPanner();

    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(Math.max(20, opts.freqStart), now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.freqEnd), now + dur);

    mod.type = 'sine';
    mod.frequency.setValueAtTime(opts.fmFreq ?? 80, now);
    modGain.gain.setValueAtTime(Math.max(0.1, opts.fmIndex ?? 50), now);
    modGain.gain.exponentialRampToValueAtTime(0.1, now + dur);

    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(opts.lp ?? 2200, now);
    filt.frequency.exponentialRampToValueAtTime(180, now + dur);

    const atk = Math.min(opts.attack ?? 0.02, dur * 0.45);
    env.gain.setValueAtTime(0.0001, now);
    env.gain.linearRampToValueAtTime(opts.gain ?? 0.25, now + atk);
    env.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    pan.pan.value = Math.max(-1, Math.min(1, opts.pan ?? 0));

    mod.connect(modGain);
    modGain.connect(osc.frequency);
    osc.connect(filt);
    filt.connect(env);
    env.connect(pan);
    pan.connect(this.nodes.postGain);

    osc.start(now);
    mod.start(now);
    osc.stop(now + dur + 0.05);
    mod.stop(now + dur + 0.05);

    osc.onended = () => {
      [osc, mod, modGain, filt, env, pan].forEach((n) => {
        try {
          n.disconnect();
        } catch {
          // Ignore cleanup errors
        }
      });
    };
  }

  private spawnWhisper(intensity: number): void {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const r = this.eventRng;
    const dur = 0.75 + r.next() * 0.85;

    const src = ctx.createBufferSource();
    src.buffer = this.nodes.whiteNoiseBuffer;
    src.playbackRate.value = 0.88 + r.next() * 0.3;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    const fStart = 950 + r.next() * 1200;
    bp.frequency.setValueAtTime(fStart, now);
    bp.frequency.linearRampToValueAtTime(750 + r.next() * 1700, now + dur);
    bp.Q.value = 7 + r.next() * 6;

    const amGain = ctx.createGain();
    amGain.gain.value = 0.5;
    const amOsc = ctx.createOscillator();
    amOsc.frequency.value = 8 + r.next() * 7;
    const amDepth = ctx.createGain();
    amDepth.gain.value = 0.4;
    amOsc.connect(amDepth);
    amDepth.connect(amGain.gain);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.linearRampToValueAtTime(0.28 + intensity * 0.22, now + dur * 0.35);
    env.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    const pan = ctx.createStereoPanner();
    pan.pan.value = r.next() * 1.6 - 0.8;

    src.connect(bp);
    bp.connect(amGain);
    amGain.connect(env);
    env.connect(pan);
    pan.connect(this.nodes.postGain);

    src.start(now, r.next() * 1.5, dur + 0.05);
    src.stop(now + dur + 0.1);
    amOsc.start(now);
    amOsc.stop(now + dur + 0.1);

    src.onended = () => {
      [src, bp, amGain, amOsc, amDepth, env, pan].forEach((n) => {
        try {
          n.disconnect();
        } catch {
          // Ignore cleanup errors
        }
      });
    };
  }

  private spawnGrowl(intensity: number): void {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const r = this.eventRng;
    const base = Math.max(36, this.nodes.osc1.frequency.value);
    const dur = 0.75 + r.next() * 0.45;

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(base * (1.15 + r.next() * 0.45), now);
    osc.frequency.setTargetAtTime(base * 0.8, now, 0.3);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 280 + intensity * 240;
    lp.Q.value = 4.2;

    const growlGain = ctx.createGain();
    growlGain.gain.value = 0.25;
    const amOsc = ctx.createOscillator();
    amOsc.frequency.value = 24 + r.next() * 14;
    const amDepth = ctx.createGain();
    amDepth.gain.value = 0.18;
    amOsc.connect(amDepth);
    amDepth.connect(growlGain.gain);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.linearRampToValueAtTime(0.4 + intensity * 0.2, now + 0.05);
    env.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    osc.connect(lp);
    lp.connect(growlGain);
    growlGain.connect(env);
    env.connect(this.nodes.postGain);

    osc.start(now);
    osc.stop(now + dur + 0.05);
    amOsc.start(now);
    amOsc.stop(now + dur + 0.05);

    osc.onended = () => {
      [osc, lp, growlGain, amOsc, amDepth, env].forEach((n) => {
        try {
          n.disconnect();
        } catch {
          // Ignore cleanup errors
        }
      });
    };
  }

  private spawnSubDrop(intensity: number): void {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(62 + this.eventRng.next() * 12, now);
    osc.frequency.exponentialRampToValueAtTime(18, now + 1.5);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.linearRampToValueAtTime(0.48 + intensity * 0.18, now + 0.03);
    env.gain.exponentialRampToValueAtTime(0.0001, now + 1.65);

    osc.connect(env);
    env.connect(this.nodes.postGain);
    osc.start(now);
    osc.stop(now + 1.75);
    osc.onended = () => {
      try {
        osc.disconnect();
        env.disconnect();
      } catch {
        // Ignore cleanup errors
      }
    };
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
          { param: 'filter.frequency', to: Math.min(4800, baseFilterFreq + 1100 * intensity), time: 0.35, curve: 'exponential' },
          { param: 'filter.frequency', to: baseFilterFreq, time: 1.1, after: 0.35, curve: 'exponential', returnToBase: true },
          { param: 'reverb.mix', to: Math.min(0.75, baseReverbMix + 0.25 * intensity), time: 0.3, curve: 'linear' },
          { param: 'reverb.mix', to: baseReverbMix, time: 1.2, after: 0.3, curve: 'linear', returnToBase: true },
        ];

      case 'portal':
        return [
          { param: 'filter.frequency', to: Math.min(6200, 380 + 2600 * intensity), time: 0.45, curve: 'exponential' },
          { param: 'filter.frequency', to: baseFilterFreq, time: 1.45, after: 0.45, curve: 'exponential', returnToBase: true },
          { param: 'filter.Q', to: Math.min(24, baseFilterQ + 10 * intensity), time: 0.3, curve: 'linear' },
          { param: 'filter.Q', to: baseFilterQ, time: 1.6, after: 0.3, curve: 'linear', returnToBase: true },
          { param: 'delay.feedback', to: Math.min(0.84, baseFeedback + 0.28 * intensity), time: 0.3, curve: 'linear' },
          { param: 'delay.feedback', to: baseFeedback, time: 1.6, after: 0.3, curve: 'linear', returnToBase: true },
        ];

      case 'collision':
        return [
          { param: 'noise.gain', to: Math.min(0.75, baseNoise + 0.45 * intensity), time: 0.04, curve: 'linear' },
          { param: 'noise.gain', to: baseNoise, time: 0.46, after: 0.04, curve: 'linear', returnToBase: true },
          { param: 'filter.Q', to: Math.min(24, baseFilterQ + 14 * intensity), time: 0.04, curve: 'linear' },
          { param: 'filter.Q', to: baseFilterQ, time: 0.46, after: 0.04, curve: 'linear', returnToBase: true },
          { param: 'osc1.detune', to: baseOsc1Detune - 90 * intensity, time: 0.05, curve: 'linear' },
          { param: 'osc1.detune', to: baseOsc1Detune, time: 0.45, after: 0.05, curve: 'linear', returnToBase: true },
          { param: 'masterGain', to: Math.max(0.2, baseMaster * (1 - 0.28 * intensity)), time: 0.02, curve: 'linear' },
          { param: 'masterGain', to: baseMaster, time: 0.48, after: 0.02, curve: 'linear', returnToBase: true },
        ];

      case 'gameOver':
        return [
          { param: 'filter.frequency', to: Math.max(85, baseFilterFreq * (1 - 0.78 * intensity)), time: 2.6, curve: 'exponential' },
          { param: 'reverb.mix', to: Math.min(0.88, baseReverbMix + 0.45 * intensity), time: 1.8, curve: 'linear' },
          { param: 'delay.feedback', to: Math.min(0.84, baseFeedback + 0.3 * intensity), time: 2.0, curve: 'linear' },
        ];

      case 'danger':
        return [
          { param: 'osc1.detune', to: baseOsc1Detune + 35 * intensity, time: 0.45, curve: 'linear' },
          { param: 'osc1.detune', to: baseOsc1Detune, time: 1.0, after: 0.45, curve: 'linear', returnToBase: true },
          { param: 'osc2.detune', to: baseOsc2Detune - 28 * intensity, time: 0.45, curve: 'linear' },
          { param: 'osc2.detune', to: baseOsc2Detune, time: 1.0, after: 0.45, curve: 'linear', returnToBase: true },
          { param: 'noise.gain', to: Math.min(0.55, baseNoise + 0.18 * intensity), time: 0.25, curve: 'linear' },
          { param: 'noise.gain', to: baseNoise, time: 1.2, after: 0.25, curve: 'linear', returnToBase: true },
        ];

      case 'nearMiss':
        return [
          { param: 'filter.Q', to: Math.min(22, baseFilterQ + 10 * intensity), time: 0.08, curve: 'linear' },
          { param: 'filter.Q', to: baseFilterQ, time: 0.72, after: 0.08, curve: 'linear', returnToBase: true },
          { param: 'noise.gain', to: Math.min(0.5, baseNoise + 0.18 * intensity), time: 0.05, curve: 'linear' },
          { param: 'noise.gain', to: baseNoise, time: 0.75, after: 0.05, curve: 'linear', returnToBase: true },
        ];

      case 'pass':
        return [
          { param: 'filter.frequency', to: Math.max(150, baseFilterFreq * (1 - 0.35 * intensity)), time: 0.7, curve: 'exponential' },
          { param: 'filter.frequency', to: baseFilterFreq, time: 0.8, after: 0.7, curve: 'exponential', returnToBase: true },
          { param: 'delay.mix', to: Math.max(0.05, baseDelayMix * 0.55), time: 0.7, curve: 'linear' },
          { param: 'delay.mix', to: baseDelayMix, time: 0.8, after: 0.7, curve: 'linear', returnToBase: true },
        ];

      case 'lurch':
        return [
          { param: 'osc1.detune', to: baseOsc1Detune - 450 * intensity, time: 0.06, curve: 'linear' },
          { param: 'osc1.detune', to: baseOsc1Detune, time: 0.95, after: 0.06, curve: 'linear', returnToBase: true },
        ];

      default:
        return [];
    }
  }
}
