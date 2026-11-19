export type EngineState =
  | 'idle'
  | 'starting'
  | 'playing'
  | 'suspended'
  | 'recoverable'
  | 'destroyed';

export type SoundscapeProfileId = 'abyss' | 'void' | 'dissonance' | 'machine';

export type OscillatorWaveform = 'sine' | 'triangle' | 'sawtooth' | 'square';
export type NoiseType = 'white' | 'pink' | 'brown';
export type NoiseFilterType = 'lowpass' | 'bandpass' | 'highpass';
export type FilterType = 'lowpass' | 'highpass' | 'bandpass' | 'notch' | 'peaking';

export type ModulationTarget =
  | 'osc1.frequency'
  | 'osc2.frequency'
  | 'osc3.frequency'
  | 'osc1.detune'
  | 'osc2.detune'
  | 'osc3.detune'
  | 'osc1.gain'
  | 'osc2.gain'
  | 'osc3.gain'
  | 'filter.frequency'
  | 'filter.Q'
  | 'noise.gain'
  | 'noise.filterFrequency'
  | 'fm.depth'
  | 'delay.time'
  | 'delay.feedback'
  | 'delay.mix'
  | 'reverb.mix'
  | 'panner.pan'
  | 'masterGain'
  | 'lfo1.rate'
  | 'lfo2.rate'
  | 'lfo3.rate';

export type EventName =
  | 'newGame'
  | 'portal'
  | 'danger'
  | 'pass'
  | 'collision'
  | 'nearMiss'
  | 'gameOver'
  | 'whisper'
  | 'growl'
  | 'subDrop'
  | 'creak'
  | 'wail'
  | 'lurch'
  | 'shepardDive';

export interface EventOptions {
  intensity?: number;
}

export interface OscillatorConfig {
  waveform: OscillatorWaveform;
  frequency: number;
  detune: number;
  gain: number;
}

export interface NoiseConfig {
  type: NoiseType;
  gain: number;
  filterType: NoiseFilterType;
  filterFrequency: number;
  filterQ?: number;
  formantFreq?: number;
  formantQ?: number;
  formantLevel?: number;
}

export interface FilterConfig {
  type: FilterType;
  frequency: number;
  Q: number;
}

export interface LFOConfig {
  waveform: OscillatorWaveform;
  rate: number;
  depth: number;
  target: ModulationTarget;
}

export interface RandomWalkConfig {
  target: ModulationTarget;
  min: number;
  max: number;
  stepSize: number;
  interval: number;
  smoothing: number;
}

export interface DelayConfig {
  time: number;
  feedback: number;
  mix: number;
  damping?: number;
}

export interface ReverbConfig {
  enabled: boolean;
  mix: number;
  decay: number;
}

export interface TextureAndSynthesisConfig {
  subLevel: number;
  fmRatio: number;
  fmDepth: number;
  fmFeedback: number;
  ringFreq: number;
  ringMix: number;
  drive: number;
  crush: number;
  shepardMix: number;
  shepardRate: number;
}

export interface AtmosphereState {
  tension: number;
  instability: number;
  complexity: number;
}

export interface GameplayState {
  tension: number;
  instability: number;
  complexity: number;
  progress: number;
  proximity: number;
  danger: number;
}

export interface Preset {
  $schema?: string;
  version: string;
  name: string;
  profile?: SoundscapeProfileId;
  seed: number;
  description?: string;
  author?: string;
  tags?: string[];
  sources: {
    osc1: OscillatorConfig;
    osc2: OscillatorConfig;
    osc3: OscillatorConfig;
    noise: NoiseConfig;
  };
  filter: FilterConfig;
  synthesis?: TextureAndSynthesisConfig;
  modulation: {
    lfo1: LFOConfig;
    lfo2: LFOConfig;
    lfo3: LFOConfig;
    randomWalk1: RandomWalkConfig;
    randomWalk2: RandomWalkConfig;
    randomWalk3: RandomWalkConfig;
  };
  effects: {
    delay: DelayConfig;
    reverb: ReverbConfig;
  };
  atmosphere: AtmosphereState;
  master: {
    gain: number;
    pan: number;
  };
}

export interface EchoEngineConfig {
  seed?: number;
  profile?: SoundscapeProfileId;
  preset?: Preset;
  volume?: number;
  autoStart?: boolean;
  analyser?: boolean;
}

export type EngineEventName =
  | 'started'
  | 'stopped'
  | 'stateChange'
  | 'resumeRequired'
  | 'eventTriggered'
  | 'presetLoaded'
  | 'profileChanged'
  | 'seedChanged';

export type EngineCallback = (eventName: EngineEventName, data: Record<string, unknown>) => void;

export interface NotePlayOptions {
  dur?: number;
  vel?: number;
  attack?: number;
  release?: number;
  detuneSpread?: number;
  tuningScale?: number;
}
