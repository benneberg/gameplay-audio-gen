import type {
  NoiseType,
  OscillatorWaveform,
  SoundscapeProfileId,
  TextureAndSynthesisConfig,
} from './types';

export interface SoundscapeProfile {
  id: SoundscapeProfileId;
  label: string;
  subtitle: string;
  rootFrequencies: number[];
  osc2Ratios: number[];
  osc3Ratios: number[];
  preferredWaveforms: OscillatorWaveform[];
  preferredNoise: NoiseType;
  cutoffRange: [number, number];
  qRange: [number, number];
  delayDampingHz: number;
  /** Profile-level multipliers applied by AtmosphereController without mutating base preset */
  cutoffBias: number;
  qBias: number;
  detuneSpreadCents: number;
  fmMultiplier: number;
  subBoost: number;
  reverbBoost: number;
  shepardBias: number;
  driveBoost: number;
  defaults: TextureAndSynthesisConfig;
}

export const SOUNDSCAPE_PROFILES: Record<SoundscapeProfileId, SoundscapeProfile> = {
  abyss: {
    id: 'abyss',
    label: 'Abyss',
    subtitle: 'Subterranean pressure, deep sub-octave & cavern reverb',
    rootFrequencies: [32.7, 36.7, 41.2, 43.65, 49.0, 55.0],
    osc2Ratios: [0.5, 1.0, 1.5, 0.75],
    osc3Ratios: [1.5, 2.0, 1.333],
    preferredWaveforms: ['triangle', 'sine', 'sawtooth'],
    preferredNoise: 'brown',
    cutoffRange: [110, 480],
    qRange: [1.8, 6.5],
    delayDampingHz: 950,
    cutoffBias: 0.78,
    qBias: 0.9,
    detuneSpreadCents: 10,
    fmMultiplier: 0.75,
    subBoost: 0.25,
    reverbBoost: 0.14,
    shepardBias: 0.0,
    driveBoost: 0.06,
    defaults: {
      subLevel: 0.72,
      fmRatio: 0.5,
      fmDepth: 14,
      fmFeedback: 0.08,
      ringFreq: 1.5,
      ringMix: 0,
      drive: 0.22,
      crush: 0,
      shepardMix: 0,
      shepardRate: 0.04,
    },
  },
  void: {
    id: 'void',
    label: 'Void',
    subtitle: 'Hollow formant whispers, wide damped echo & ghostly air',
    rootFrequencies: [49.0, 55.0, 61.7, 65.4, 73.4, 82.4],
    osc2Ratios: [1.5, 1.7818, 2.0, 1.335],
    osc3Ratios: [2.0, 2.83, 3.0],
    preferredWaveforms: ['sine', 'triangle'],
    preferredNoise: 'pink',
    cutoffRange: [280, 1100],
    qRange: [2.5, 9.5],
    delayDampingHz: 1550,
    cutoffBias: 1.05,
    qBias: 1.0,
    detuneSpreadCents: 12,
    fmMultiplier: 1.0,
    subBoost: 0.0,
    reverbBoost: 0.2,
    shepardBias: 0.05,
    driveBoost: 0.0,
    defaults: {
      subLevel: 0.35,
      fmRatio: 2.0,
      fmDepth: 22,
      fmFeedback: 0.1,
      ringFreq: 6.0,
      ringMix: 0.08,
      drive: 0.1,
      crush: 0,
      shepardMix: 0.08,
      shepardRate: 0.05,
    },
  },
  dissonance: {
    id: 'dissonance',
    label: 'Dissonance',
    subtitle: 'Tritone partials, Shepard descent, ring sidebands & drift',
    rootFrequencies: [43.65, 49.0, 58.27, 61.7, 65.4, 73.4],
    osc2Ratios: [1.0595, 1.4142, 1.1225, 1.7818],
    osc3Ratios: [1.4142, 1.335, 2.02],
    preferredWaveforms: ['sawtooth', 'triangle', 'square'],
    preferredNoise: 'pink',
    cutoffRange: [240, 1450],
    qRange: [4.5, 14.0],
    delayDampingHz: 1350,
    cutoffBias: 1.0,
    qBias: 1.25,
    detuneSpreadCents: 24,
    fmMultiplier: 1.35,
    subBoost: 0.08,
    reverbBoost: 0.1,
    shepardBias: 0.25,
    driveBoost: 0.12,
    defaults: {
      subLevel: 0.45,
      fmRatio: 1.414,
      fmDepth: 38,
      fmFeedback: 0.24,
      ringFreq: 19.0,
      ringMix: 0.18,
      drive: 0.28,
      crush: 0.05,
      shepardMix: 0.22,
      shepardRate: 0.06,
    },
  },
  machine: {
    id: 'machine',
    label: 'Machine',
    subtitle: 'Subterranean reactor, saturated cross-FM & metallic grind',
    rootFrequencies: [36.7, 41.2, 46.25, 55.0, 61.7],
    osc2Ratios: [1.0, 1.0667, 1.5, 0.5],
    osc3Ratios: [1.26, 2.13, 1.5],
    preferredWaveforms: ['sawtooth', 'square', 'triangle'],
    preferredNoise: 'brown',
    cutoffRange: [180, 950],
    qRange: [3.5, 11.5],
    delayDampingHz: 1150,
    cutoffBias: 0.92,
    qBias: 1.15,
    detuneSpreadCents: 18,
    fmMultiplier: 1.45,
    subBoost: 0.18,
    reverbBoost: 0.02,
    shepardBias: 0.0,
    driveBoost: 0.22,
    defaults: {
      subLevel: 0.6,
      fmRatio: 2.13,
      fmDepth: 46,
      fmFeedback: 0.3,
      ringFreq: 34.0,
      ringMix: 0.12,
      drive: 0.42,
      crush: 0.12,
      shepardMix: 0,
      shepardRate: 0.05,
    },
  },
};

export const PROFILE_LIST: SoundscapeProfile[] = [
  SOUNDSCAPE_PROFILES.abyss,
  SOUNDSCAPE_PROFILES.void,
  SOUNDSCAPE_PROFILES.dissonance,
  SOUNDSCAPE_PROFILES.machine,
];

export function getSoundscapeProfile(id?: SoundscapeProfileId): SoundscapeProfile {
  return (id && SOUNDSCAPE_PROFILES[id]) || SOUNDSCAPE_PROFILES.abyss;
}
