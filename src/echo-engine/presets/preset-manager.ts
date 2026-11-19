import { getSoundscapeProfile } from '../profiles';
import type {
  FilterType,
  ModulationTarget,
  NoiseFilterType,
  NoiseType,
  OscillatorWaveform,
  Preset,
  SoundscapeProfileId,
} from '../types';
import { BUILT_IN_PRESETS } from './defaults';

const STORAGE_PREFIX = 'echo-preset-';

const VALID_PROFILES: SoundscapeProfileId[] = ['abyss', 'void', 'dissonance', 'machine'];
const VALID_WAVEFORMS: OscillatorWaveform[] = ['sine', 'triangle', 'sawtooth', 'square'];
const VALID_NOISE_TYPES: NoiseType[] = ['white', 'pink', 'brown'];
const VALID_NOISE_FILTERS: NoiseFilterType[] = ['lowpass', 'bandpass', 'highpass'];
const VALID_FILTER_TYPES: FilterType[] = ['lowpass', 'highpass', 'bandpass', 'notch', 'peaking'];
const VALID_TARGETS: ModulationTarget[] = [
  'osc1.frequency',
  'osc2.frequency',
  'osc3.frequency',
  'osc1.detune',
  'osc2.detune',
  'osc3.detune',
  'osc1.gain',
  'osc2.gain',
  'osc3.gain',
  'filter.frequency',
  'filter.Q',
  'noise.gain',
  'noise.filterFrequency',
  'fm.depth',
  'delay.time',
  'delay.feedback',
  'delay.mix',
  'reverb.mix',
  'panner.pan',
  'masterGain',
  'lfo1.rate',
  'lfo2.rate',
  'lfo3.rate',
];

function clamp(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return Math.max(min, Math.min(max, n));
}

function pick<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

export function validateAndNormalizePreset(raw: unknown): Preset {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid preset JSON object.');
  }

  const obj = raw as Record<string, unknown>;
  const version = typeof obj.version === 'string' ? obj.version : '2.0';
  const major = parseInt(version.split('.')[0] || '2', 10);
  if (!Number.isFinite(major) || (major !== 1 && major !== 2)) {
    throw new Error(`Unsupported preset major version: ${version}`);
  }

  const base = BUILT_IN_PRESETS[0];
  const profileId = pick(obj.profile, VALID_PROFILES, base.profile ?? 'abyss');
  const profile = getSoundscapeProfile(profileId);

  const sources = (obj.sources as Record<string, unknown>) || {};
  const filter = (obj.filter as Record<string, unknown>) || {};
  const synth = (obj.synthesis as Record<string, unknown>) || {};
  const mod = (obj.modulation as Record<string, unknown>) || {};
  const fx = (obj.effects as Record<string, unknown>) || {};
  const delay = (fx.delay as Record<string, unknown>) || {};
  const reverb = (fx.reverb as Record<string, unknown>) || {};
  const atm = (obj.atmosphere as Record<string, unknown>) || {};
  const master = (obj.master as Record<string, unknown>) || {};

  const normOsc = (rawOsc: unknown, def: Preset['sources']['osc1']) => {
    const o = (rawOsc as Record<string, unknown>) || {};
    return {
      waveform: pick(o.waveform, VALID_WAVEFORMS, def.waveform),
      frequency: clamp(o.frequency, 20, 2000, def.frequency),
      detune: clamp(o.detune, -1200, 1200, def.detune),
      gain: clamp(o.gain, 0, 1, def.gain),
    };
  };

  const rawNoise = (sources.noise as Record<string, unknown>) || {};

  const normLFO = (rawLfo: unknown, def: Preset['modulation']['lfo1']) => {
    const l = (rawLfo as Record<string, unknown>) || {};
    return {
      waveform: pick(l.waveform, VALID_WAVEFORMS, def.waveform),
      rate: clamp(l.rate, 0.005, 20, def.rate),
      depth: clamp(l.depth, 0, 5000, def.depth),
      target: pick(l.target, VALID_TARGETS, def.target),
    };
  };

  const normWalk = (rawWalk: unknown, def: Preset['modulation']['randomWalk1']) => {
    const w = (rawWalk as Record<string, unknown>) || {};
    const min = typeof w.min === 'number' && Number.isFinite(w.min) ? w.min : def.min;
    const max = typeof w.max === 'number' && Number.isFinite(w.max) ? w.max : def.max;
    return {
      target: pick(w.target, VALID_TARGETS, def.target),
      min: Math.min(min, max),
      max: Math.max(min, max),
      stepSize: clamp(w.stepSize, 0.01, 500, def.stepSize),
      interval: Math.round(clamp(w.interval, 60, 1200, def.interval)),
      smoothing: clamp(w.smoothing, 0.01, 1.0, def.smoothing),
    };
  };

  const synthDefaults = base.synthesis ?? profile.defaults;

  return {
    version,
    name: typeof obj.name === 'string' && obj.name.trim() ? obj.name.trim().slice(0, 60) : 'Imported Preset',
    profile: profileId,
    seed:
      typeof obj.seed === 'number' && Number.isFinite(obj.seed)
        ? Math.floor(Math.abs(obj.seed)) || 1
        : base.seed,
    description: typeof obj.description === 'string' ? obj.description : undefined,
    author: typeof obj.author === 'string' ? obj.author : undefined,
    tags: Array.isArray(obj.tags) ? obj.tags.filter((t): t is string => typeof t === 'string') : undefined,
    sources: {
      osc1: normOsc(sources.osc1, base.sources.osc1),
      osc2: normOsc(sources.osc2, base.sources.osc2),
      osc3: normOsc(sources.osc3, base.sources.osc3),
      noise: {
        type: pick(rawNoise.type, VALID_NOISE_TYPES, base.sources.noise.type),
        gain: clamp(rawNoise.gain, 0, 1, base.sources.noise.gain),
        filterType: pick(rawNoise.filterType, VALID_NOISE_FILTERS, base.sources.noise.filterType),
        filterFrequency: clamp(rawNoise.filterFrequency, 50, 8000, base.sources.noise.filterFrequency),
        filterQ: clamp(rawNoise.filterQ, 0.5, 24, base.sources.noise.filterQ ?? 4.5),
        formantFreq: clamp(rawNoise.formantFreq, 180, 3500, base.sources.noise.formantFreq ?? 650),
        formantQ: clamp(rawNoise.formantQ, 1, 24, base.sources.noise.formantQ ?? 8),
        formantLevel: clamp(rawNoise.formantLevel, 0, 1, base.sources.noise.formantLevel ?? 0.14),
      },
    },
    filter: {
      type: pick(filter.type, VALID_FILTER_TYPES, base.filter.type),
      frequency: clamp(filter.frequency, 20, 12000, base.filter.frequency),
      Q: clamp(filter.Q, 0.1, 40, base.filter.Q),
    },
    synthesis: {
      subLevel: clamp(synth.subLevel, 0, 1, synthDefaults.subLevel),
      fmRatio: clamp(synth.fmRatio, 0.25, 4.5, synthDefaults.fmRatio),
      fmDepth: clamp(synth.fmDepth, 0, 260, synthDefaults.fmDepth),
      fmFeedback: clamp(synth.fmFeedback, 0, 1, synthDefaults.fmFeedback),
      ringFreq: clamp(synth.ringFreq, 0.2, 500, synthDefaults.ringFreq),
      ringMix: clamp(synth.ringMix, 0, 1, synthDefaults.ringMix),
      drive: clamp(synth.drive, 0, 1, synthDefaults.drive),
      crush: clamp(synth.crush, 0, 1, synthDefaults.crush),
      shepardMix: clamp(synth.shepardMix, 0, 1, synthDefaults.shepardMix),
      shepardRate: clamp(synth.shepardRate, 0.015, 0.25, synthDefaults.shepardRate),
    },
    modulation: {
      lfo1: normLFO(mod.lfo1, base.modulation.lfo1),
      lfo2: normLFO(mod.lfo2, base.modulation.lfo2),
      lfo3: normLFO(mod.lfo3, base.modulation.lfo3),
      randomWalk1: normWalk(mod.randomWalk1, base.modulation.randomWalk1),
      randomWalk2: normWalk(mod.randomWalk2, base.modulation.randomWalk2),
      randomWalk3: normWalk(mod.randomWalk3, base.modulation.randomWalk3),
    },
    effects: {
      delay: {
        time: clamp(delay.time, 0.01, 2.5, base.effects.delay.time),
        feedback: clamp(delay.feedback, 0, 0.92, base.effects.delay.feedback),
        mix: clamp(delay.mix, 0, 1, base.effects.delay.mix),
        damping: clamp(delay.damping, 300, 6000, base.effects.delay.damping ?? profile.delayDampingHz),
      },
      reverb: {
        enabled: typeof reverb.enabled === 'boolean' ? reverb.enabled : base.effects.reverb.enabled,
        mix: clamp(reverb.mix, 0, 1, base.effects.reverb.mix),
        decay: clamp(reverb.decay, 0.5, 6.0, base.effects.reverb.decay),
      },
    },
    atmosphere: {
      tension: clamp(atm.tension, 0, 1, base.atmosphere.tension),
      instability: clamp(atm.instability, 0, 1, base.atmosphere.instability),
      complexity: clamp(atm.complexity, 0, 1, base.atmosphere.complexity),
    },
    master: {
      gain: clamp(master.gain, 0, 1, base.master.gain),
      pan: clamp(master.pan, -1, 1, base.master.pan),
    },
  };
}

export const PresetManager = {
  getBuiltInPresets(): Preset[] {
    return BUILT_IN_PRESETS.map((p) => structuredClone(p));
  },

  saveToStorage(preset: Preset): void {
    const normalized = validateAndNormalizePreset(preset);
    localStorage.setItem(STORAGE_PREFIX + normalized.name, JSON.stringify(normalized));
  },

  loadAllFromStorage(): Preset[] {
    const presets: Preset[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(STORAGE_PREFIX)) {
        try {
          const raw = localStorage.getItem(key);
          if (raw) {
            presets.push(validateAndNormalizePreset(JSON.parse(raw)));
          }
        } catch {
          // Ignore corrupted entries
        }
      }
    }
    return presets.sort((a, b) => a.name.localeCompare(b.name));
  },

  deleteFromStorage(name: string): void {
    localStorage.removeItem(STORAGE_PREFIX + name);
  },

  exportPreset(preset: Preset): void {
    const blob = new Blob([JSON.stringify(preset, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `echo-preset-${preset.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  async importPresetFromFile(file: File): Promise<Preset> {
    const text = await file.text();
    const parsed = JSON.parse(text);
    return validateAndNormalizePreset(parsed);
  },

  encodePresetToHash(preset: Preset): string {
    const json = JSON.stringify(preset);
    return '#preset=' + btoa(encodeURIComponent(json));
  },

  decodePresetFromHash(): Preset | null {
    const match = window.location.hash.match(/#preset=(.+)/);
    if (!match) return null;
    try {
      const json = decodeURIComponent(atob(match[1]));
      return validateAndNormalizePreset(JSON.parse(json));
    } catch {
      return null;
    }
  },
};
