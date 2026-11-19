import {
  type AudioGraphNodes,
  buildAudioGraph,
  buildTransferCurve,
  generateNoiseBuffer,
  generateReverbIR,
} from './core/audio-graph';
import { AtmosphereController } from './core/atmosphere';
import { EventEngine } from './core/events';
import { ModulationEngine } from './core/modulation';
import { createSeededStreams, type SeededStreams } from './core/rng';
import { BUILT_IN_PRESETS } from './presets/defaults';
import { validateAndNormalizePreset } from './presets/preset-manager';
import { getSoundscapeProfile } from './profiles';
import type {
  AtmosphereState,
  EchoEngineConfig,
  EngineCallback,
  EngineEventName,
  EngineState,
  EventName,
  EventOptions,
  FilterType,
  GameplayState,
  LFOConfig,
  ModulationTarget,
  NoiseFilterType,
  NoiseType,
  NotePlayOptions,
  OscillatorWaveform,
  Preset,
  RandomWalkConfig,
  SoundscapeProfileId,
} from './types';

interface ActiveVoiceHandle {
  oscs: OscillatorNode[];
  env: GainNode;
  filter: BiquadFilterNode;
  cleanupNodes: AudioNode[];
  midi: number;
  releaseSec: number;
}

export class EchoEngine {
  private config: {
    seed: number;
    volume: number;
    analyser: boolean;
  };
  private engineState: EngineState = 'idle';
  private activeProfile: SoundscapeProfileId = 'abyss';
  private ctx: AudioContext | null = null;
  private nodes: AudioGraphNodes | null = null;
  private streams: SeededStreams;
  private modulation: ModulationEngine | null = null;
  private atmosphere: AtmosphereController | null = null;
  private events: EventEngine | null = null;
  private gameplayState: GameplayState = {
    tension: 0.25,
    instability: 0.3,
    complexity: 0.48,
    progress: 0.0,
    proximity: 0.0,
    danger: 0.0,
  };
  private callbacks: EngineCallback[] = [];
  private activePreset: Preset;
  private activeVoices = new Map<string, ActiveVoiceHandle>();
  private wasPlayingBeforeHide = false;
  private visibilityHandler: (() => void) | null = null;

  constructor(config: EchoEngineConfig = {}) {
    const initialPreset = config.preset
      ? validateAndNormalizePreset(config.preset)
      : structuredClone(BUILT_IN_PRESETS[0]);

    const seed = config.seed ?? initialPreset.seed ?? (Date.now() % 100000);
    initialPreset.seed = seed;

    this.activeProfile = config.profile ?? initialPreset.profile ?? 'abyss';
    initialPreset.profile = this.activeProfile;

    this.config = {
      seed,
      volume: config.volume ?? initialPreset.master.gain ?? 0.72,
      analyser: config.analyser ?? true,
    };

    initialPreset.master.gain = this.config.volume;
    this.activePreset = initialPreset;
    this.gameplayState = {
      tension: initialPreset.atmosphere.tension,
      instability: initialPreset.atmosphere.instability,
      complexity: initialPreset.atmosphere.complexity,
      progress: 0,
      proximity: 0,
      danger: 0,
    };

    this.streams = createSeededStreams(seed);
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
          this.pauseForBackground();
        }
      } else if (this.wasPlayingBeforeHide && (this.engineState === 'suspended' || this.engineState === 'recoverable')) {
        this.wasPlayingBeforeHide = false;
        void this.attemptBackgroundResume();
      }
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  private pauseForBackground(): void {
    if (!this.ctx) return;
    this.releaseAllNotes();
    this.modulation?.pause();
    const now = this.ctx.currentTime;
    if (this.nodes) {
      this.nodes.masterGain.gain.setTargetAtTime(0.0001, now, 0.04);
    }
    void this.ctx.suspend();
    this.setEngineState('suspended');
    this.emit('stopped', { reason: 'visibilitychange' });
  }

  private async attemptBackgroundResume(): Promise<void> {
    if (!this.ctx || this.engineState === 'destroyed') return;
    try {
      await this.ctx.resume();
    } catch {
      // Browser autoplay policy blocked resume without user gesture
    }

    if (this.ctx.state === 'running') {
      if (this.nodes) {
        this.nodes.masterGain.gain.setTargetAtTime(
          this.config.volume,
          this.ctx.currentTime,
          0.12
        );
      }
      this.modulation?.resume();
      this.setEngineState('playing');
      this.emit('started', { seed: this.config.seed, resumed: true });
    } else {
      this.setEngineState('recoverable');
      this.emit('resumeRequired', { state: this.ctx.state });
    }
  }

  async start(): Promise<void> {
    if (this.engineState === 'playing' && this.ctx?.state === 'running') return;
    if (this.engineState === 'destroyed') {
      throw new Error('EchoEngine has been destroyed');
    }

    this.setEngineState('starting');

    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx({ latencyHint: 'interactive' });
    }

    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    if (this.ctx.state !== 'running') {
      this.setEngineState('recoverable');
      this.emit('resumeRequired', { state: this.ctx.state });
      throw new Error('AudioContext requires user gesture to resume');
    }

    if (!this.nodes) {
      this.streams.resetAll(this.config.seed);
      this.nodes = buildAudioGraph(this.ctx, this.config.analyser, this.streams.buffers);
      this.modulation = new ModulationEngine(this.ctx, this.nodes, this.streams.walk);
      this.atmosphere = new AtmosphereController(this.ctx, this.nodes, this.modulation);
      this.events = new EventEngine(this.ctx, this.nodes, this.streams.events);
      this.applyPresetToGraph(this.activePreset);
    } else {
      this.nodes.masterGain.gain.setTargetAtTime(this.config.volume, this.ctx.currentTime, 0.08);
      this.modulation?.resume();
    }

    this.wasPlayingBeforeHide = false;
    this.setEngineState('playing');
    this.emit('started', { seed: this.config.seed });
  }

  stop(): void {
    this.wasPlayingBeforeHide = false;
    this.releaseAllNotes();
    if (this.ctx && (this.engineState === 'playing' || this.engineState === 'recoverable')) {
      this.modulation?.pause();
      if (this.nodes) {
        this.nodes.masterGain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.05);
      }
      void this.ctx.suspend();
      this.setEngineState('suspended');
      this.emit('stopped', {});
    }
  }

  destroy(): void {
    this.releaseAllNotes();
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
      return (this.gameplayState as unknown as Record<string, number>)[key] ?? 0;
    }
    return this.engineState;
  }

  getGameplayState(): GameplayState {
    return { ...this.gameplayState };
  }

  private setEngineState(next: EngineState): void {
    if (this.engineState !== next) {
      this.engineState = next;
      this.emit('stateChange', { state: next });
    }
  }

  // === Soundscape Profile (High-Level Sonic Identity) ===

  getProfile(): SoundscapeProfileId {
    return this.activeProfile;
  }

  setProfile(profileId: SoundscapeProfileId): void {
    this.activeProfile = profileId;
    this.activePreset.profile = profileId;
    const profile = getSoundscapeProfile(profileId);

    if (this.ctx && this.nodes) {
      // Update waveshaper drive bias + delay damping smoothly without resetting preset or seed
      const synth = this.activePreset.synthesis ?? profile.defaults;
      this.nodes.shaper.curve = buildTransferCurve(
        Math.min(1, synth.drive + profile.driveBoost),
        synth.crush
      );
      this.atmosphere?.setProfile(profileId, true);
    }

    this.emit('profileChanged', { profile: profileId });
  }

  // === Explicit Atmosphere & Gameplay Controls ===

  setAtmosphere(tension: number, instability: number, complexity: number): void {
    const clamped = {
      tension: Math.max(0, Math.min(1, tension)),
      instability: Math.max(0, Math.min(1, instability)),
      complexity: Math.max(0, Math.min(1, complexity)),
    };
    this.activePreset.atmosphere = { ...clamped };
    this.gameplayState.tension = clamped.tension;
    this.gameplayState.instability = clamped.instability;
    this.gameplayState.complexity = clamped.complexity;

    if (this.atmosphere) {
      this.atmosphere.setAtmosphere(clamped.tension, clamped.instability, clamped.complexity, true);
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

  /**
   * Updates an individual gameplay dimension explicitly.
   * AtmosphereController owns all state-to-audio mappings so updating
   * e.g. `proximity` never implicitly mutates `tension` or preset baselines.
   */
  setState(key: keyof GameplayState | string, value: number): void {
    const clamped = Math.max(0, Math.min(1, value));
    if (key in this.gameplayState) {
      const k = key as keyof GameplayState;
      this.gameplayState[k] = clamped;
      if (k === 'tension' || k === 'instability' || k === 'complexity') {
        this.activePreset.atmosphere[k] = clamped;
      }
      if (this.atmosphere) {
        this.atmosphere.setGameplayState(k, clamped, true);
      }
    }
  }

  // === Discrete Events ===

  triggerEvent(eventName: EventName | string, options?: EventOptions): void {
    if (eventName === 'newGame') {
      const newSeed = Math.floor(Math.random() * 900000) + 1000;
      this.reseed(newSeed, true);
    }
    if (this.events && this.ctx && this.ctx.state === 'running') {
      this.events.trigger(eventName, options);
    }
    this.emit('eventTriggered', { name: eventName, options: options ?? {} });
  }

  // === Playable Keyboard & Piano Roll Notes ===

  midiToFreq(midi: number, tuningScale = 1): number {
    return 440 * Math.pow(2, ((midi - 69) * tuningScale) / 12);
  }

  noteOn(voiceId: string, midi: number, opts: NotePlayOptions = {}): void {
    if (!this.ctx || !this.nodes || this.ctx.state !== 'running') return;
    if (this.activeVoices.has(voiceId)) {
      this.noteOff(voiceId, 0.03);
    }

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const freq = this.midiToFreq(midi, opts.tuningScale ?? 1);
    const vel = Math.max(0.05, Math.min(1, opts.vel ?? 0.8));
    const attack = Math.max(0.005, Math.min(2.0, opts.attack ?? 0.02));
    const release = Math.max(0.05, Math.min(4.0, opts.release ?? 0.65));

    const src = this.activePreset.sources;
    const synth = this.activePreset.synthesis ?? getSoundscapeProfile(this.activeProfile).defaults;
    const osc2Ratio =
      src.osc1.frequency > 0 ? src.osc2.frequency / src.osc1.frequency : 1.5;

    const osc1 = ctx.createOscillator();
    osc1.type = src.osc1.waveform;
    osc1.frequency.setValueAtTime(freq, now);
    osc1.detune.setValueAtTime(-(opts.detuneSpread ?? 10) * 0.5, now);

    const osc2 = ctx.createOscillator();
    osc2.type = src.osc2.waveform;
    osc2.frequency.setValueAtTime(freq * Math.max(0.5, Math.min(3, osc2Ratio)), now);
    osc2.detune.setValueAtTime((opts.detuneSpread ?? 10) * 0.5, now);

    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(Math.max(20, freq * 0.5), now);

    const fm = ctx.createOscillator();
    fm.type = 'sine';
    fm.frequency.setValueAtTime(freq * synth.fmRatio, now);
    const fmGain = ctx.createGain();
    fmGain.gain.setValueAtTime(Math.min(110, synth.fmDepth * 0.85), now);

    const g1 = ctx.createGain();
    g1.gain.value = 0.36;
    const g2 = ctx.createGain();
    g2.gain.value = 0.24;
    const gs = ctx.createGain();
    gs.gain.value = Math.min(0.65, synth.subLevel * 0.55 + 0.12);

    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(
      Math.max(120, Math.min(9500, this.activePreset.filter.frequency * (1.8 + vel * 2.4))),
      now
    );
    filt.Q.setValueAtTime(Math.min(10, this.activePreset.filter.Q * 0.65 + 1), now);

    const env = ctx.createGain();
    const peak = 0.36 * vel;
    env.gain.setValueAtTime(0.0001, now);
    env.gain.linearRampToValueAtTime(peak, now + attack);
    env.gain.setTargetAtTime(peak * 0.65, now + attack, 0.22);

    fm.connect(fmGain);
    fmGain.connect(osc1.frequency);
    osc1.connect(g1);
    osc2.connect(g2);
    sub.connect(gs);
    g1.connect(filt);
    g2.connect(filt);
    gs.connect(filt);
    filt.connect(env);
    env.connect(this.nodes.keyBus);

    [osc1, osc2, sub, fm].forEach((o) => o.start(now));

    const handle: ActiveVoiceHandle = {
      oscs: [osc1, osc2, sub, fm],
      env,
      filter: filt,
      cleanupNodes: [osc1, osc2, sub, fm, fmGain, g1, g2, gs, filt, env],
      midi,
      releaseSec: release,
    };

    this.activeVoices.set(voiceId, handle);

    // Cap polyphony for mobile CPU protection
    if (this.activeVoices.size > 10) {
      const oldestKey = this.activeVoices.keys().next().value;
      if (oldestKey) this.noteOff(oldestKey, 0.08);
    }
  }

  retuneVoice(voiceId: string, midi: number, tuningScale = 1): void {
    if (!this.ctx) return;
    const handle = this.activeVoices.get(voiceId);
    if (!handle) return;
    const now = this.ctx.currentTime;
    const freq = this.midiToFreq(midi, tuningScale);
    const src = this.activePreset.sources;
    const osc2Ratio =
      src.osc1.frequency > 0 ? src.osc2.frequency / src.osc1.frequency : 1.5;

    handle.oscs[0].frequency.setTargetAtTime(freq, now, 0.045);
    handle.oscs[1].frequency.setTargetAtTime(freq * Math.max(0.5, Math.min(3, osc2Ratio)), now, 0.045);
    handle.oscs[2].frequency.setTargetAtTime(Math.max(20, freq * 0.5), now, 0.045);
    handle.midi = midi;
  }

  noteOff(voiceId: string, overrideReleaseSec?: number): void {
    const handle = this.activeVoices.get(voiceId);
    if (!handle || !this.ctx) return;
    this.activeVoices.delete(voiceId);

    const now = this.ctx.currentTime;
    const rel = overrideReleaseSec ?? handle.releaseSec;
    try {
      handle.env.gain.cancelScheduledValues(now);
      handle.env.gain.setValueAtTime(Math.max(0.0001, handle.env.gain.value), now);
      handle.env.gain.setTargetAtTime(0.0001, now, Math.max(0.02, rel / 4));
    } catch {
      // Ignore scheduling failures
    }

    const stopAt = now + rel + 0.15;
    handle.oscs.forEach((o) => {
      try {
        o.stop(stopAt);
      } catch {
        // Ignore already stopped
      }
    });

    handle.oscs[0].onended = () => {
      handle.cleanupNodes.forEach((n) => {
        try {
          n.disconnect();
        } catch {
          // Ignore disconnect errors
        }
      });
    };
  }

  playNote(midi: number, opts: NotePlayOptions = {}): void {
    const dur = Math.max(0.05, opts.dur ?? 0.32);
    const id = `seq-${midi}-${Math.random().toString(36).slice(2, 7)}`;
    this.noteOn(id, midi, opts);
    window.setTimeout(() => {
      this.noteOff(id, opts.release ?? 0.25);
    }, dur * 1000);
  }

  releaseAllNotes(): void {
    for (const id of [...this.activeVoices.keys()]) {
      this.noteOff(id, 0.05);
    }
  }

  // === Direct Parameter Access ===

  setParam(paramPath: string, value: number): void {
    this.updatePresetField(paramPath, value);

    if (!this.ctx || !this.nodes || !this.modulation) return;
    const t = this.ctx.currentTime;

    if (paramPath === 'reverb.decay') {
      this.nodes.reverb.buffer = generateReverbIR(this.ctx, value, 2, this.streams.buffers);
      return;
    }

    if (paramPath === 'reverb.mix') {
      const effective = this.activePreset.effects.reverb.enabled ? value : 0;
      this.nodes.reverbMix.gain.setTargetAtTime(effective, t, 0.04);
      return;
    }

    if (paramPath === 'delay.damping') {
      this.nodes.delayDamping.frequency.setTargetAtTime(
        Math.max(300, Math.min(6000, value)),
        t,
        0.04
      );
      return;
    }

    if (paramPath === 'masterGain') {
      this.config.volume = Math.max(0, Math.min(1, value));
      this.nodes.masterGain.gain.setTargetAtTime(this.config.volume, t, 0.04);
      return;
    }

    if (paramPath === 'synthesis.subLevel') {
      this.nodes.subGain.gain.setTargetAtTime(Math.max(0, Math.min(1, value)) * 0.55, t, 0.04);
      return;
    }
    if (paramPath === 'synthesis.fmRatio') {
      const base = this.activePreset.sources.osc1.frequency;
      this.nodes.fmOsc.frequency.setTargetAtTime(Math.max(10, base * value), t, 0.04);
      return;
    }
    if (paramPath === 'synthesis.fmDepth') {
      this.nodes.fmGain.gain.setTargetAtTime(Math.max(0, Math.min(260, value)), t, 0.04);
      return;
    }
    if (paramPath === 'synthesis.fmFeedback') {
      const synth = this.activePreset.synthesis ?? getSoundscapeProfile(this.activeProfile).defaults;
      this.nodes.fmFeedbackGain.gain.setTargetAtTime(
        value * this.activePreset.sources.osc1.frequency * synth.fmRatio * 0.85,
        t,
        0.04
      );
      return;
    }
    if (paramPath === 'synthesis.ringFreq') {
      this.nodes.ringOsc.frequency.setTargetAtTime(Math.max(0.2, value), t, 0.04);
      return;
    }
    if (paramPath === 'synthesis.ringMix') {
      this.nodes.ringMix.gain.setTargetAtTime(Math.max(0, Math.min(1, value)) * 0.65, t, 0.04);
      return;
    }
    if (paramPath === 'synthesis.drive' || paramPath === 'synthesis.crush') {
      const synth = this.activePreset.synthesis ?? getSoundscapeProfile(this.activeProfile).defaults;
      this.nodes.shaper.curve = buildTransferCurve(synth.drive, synth.crush);
      return;
    }
    if (paramPath === 'synthesis.shepardMix' || paramPath === 'synthesis.shepardRate') {
      const synth = this.activePreset.synthesis ?? getSoundscapeProfile(this.activeProfile).defaults;
      this.modulation.configureShepard(
        synth.shepardMix,
        synth.shepardRate,
        this.activePreset.sources.osc1.frequency * 1.4
      );
      return;
    }
    if (paramPath === 'noise.formantFreq') {
      this.nodes.formantFilter.frequency.setTargetAtTime(Math.max(180, Math.min(3500, value)), t, 0.04);
      return;
    }
    if (paramPath === 'noise.formantLevel') {
      this.nodes.formantGain.gain.setTargetAtTime(Math.max(0, Math.min(1, value)) * 0.5, t, 0.04);
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
      if (paramPath === 'osc1.frequency') {
        const synth = this.activePreset.synthesis ?? getSoundscapeProfile(this.activeProfile).defaults;
        this.nodes.subOsc.frequency.setTargetAtTime(Math.max(20, value * 0.5), t, 0.04);
        this.nodes.fmOsc.frequency.setTargetAtTime(Math.max(10, value * synth.fmRatio), t, 0.04);
      }
    }
  }

  getParam(paramPath: string): number | null {
    const synth = this.activePreset.synthesis ?? getSoundscapeProfile(this.activeProfile).defaults;
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
      case 'noise.formantFreq':
        return this.activePreset.sources.noise.formantFreq ?? 650;
      case 'noise.formantLevel':
        return this.activePreset.sources.noise.formantLevel ?? 0.14;
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
      case 'delay.damping':
        return this.activePreset.effects.delay.damping ?? 1250;
      case 'reverb.mix':
        return this.activePreset.effects.reverb.mix;
      case 'reverb.decay':
        return this.activePreset.effects.reverb.decay;
      case 'synthesis.subLevel':
        return synth.subLevel;
      case 'synthesis.fmRatio':
        return synth.fmRatio;
      case 'synthesis.fmDepth':
        return synth.fmDepth;
      case 'synthesis.fmFeedback':
        return synth.fmFeedback;
      case 'synthesis.ringFreq':
        return synth.ringFreq;
      case 'synthesis.ringMix':
        return synth.ringMix;
      case 'synthesis.drive':
        return synth.drive;
      case 'synthesis.crush':
        return synth.crush;
      case 'synthesis.shepardMix':
        return synth.shepardMix;
      case 'synthesis.shepardRate':
        return synth.shepardRate;
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
          const oldNoise = this.nodes.noise;
          const nextNoise = this.ctx.createBufferSource();
          nextNoise.buffer = generateNoiseBuffer(
            this.ctx,
            type as NoiseType,
            5,
            this.streams.buffers
          );
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
    snapshot.profile = this.activeProfile;
    return snapshot;
  }

  loadPreset(preset: Preset): void {
    const normalized = validateAndNormalizePreset(preset);
    this.activePreset = structuredClone(normalized);
    this.activeProfile = normalized.profile ?? this.activeProfile;
    this.config.seed = normalized.seed;
    this.config.volume = normalized.master.gain;
    this.streams.resetAll(normalized.seed);

    this.gameplayState.tension = normalized.atmosphere.tension;
    this.gameplayState.instability = normalized.atmosphere.instability;
    this.gameplayState.complexity = normalized.atmosphere.complexity;

    if (this.ctx && this.nodes) {
      this.applyPresetToGraph(normalized);
    }

    this.emit('seedChanged', { seed: normalized.seed });
    this.emit('profileChanged', { profile: this.activeProfile });
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
    this.streams.resetAll(cleanSeed);
    this.emit('seedChanged', { seed: cleanSeed });
  }

  reseed(seed?: number, generateSonicIdentity = true): number {
    const nextSeed =
      seed !== undefined
        ? Math.floor(Math.abs(seed)) || 1
        : Math.floor(Math.random() * 999999) + 1;
    this.setSeed(nextSeed);

    if (generateSonicIdentity) {
      this.applySeededVariation();
    }

    return nextSeed;
  }

  private applySeededVariation(): void {
    const idRng = this.streams.identity;
    const profile = getSoundscapeProfile(this.activeProfile);

    const baseFreq =
      profile.rootFrequencies[idRng.nextInt(0, profile.rootFrequencies.length - 1)] *
      idRng.nextRange(0.97, 1.03);
    const osc2Ratio = profile.osc2Ratios[idRng.nextInt(0, profile.osc2Ratios.length - 1)];
    const osc3Ratio = profile.osc3Ratios[idRng.nextInt(0, profile.osc3Ratios.length - 1)];

    this.activePreset.profile = this.activeProfile;
    this.activePreset.sources.osc1 = {
      waveform: profile.preferredWaveforms[idRng.nextInt(0, profile.preferredWaveforms.length - 1)],
      frequency: Number(baseFreq.toFixed(1)),
      detune: Math.round(idRng.nextRange(-12, 12)),
      gain: Number(idRng.nextRange(0.24, 0.36).toFixed(2)),
    };
    this.activePreset.sources.osc2 = {
      waveform: profile.preferredWaveforms[idRng.nextInt(0, profile.preferredWaveforms.length - 1)],
      frequency: Number((baseFreq * osc2Ratio).toFixed(1)),
      detune: Math.round(idRng.nextRange(-18, 18)),
      gain: Number(idRng.nextRange(0.15, 0.28).toFixed(2)),
    };
    this.activePreset.sources.osc3 = {
      waveform: profile.preferredWaveforms[idRng.nextInt(0, Math.min(1, profile.preferredWaveforms.length - 1))],
      frequency: Number((baseFreq * osc3Ratio).toFixed(1)),
      detune: Math.round(idRng.nextRange(-14, 14)),
      gain: Number(idRng.nextRange(0.08, 0.22).toFixed(2)),
    };

    this.activePreset.sources.noise = {
      type: idRng.next() < 0.72 ? profile.preferredNoise : idRng.next() > 0.5 ? 'pink' : 'white',
      gain: Number(idRng.nextRange(0.12, 0.34).toFixed(2)),
      filterType: idRng.next() > 0.25 ? 'bandpass' : 'lowpass',
      filterFrequency: Math.round(idRng.nextRange(320, 1750)),
      filterQ: Number(idRng.nextRange(3.5, 11).toFixed(1)),
      formantFreq: Math.round(idRng.nextRange(420, 1200)),
      formantQ: Number(idRng.nextRange(6, 14).toFixed(1)),
      formantLevel: Number(idRng.nextRange(0.08, 0.32).toFixed(2)),
    };

    this.activePreset.filter = {
      type: 'lowpass',
      frequency: Math.round(idRng.nextRange(profile.cutoffRange[0], profile.cutoffRange[1])),
      Q: Number(idRng.nextRange(profile.qRange[0], profile.qRange[1]).toFixed(1)),
    };

    this.activePreset.synthesis = {
      subLevel: Number(idRng.nextRange(Math.max(0.2, profile.defaults.subLevel - 0.15), Math.min(0.9, profile.defaults.subLevel + 0.15)).toFixed(2)),
      fmRatio: Number(idRng.nextRange(0.5, 2.85).toFixed(2)),
      fmDepth: Math.round(idRng.nextRange(8, Math.max(24, profile.defaults.fmDepth * 1.4))),
      fmFeedback: Number(idRng.nextRange(0, Math.min(0.45, profile.defaults.fmFeedback + 0.15)).toFixed(2)),
      ringFreq: Number(idRng.nextRange(2, 42).toFixed(1)),
      ringMix: Number((idRng.next() < 0.45 ? idRng.nextRange(0.04, 0.22) : 0).toFixed(2)),
      drive: Number(idRng.nextRange(0.12, Math.min(0.55, profile.defaults.drive + 0.15)).toFixed(2)),
      crush: Number((profile.id === 'machine' && idRng.next() < 0.35 ? idRng.nextRange(0.05, 0.22) : 0).toFixed(2)),
      shepardMix: Number((profile.id === 'dissonance' || idRng.next() < 0.2 ? idRng.nextRange(0.08, 0.48) : 0).toFixed(2)),
      shepardRate: Number(idRng.nextRange(0.03, 0.08).toFixed(2)),
    };

    // Always favor organic timbral/spatial LFOs rather than repetitive pitch sirens
    this.activePreset.modulation.lfo1 = {
      waveform: 'sine',
      rate: Number(idRng.nextRange(0.03, 0.16).toFixed(2)),
      depth: Math.round(idRng.nextRange(6, 16)),
      target: idRng.next() > 0.35 ? 'osc1.detune' : 'fm.depth',
    };
    this.activePreset.modulation.lfo2 = {
      waveform: 'triangle',
      rate: Number(idRng.nextRange(0.02, 0.09).toFixed(2)),
      depth: Math.round(idRng.nextRange(90, 280)),
      target: 'filter.frequency',
    };
    this.activePreset.modulation.lfo3 = {
      waveform: 'sine',
      rate: Number(idRng.nextRange(0.015, 0.06).toFixed(3)),
      depth: Number(idRng.nextRange(0.35, 0.72).toFixed(2)),
      target: 'panner.pan',
    };

    this.activePreset.effects.delay = {
      time: Number(idRng.nextRange(0.26, 0.78).toFixed(2)),
      feedback: Number(idRng.nextRange(0.34, 0.65).toFixed(2)),
      mix: Number(idRng.nextRange(0.22, 0.46).toFixed(2)),
      damping: profile.delayDampingHz,
    };
    this.activePreset.effects.reverb = {
      enabled: true,
      mix: Number(idRng.nextRange(0.36, 0.7).toFixed(2)),
      decay: Number(idRng.nextRange(2.4, 4.8).toFixed(1)),
    };

    this.activePreset.atmosphere = {
      tension: Number(idRng.nextRange(0.18, 0.56).toFixed(2)),
      instability: Number(idRng.nextRange(0.18, 0.54).toFixed(2)),
      complexity: Number(idRng.nextRange(0.36, 0.72).toFixed(2)),
    };

    if (this.ctx && this.nodes) {
      this.applyPresetToGraph(this.activePreset);
    }
    this.emit('presetLoaded', {
      name: `${profile.label} #${this.config.seed}`,
      preset: this.getPreset(),
    });
  }

  // === Volume & Helpers ===

  setVolume(value: number): void {
    const v = Math.max(0, Math.min(1, value));
    this.config.volume = v;
    this.activePreset.master.gain = v;
    if (this.ctx && this.nodes && this.engineState === 'playing') {
      this.nodes.masterGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.04);
    }
  }

  getVolume(): number {
    return this.config.volume;
  }

  getAnalyser(): AnalyserNode | null {
    return this.nodes?.analyser ?? null;
  }

  getAudioContext(): AudioContext | null {
    return this.ctx;
  }

  getTextureRNGNext(): number {
    return this.streams.texture.next();
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
    const profile = getSoundscapeProfile(preset.profile ?? this.activeProfile);
    const synth = preset.synthesis ?? profile.defaults;

    // Oscillators + Sub + Cross-FM + Ring Mod
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

    this.nodes.subOsc.frequency.setTargetAtTime(
      Math.max(20, preset.sources.osc1.frequency * 0.5),
      t,
      0.05
    );
    this.nodes.subGain.gain.setTargetAtTime(synth.subLevel * 0.5, t, 0.05);

    this.nodes.fmOsc.frequency.setTargetAtTime(
      Math.max(10, preset.sources.osc1.frequency * synth.fmRatio),
      t,
      0.05
    );
    this.nodes.fmGain.gain.setTargetAtTime(synth.fmDepth, t, 0.05);
    this.nodes.fmFeedbackGain.gain.setTargetAtTime(
      synth.fmFeedback * preset.sources.osc1.frequency * synth.fmRatio * 0.85,
      t,
      0.05
    );

    this.nodes.ringOsc.frequency.setTargetAtTime(Math.max(0.2, synth.ringFreq), t, 0.05);
    this.nodes.ringMix.gain.setTargetAtTime(synth.ringMix * 0.65, t, 0.05);

    // Noise + Whisper Formant
    this.setParamType('noise.type', preset.sources.noise.type);
    this.nodes.noiseFilter.type = preset.sources.noise.filterType;
    this.nodes.noiseFilter.frequency.setTargetAtTime(preset.sources.noise.filterFrequency, t, 0.05);
    this.nodes.noiseFilter.Q.setTargetAtTime(preset.sources.noise.filterQ ?? 4.5, t, 0.05);
    this.nodes.noiseGain.gain.setTargetAtTime(preset.sources.noise.gain, t, 0.05);

    this.nodes.formantFilter.frequency.setTargetAtTime(
      preset.sources.noise.formantFreq ?? 650,
      t,
      0.05
    );
    this.nodes.formantFilter.Q.setTargetAtTime(preset.sources.noise.formantQ ?? 8, t, 0.05);
    this.nodes.formantGain.gain.setTargetAtTime(
      (preset.sources.noise.formantLevel ?? 0.14) * 0.5,
      t,
      0.05
    );

    // Main Filter
    this.nodes.filter.type = preset.filter.type;
    this.nodes.filter.frequency.setTargetAtTime(preset.filter.frequency, t, 0.05);
    this.nodes.filter.Q.setTargetAtTime(preset.filter.Q, t, 0.05);

    // Modulation & Shepard
    this.modulation.configureLFO(1, preset.modulation.lfo1);
    this.modulation.configureLFO(2, preset.modulation.lfo2);
    this.modulation.configureLFO(3, preset.modulation.lfo3);
    this.modulation.configureWalk(0, preset.modulation.randomWalk1);
    this.modulation.configureWalk(1, preset.modulation.randomWalk2);
    this.modulation.configureWalk(2, preset.modulation.randomWalk3);
    this.modulation.configureShepard(
      synth.shepardMix,
      synth.shepardRate,
      preset.sources.osc1.frequency * 1.4
    );

    // Saturation WaveShaper & Dark Damped Effects
    this.nodes.shaper.curve = buildTransferCurve(synth.drive, synth.crush);
    this.nodes.delay.delayTime.setTargetAtTime(preset.effects.delay.time, t, 0.05);
    this.nodes.delayDamping.frequency.setTargetAtTime(
      preset.effects.delay.damping ?? profile.delayDampingHz,
      t,
      0.05
    );
    this.nodes.delayFeedback.gain.setTargetAtTime(preset.effects.delay.feedback, t, 0.05);
    this.nodes.delayMix.gain.setTargetAtTime(preset.effects.delay.mix, t, 0.05);

    this.nodes.reverb.buffer = generateReverbIR(
      this.ctx,
      preset.effects.reverb.decay,
      2,
      this.streams.buffers
    );
    const revMix = preset.effects.reverb.enabled ? preset.effects.reverb.mix : 0;
    this.nodes.reverbMix.gain.setTargetAtTime(revMix, t, 0.05);

    // Master & Pan
    this.nodes.panner.pan.setTargetAtTime(preset.master.pan, t, 0.05);
    this.nodes.masterGain.gain.setTargetAtTime(preset.master.gain, t, 0.05);

    // Atmosphere baseline (explicit controller owns all state mappings)
    this.atmosphere.setBasePreset(preset);
    this.atmosphere.apply();
  }

  private ensureSynthesisConfig() {
    if (!this.activePreset.synthesis) {
      this.activePreset.synthesis = {
        ...getSoundscapeProfile(this.activeProfile).defaults,
      };
    }
    return this.activePreset.synthesis;
  }

  private updatePresetField(path: string, value: number): void {
    const synth = this.ensureSynthesisConfig();
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
      case 'noise.formantFreq':
        this.activePreset.sources.noise.formantFreq = value;
        break;
      case 'noise.formantLevel':
        this.activePreset.sources.noise.formantLevel = value;
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
      case 'delay.damping':
        this.activePreset.effects.delay.damping = value;
        break;
      case 'reverb.mix':
        this.activePreset.effects.reverb.mix = value;
        break;
      case 'reverb.decay':
        this.activePreset.effects.reverb.decay = value;
        break;
      case 'synthesis.subLevel':
        synth.subLevel = value;
        break;
      case 'synthesis.fmRatio':
        synth.fmRatio = value;
        break;
      case 'synthesis.fmDepth':
        synth.fmDepth = value;
        break;
      case 'synthesis.fmFeedback':
        synth.fmFeedback = value;
        break;
      case 'synthesis.ringFreq':
        synth.ringFreq = value;
        break;
      case 'synthesis.ringMix':
        synth.ringMix = value;
        break;
      case 'synthesis.drive':
        synth.drive = value;
        break;
      case 'synthesis.crush':
        synth.crush = value;
        break;
      case 'synthesis.shepardMix':
        synth.shepardMix = value;
        break;
      case 'synthesis.shepardRate':
        synth.shepardRate = value;
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
    this.atmosphere?.setBasePreset(this.activePreset);
  }
}
