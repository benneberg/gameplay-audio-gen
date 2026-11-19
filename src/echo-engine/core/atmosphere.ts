import { getSoundscapeProfile } from '../profiles';
import type {
  AtmosphereState,
  GameplayState,
  Preset,
  SoundscapeProfileId,
} from '../types';
import type { AudioGraphNodes } from './audio-graph';
import type { ModulationEngine } from './modulation';

/**
 * AtmosphereController owns all explicit continuous mappings from:
 *   Soundscape Profile + Base Preset + Atmosphere (tension/instability/complexity)
 *   + Gameplay Vectors (progress/proximity/danger) -> Web Audio Node Parameters.
 *
 * Gameplay state inputs remain strictly independent: updating `proximity` or
 * `progress` never mutates `tension` or overwrites base preset parameters.
 */
export class AtmosphereController {
  private ctx: AudioContext;
  private nodes: AudioGraphNodes;
  private modulation: ModulationEngine;

  public current: AtmosphereState = { tension: 0.25, instability: 0.3, complexity: 0.45 };
  public gameplay: GameplayState = {
    tension: 0.25,
    instability: 0.3,
    complexity: 0.45,
    progress: 0,
    proximity: 0,
    danger: 0,
  };
  private profileId: SoundscapeProfileId = 'abyss';
  private basePreset: Preset | null = null;
  private rampTime = 0.28;

  constructor(ctx: AudioContext, nodes: AudioGraphNodes, modulation: ModulationEngine) {
    this.ctx = ctx;
    this.nodes = nodes;
    this.modulation = modulation;
  }

  setBasePreset(preset: Preset): void {
    this.basePreset = structuredClone(preset);
    this.profileId = preset.profile ?? this.profileId;
    this.current = { ...preset.atmosphere };
    this.gameplay.tension = preset.atmosphere.tension;
    this.gameplay.instability = preset.atmosphere.instability;
    this.gameplay.complexity = preset.atmosphere.complexity;
  }

  setProfile(profileId: SoundscapeProfileId, applyToAudio = true): void {
    this.profileId = profileId;
    if (applyToAudio) {
      this.apply();
    }
  }

  getProfileId(): SoundscapeProfileId {
    return this.profileId;
  }

  setAtmosphere(
    tension: number,
    instability: number,
    complexity: number,
    applyToAudio = true
  ): void {
    const next = {
      tension: this.clamp(tension, 0, 1),
      instability: this.clamp(instability, 0, 1),
      complexity: this.clamp(complexity, 0, 1),
    };
    this.current = next;
    this.gameplay.tension = next.tension;
    this.gameplay.instability = next.instability;
    this.gameplay.complexity = next.complexity;

    if (applyToAudio) {
      this.apply();
    }
  }

  /**
   * Updates an individual gameplay dimension explicitly without coupling or
   * mutating unrelated state dimensions.
   */
  setGameplayState(key: keyof GameplayState, value: number, applyToAudio = true): void {
    const v = this.clamp(value, 0, 1);
    this.gameplay[key] = v;

    if (key === 'tension' || key === 'instability' || key === 'complexity') {
      this.current[key] = v;
    }

    if (applyToAudio) {
      this.apply();
    }
  }

  getGameplayState(): GameplayState {
    return { ...this.gameplay };
  }

  apply(): void {
    const preset = this.basePreset;
    if (!preset) return;

    const profile = getSoundscapeProfile(this.profileId);
    const { tension, instability, complexity, progress, proximity, danger } = this.gameplay;
    const t = this.ctx.currentTime;
    const r = this.rampTime;

    // Explicit additive combinations — predictable and side-effect free
    const effTension = this.clamp(tension + danger * 0.45, 0, 1);
    const effInstability = this.clamp(instability + danger * 0.35, 0, 1);
    const effComplexity = this.clamp(complexity + progress * 0.3, 0, 1);

    const synth = preset.synthesis;
    const baseSub = synth?.subLevel ?? profile.defaults.subLevel;
    const baseFmDepth = synth?.fmDepth ?? profile.defaults.fmDepth;
    const baseShepard = synth?.shepardMix ?? profile.defaults.shepardMix;
    const baseShepardRate = synth?.shepardRate ?? profile.defaults.shepardRate;

    // 1. Pitch progression & harmonic detune spread
    const progPitchScale = 1 + progress * 0.12;
    this.rampParam(this.nodes.osc1.frequency, preset.sources.osc1.frequency * progPitchScale, t, r);
    this.rampParam(this.nodes.osc2.frequency, preset.sources.osc2.frequency * progPitchScale, t, r);
    this.rampParam(this.nodes.osc3.frequency, preset.sources.osc3.frequency * progPitchScale, t, r);
    this.rampParam(this.nodes.subOsc.frequency, Math.max(20, preset.sources.osc1.frequency * 0.5 * progPitchScale), t, r);

    const detuneSpread =
      profile.detuneSpreadCents * (0.4 + effTension * 0.8 + effInstability * 0.7);
    this.rampParam(
      this.nodes.osc1.detune,
      preset.sources.osc1.detune - detuneSpread * 0.4,
      t,
      r
    );
    this.rampParam(
      this.nodes.osc2.detune,
      preset.sources.osc2.detune + detuneSpread * 0.6 + danger * 18,
      t,
      r
    );
    this.rampParam(
      this.nodes.osc3.detune,
      preset.sources.osc3.detune - detuneSpread * 0.3,
      t,
      r
    );

    // 2. Voice layering & sub-octave weight (proximity pulls sub closer)
    const layerScale = 0.65 + effComplexity * 0.55;
    this.rampParam(
      this.nodes.osc1Gain.gain,
      this.clamp(preset.sources.osc1.gain * layerScale, 0.04, 0.75),
      t,
      r
    );
    this.rampParam(
      this.nodes.osc2Gain.gain,
      this.clamp(preset.sources.osc2.gain * (0.55 + effComplexity * 0.65), 0.02, 0.7),
      t,
      r
    );
    this.rampParam(
      this.nodes.osc3Gain.gain,
      this.clamp(preset.sources.osc3.gain * (0.35 + effComplexity * 0.85), 0, 0.6),
      t,
      r
    );
    this.rampParam(
      this.nodes.subGain.gain,
      this.clamp((baseSub + profile.subBoost * 0.35 + proximity * 0.25) * 0.48, 0, 0.72),
      t,
      r
    );

    // 3. Cross-FM timbre (replaces siren pitch sweeps with rich harmonic grit)
    const targetFm = this.clamp(
      (baseFmDepth * profile.fmMultiplier) * (0.7 + effTension * 0.9 + danger * 0.5),
      0,
      260
    );
    this.rampParam(this.nodes.fmGain.gain, targetFm, t, r);

    // 4. Filter cutoff & resonance (explicit proximity + tension lift)
    const cutoffMult =
      profile.cutoffBias * (0.85 + effTension * 0.75 + proximity * 0.85 + progress * 0.25);
    const targetCutoff = this.clamp(preset.filter.frequency * cutoffMult, 45, 7500);
    const targetQ = this.clamp(
      preset.filter.Q * profile.qBias + effTension * 4.2 + proximity * 2.5,
      0.5,
      24
    );
    this.rampParam(this.nodes.filter.frequency, targetCutoff, t, r);
    this.rampParam(this.nodes.filter.Q, targetQ, t, r);

    // 5. Noise & whisper formant presence
    this.rampParam(
      this.nodes.noiseGain.gain,
      this.clamp(preset.sources.noise.gain * (0.75 + effTension * 0.55 + proximity * 0.35), 0, 0.65),
      t,
      r
    );
    const formantLvl = preset.sources.noise.formantLevel ?? 0.14;
    this.rampParam(
      this.nodes.formantGain.gain,
      this.clamp(formantLvl * (0.7 + effInstability * 0.6 + proximity * 0.4), 0, 0.5),
      t,
      r
    );

    // 6. Modulation rates & depths (keep LFO1 gentle if user kept frequency target, rich on filter)
    const lfo1Target = this.modulation.lfoConfigs[0]?.target;
    const baseLfo1Rate = preset.modulation.lfo1.rate;
    const rateScale = lfo1Target === 'osc1.frequency' ? 1 + effInstability * 0.35 : 1 + effTension * 0.8 + effInstability * 0.4;
    this.modulation.setLFORate(1, Math.min(8, baseLfo1Rate * rateScale));

    const lfo2Target = this.modulation.lfoConfigs[1]?.target;
    if (lfo2Target === 'filter.frequency') {
      const baseDepth = preset.modulation.lfo2.depth;
      this.modulation.setLFODepth(2, Math.min(1800, baseDepth * (0.7 + effComplexity * 0.65 + effTension * 0.4)));
    }

    // 7. Random-walk step scaling via instability
    if (this.modulation.walks[0]) {
      this.modulation.walks[0].stepSize =
        preset.modulation.randomWalk1.stepSize * (0.6 + effInstability * 1.4);
    }
    if (this.modulation.walks[1]) {
      this.modulation.walks[1].stepSize =
        preset.modulation.randomWalk2.stepSize * (0.6 + effInstability * 1.4);
    }
    if (this.modulation.walks[2]) {
      this.modulation.walks[2].stepSize =
        preset.modulation.randomWalk3.stepSize * (0.6 + effInstability * 1.3);
    }

    // 8. Shepard infinity layer (driven by preset + profile + danger/complexity)
    const shepMix = this.clamp(
      baseShepard + profile.shepardBias * effComplexity * 0.4 + danger * 0.15,
      0,
      0.9
    );
    this.modulation.configureShepard(
      shepMix,
      baseShepardRate * (1 + effTension * 0.5),
      preset.sources.osc1.frequency * 1.4
    );

    // 9. Delay feedback, damping & reverb cavern mix
    const dampingHz = preset.effects.delay.damping ?? profile.delayDampingHz;
    this.rampParam(
      this.nodes.delayDamping.frequency,
      this.clamp(dampingHz * (0.9 + proximity * 0.45), 350, 4800),
      t,
      r
    );
    this.rampParam(
      this.nodes.delayFeedback.gain,
      this.clamp(preset.effects.delay.feedback + effTension * 0.14, 0, 0.86),
      t,
      r
    );
    this.rampParam(
      this.nodes.delayMix.gain,
      this.clamp(preset.effects.delay.mix * (0.75 + effComplexity * 0.45), 0, 0.78),
      t,
      r
    );

    const revTarget = preset.effects.reverb.enabled
      ? this.clamp(
          preset.effects.reverb.mix + profile.reverbBoost * 0.5 + effComplexity * 0.12 - proximity * 0.08,
          0,
          0.88
        )
      : 0;
    this.rampParam(this.nodes.reverbMix.gain, revTarget, t, r);
  }

  private rampParam(param: AudioParam, value: number, time: number, rampTime: number): void {
    try {
      param.cancelScheduledValues(time);
      param.setValueAtTime(param.value, time);
      param.linearRampToValueAtTime(value, time + rampTime);
    } catch {
      param.setTargetAtTime(value, time, 0.08);
    }
  }

  private clamp(v: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, v));
  }
}
