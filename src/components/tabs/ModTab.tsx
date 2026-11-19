import React from 'react';
import type {
  LFOConfig,
  ModulationTarget,
  OscillatorWaveform,
  Preset,
  RandomWalkConfig,
} from '../../echo-engine/types';
import { SegmentedControl } from '../SegmentedControl';
import { TouchSlider } from '../TouchSlider';

interface ModTabProps {
  preset: Preset;
  onLFOChange: (lfoNum: 1 | 2 | 3, next: LFOConfig) => void;
  onWalkChange: (walkNum: 0 | 1 | 2, next: RandomWalkConfig) => void;
}

const WAVEFORM_OPTIONS: { value: OscillatorWaveform; label: string }[] = [
  { value: 'sine', label: 'Sine' },
  { value: 'triangle', label: 'Tri' },
  { value: 'sawtooth', label: 'Saw' },
  { value: 'square', label: 'Sq' },
];

const LFO_TARGETS: { value: ModulationTarget; label: string }[] = [
  { value: 'osc1.detune', label: 'Osc 1 Detune' },
  { value: 'osc2.detune', label: 'Osc 2 Detune' },
  { value: 'filter.frequency', label: 'Filter Cutoff' },
  { value: 'filter.Q', label: 'Filter Q' },
  { value: 'fm.depth', label: 'FM Depth' },
  { value: 'panner.pan', label: 'Stereo Pan' },
  { value: 'delay.time', label: 'Delay Time' },
  { value: 'osc1.frequency', label: 'Osc 1 Frequency' },
  { value: 'osc2.frequency', label: 'Osc 2 Frequency' },
  { value: 'osc3.frequency', label: 'Osc 3 Frequency' },
  { value: 'masterGain', label: 'Master Gain' },
  { value: 'lfo1.rate', label: 'LFO 1 Rate' },
  { value: 'lfo2.rate', label: 'LFO 2 Rate' },
];

const WALK_TARGETS: { value: ModulationTarget; label: string }[] = [
  { value: 'filter.Q', label: 'Filter Q' },
  { value: 'filter.frequency', label: 'Filter Cutoff' },
  { value: 'fm.depth', label: 'FM Depth' },
  { value: 'noise.filterFrequency', label: 'Noise Filter' },
  { value: 'delay.feedback', label: 'Delay Feedback' },
  { value: 'delay.mix', label: 'Delay Mix' },
  { value: 'reverb.mix', label: 'Reverb Mix' },
  { value: 'panner.pan', label: 'Stereo Pan' },
  { value: 'osc1.detune', label: 'Osc 1 Detune' },
  { value: 'osc2.detune', label: 'Osc 2 Detune' },
  { value: 'osc3.detune', label: 'Osc 3 Detune' },
  { value: 'masterGain', label: 'Master Gain' },
];

function getDepthMeta(target: ModulationTarget): { max: number; step: number; unit: string } {
  if (target === 'filter.frequency') return { max: 4000, step: 10, unit: 'Hz' };
  if (target === 'fm.depth') return { max: 180, step: 1, unit: 'Hz' };
  if (target.endsWith('.detune')) return { max: 120, step: 1, unit: 'ct' };
  if (target.endsWith('.frequency')) return { max: 200, step: 1, unit: 'Hz' };
  if (target === 'filter.Q') return { max: 20, step: 0.2, unit: '' };
  if (target === 'panner.pan') return { max: 1.0, step: 0.01, unit: '' };
  if (target === 'delay.time') return { max: 0.5, step: 0.01, unit: 's' };
  if (target.endsWith('.rate')) return { max: 5, step: 0.05, unit: 'Hz' };
  return { max: 0.5, step: 0.01, unit: '' };
}

function getWalkRangeBounds(target: ModulationTarget): {
  min: number;
  max: number;
  step: number;
  unit: string;
} {
  if (target === 'filter.frequency') return { min: 40, max: 8000, step: 10, unit: 'Hz' };
  if (target === 'noise.filterFrequency') return { min: 100, max: 6000, step: 10, unit: 'Hz' };
  if (target === 'fm.depth') return { min: 0, max: 220, step: 2, unit: 'Hz' };
  if (target === 'filter.Q') return { min: 0.5, max: 32, step: 0.5, unit: '' };
  if (target === 'panner.pan') return { min: -1, max: 1, step: 0.05, unit: '' };
  if (target.endsWith('.detune')) return { min: -100, max: 100, step: 1, unit: 'ct' };
  return { min: 0, max: 1, step: 0.02, unit: '' };
}

export const ModTab: React.FC<ModTabProps> = ({ preset, onLFOChange, onWalkChange }) => {
  const lfos: { num: 1 | 2 | 3; cfg: LFOConfig }[] = [
    { num: 1, cfg: preset.modulation.lfo1 },
    { num: 2, cfg: preset.modulation.lfo2 },
    { num: 3, cfg: preset.modulation.lfo3 },
  ];

  const walks: { num: 0 | 1 | 2; cfg: RandomWalkConfig }[] = [
    { num: 0, cfg: preset.modulation.randomWalk1 },
    { num: 1, cfg: preset.modulation.randomWalk2 },
    { num: 2, cfg: preset.modulation.randomWalk3 },
  ];

  return (
    <div className="space-y-6 pb-2">
      <section className="space-y-4">
        <h2 className="text-xs font-semibold tracking-wider text-[#808090] uppercase">
          Audio-Rate Low Frequency Oscillators
        </h2>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {lfos.map(({ num, cfg }) => {
            const depthMeta = getDepthMeta(cfg.target);
            return (
              <div
                key={num}
                className="space-y-2 rounded-xl border border-[#222230] bg-[#141419] p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-[#e0e0e6]">LFO {num}</span>
                  <select
                    aria-label={`LFO ${num} Target`}
                    value={cfg.target}
                    onChange={(e) => {
                      const nextTarget = e.target.value as ModulationTarget;
                      const nextMeta = getDepthMeta(nextTarget);
                      onLFOChange(num, {
                        ...cfg,
                        target: nextTarget,
                        depth: Math.min(cfg.depth, nextMeta.max),
                      });
                    }}
                    className="min-h-[36px] rounded-md border border-[#222230] bg-[#1c1c24] px-2.5 text-xs text-[#e0e0e6] focus:border-[#ff8c00] focus:outline-none"
                  >
                    {LFO_TARGETS.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>

                <SegmentedControl
                  label="Waveform"
                  value={cfg.waveform}
                  options={WAVEFORM_OPTIONS}
                  onChange={(w) => onLFOChange(num, { ...cfg, waveform: w })}
                />

                <TouchSlider
                  label="Rate"
                  value={cfg.rate}
                  min={0.01}
                  max={20}
                  step={0.01}
                  unit="Hz"
                  onChange={(v) => onLFOChange(num, { ...cfg, rate: v })}
                />

                <TouchSlider
                  label="Depth"
                  value={Math.min(cfg.depth, depthMeta.max)}
                  min={0}
                  max={depthMeta.max}
                  step={depthMeta.step}
                  unit={depthMeta.unit}
                  onChange={(v) => onLFOChange(num, { ...cfg, depth: v })}
                />
              </div>
            );
          })}
        </div>
      </section>

      <div className="h-px bg-[#222230]" />

      <section className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xs font-semibold tracking-wider text-[#808090] uppercase">
            Stochastic Random Walks
          </h2>
          <span className="text-xs text-[#808090]">
            JS interval drift timers with AudioParam smoothing
          </span>
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {walks.map(({ num, cfg }) => {
            const bounds = getWalkRangeBounds(cfg.target);
            const maxStep = bounds.max > 100 ? 300 : bounds.max > 10 ? 5 : 0.3;
            const stepInc = bounds.max > 100 ? 5 : bounds.max > 10 ? 0.1 : 0.01;
            return (
              <div
                key={num}
                className="space-y-2 rounded-xl border border-[#222230] bg-[#141419] p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-[#e0e0e6]">Walk {num + 1}</span>
                  <select
                    aria-label={`Random Walk ${num + 1} Target`}
                    value={cfg.target}
                    onChange={(e) => {
                      const nextTarget = e.target.value as ModulationTarget;
                      const b = getWalkRangeBounds(nextTarget);
                      const span = b.max - b.min;
                      onWalkChange(num, {
                        ...cfg,
                        target: nextTarget,
                        min: Number((b.min + span * 0.2).toFixed(2)),
                        max: Number((b.min + span * 0.8).toFixed(2)),
                        stepSize: Number((span * 0.05).toFixed(2)),
                      });
                    }}
                    className="min-h-[36px] rounded-md border border-[#222230] bg-[#1c1c24] px-2.5 text-xs text-[#e0e0e6] focus:border-[#ff8c00] focus:outline-none"
                  >
                    {WALK_TARGETS.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>

                <TouchSlider
                  label="Range Min"
                  value={Math.max(bounds.min, Math.min(bounds.max, cfg.min))}
                  min={bounds.min}
                  max={bounds.max}
                  step={bounds.step}
                  unit={bounds.unit}
                  onChange={(v) => onWalkChange(num, { ...cfg, min: Math.min(v, cfg.max) })}
                />

                <TouchSlider
                  label="Range Max"
                  value={Math.max(bounds.min, Math.min(bounds.max, cfg.max))}
                  min={bounds.min}
                  max={bounds.max}
                  step={bounds.step}
                  unit={bounds.unit}
                  onChange={(v) => onWalkChange(num, { ...cfg, max: Math.max(v, cfg.min) })}
                />

                <TouchSlider
                  label="Step Size"
                  value={Math.min(cfg.stepSize, maxStep)}
                  min={stepInc}
                  max={maxStep}
                  step={stepInc}
                  onChange={(v) => onWalkChange(num, { ...cfg, stepSize: v })}
                />

                <TouchSlider
                  label="Interval"
                  value={cfg.interval}
                  min={60}
                  max={1000}
                  step={10}
                  unit="ms"
                  onChange={(v) => onWalkChange(num, { ...cfg, interval: Math.round(v) })}
                />
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
