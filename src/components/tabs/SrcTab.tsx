import React from 'react';
import type { NoiseFilterType, NoiseType, OscillatorWaveform, Preset } from '../../echo-engine/types';
import { SegmentedControl } from '../SegmentedControl';
import { TouchSlider } from '../TouchSlider';

interface SrcTabProps {
  preset: Preset;
  onParamChange: (path: string, val: number) => void;
  onParamTypeChange: (path: string, type: string) => void;
}

const WAVEFORM_OPTIONS: { value: OscillatorWaveform; label: string }[] = [
  { value: 'sine', label: 'Sine' },
  { value: 'triangle', label: 'Tri' },
  { value: 'sawtooth', label: 'Saw' },
  { value: 'square', label: 'Sq' },
];

const NOISE_OPTIONS: { value: NoiseType; label: string }[] = [
  { value: 'white', label: 'White' },
  { value: 'pink', label: 'Pink' },
];

const NOISE_FILTER_OPTIONS: { value: NoiseFilterType; label: string }[] = [
  { value: 'lowpass', label: 'Lowpass' },
  { value: 'bandpass', label: 'Bandpass' },
  { value: 'highpass', label: 'Highpass' },
];

export const SrcTab: React.FC<SrcTabProps> = ({ preset, onParamChange, onParamTypeChange }) => {
  const oscillators = [
    { id: 'osc1' as const, label: 'Oscillator 1', cfg: preset.sources.osc1 },
    { id: 'osc2' as const, label: 'Oscillator 2', cfg: preset.sources.osc2 },
    { id: 'osc3' as const, label: 'Oscillator 3', cfg: preset.sources.osc3 },
  ];

  return (
    <div className="space-y-6 pb-2">
      <section className="space-y-4">
        <h2 className="text-xs font-semibold tracking-wider text-[#808090] uppercase">
          Oscillator Voices
        </h2>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {oscillators.map(({ id, label, cfg }) => (
            <div
              key={id}
              className="space-y-2 rounded-xl border border-[#222230] bg-[#141419] p-4"
            >
              <h3 className="text-sm font-semibold text-[#e0e0e6]">{label}</h3>
              <SegmentedControl
                label="Waveform"
                value={cfg.waveform}
                options={WAVEFORM_OPTIONS}
                onChange={(w) => onParamTypeChange(`${id}.waveform`, w)}
              />
              <TouchSlider
                label="Frequency"
                value={cfg.frequency}
                min={20}
                max={2000}
                step={1}
                unit="Hz"
                onChange={(v) => onParamChange(`${id}.frequency`, v)}
              />
              <TouchSlider
                label="Detune"
                value={cfg.detune}
                min={-1200}
                max={1200}
                step={1}
                unit="ct"
                onChange={(v) => onParamChange(`${id}.detune`, v)}
              />
              <TouchSlider
                label="Gain"
                value={cfg.gain}
                min={0}
                max={1}
                step={0.01}
                formatValue={(v) => `${Math.round(v * 100)}%`}
                onChange={(v) => onParamChange(`${id}.gain`, v)}
              />
            </div>
          ))}
        </div>
      </section>

      <div className="h-px bg-[#222230]" />

      <section className="space-y-4">
        <h2 className="text-xs font-semibold tracking-wider text-[#808090] uppercase">
          Noise Texture Generator
        </h2>
        <div className="grid grid-cols-1 gap-6 rounded-xl border border-[#222230] bg-[#141419] p-4 lg:grid-cols-2">
          <div className="space-y-2">
            <SegmentedControl
              label="Noise Type"
              value={preset.sources.noise.type}
              options={NOISE_OPTIONS}
              onChange={(t) => onParamTypeChange('noise.type', t)}
            />
            <SegmentedControl
              label="Noise Filter Type"
              value={preset.sources.noise.filterType}
              options={NOISE_FILTER_OPTIONS}
              onChange={(t) => onParamTypeChange('noise.filterType', t)}
            />
          </div>
          <div className="space-y-2">
            <TouchSlider
              label="Noise Gain"
              value={preset.sources.noise.gain}
              min={0}
              max={1}
              step={0.01}
              formatValue={(v) => `${Math.round(v * 100)}%`}
              onChange={(v) => onParamChange('noise.gain', v)}
            />
            <TouchSlider
              label="Noise Filter Frequency"
              value={preset.sources.noise.filterFrequency}
              min={50}
              max={8000}
              step={1}
              unit="Hz"
              onChange={(v) => onParamChange('noise.filterFrequency', v)}
            />
          </div>
        </div>
      </section>
    </div>
  );
};
