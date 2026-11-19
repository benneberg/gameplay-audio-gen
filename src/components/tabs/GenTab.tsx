import { RefreshCw } from 'lucide-react';
import React, { useState } from 'react';
import type { FilterType, Preset } from '../../echo-engine/types';
import { SegmentedControl } from '../SegmentedControl';
import { TouchSlider } from '../TouchSlider';

interface GenTabProps {
  preset: Preset;
  onVolumeChange: (val: number) => void;
  onAtmosphereChange: (key: 'tension' | 'instability' | 'complexity', val: number) => void;
  onParamChange: (path: string, val: number) => void;
  onParamTypeChange: (path: string, type: string) => void;
  onReverbEnabledChange: (enabled: boolean) => void;
  onSeedApply: (seed: number) => void;
  onRandomizeSeed: () => void;
}

const FILTER_OPTIONS: { value: FilterType; label: string }[] = [
  { value: 'lowpass', label: 'LP' },
  { value: 'highpass', label: 'HP' },
  { value: 'bandpass', label: 'BP' },
  { value: 'notch', label: 'Notch' },
  { value: 'peaking', label: 'Peak' },
];

export const GenTab: React.FC<GenTabProps> = ({
  preset,
  onVolumeChange,
  onAtmosphereChange,
  onParamChange,
  onParamTypeChange,
  onReverbEnabledChange,
  onSeedApply,
  onRandomizeSeed,
}) => {
  const [seedInput, setSeedInput] = useState(String(preset.seed));

  React.useEffect(() => {
    setSeedInput(String(preset.seed));
  }, [preset.seed]);

  const handleSeedCommit = () => {
    const parsed = parseInt(seedInput, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      onSeedApply(parsed);
    } else {
      setSeedInput(String(preset.seed));
    }
  };

  return (
    <div className="space-y-6">
      <section className="space-y-1">
        <h2 className="text-xs font-semibold tracking-wider text-[#808090] uppercase">
          Atmosphere &amp; Master
        </h2>
        <div className="grid grid-cols-1 gap-x-6 lg:grid-cols-2">
          <TouchSlider
            label="Master Volume"
            value={preset.master.gain}
            min={0}
            max={1}
            step={0.01}
            formatValue={(v) => `${Math.round(v * 100)}%`}
            onChange={onVolumeChange}
          />
          <TouchSlider
            label="Stereo Pan"
            value={preset.master.pan}
            min={-1}
            max={1}
            step={0.01}
            formatValue={(v) => (v === 0 ? 'Center' : v < 0 ? `L ${Math.abs(Math.round(v * 100))}%` : `R ${Math.round(v * 100)}%`)}
            onChange={(v) => onParamChange('panner.pan', v)}
          />
          <TouchSlider
            label="Tension"
            value={preset.atmosphere.tension}
            min={0}
            max={1}
            step={0.01}
            formatValue={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => onAtmosphereChange('tension', v)}
          />
          <TouchSlider
            label="Instability"
            value={preset.atmosphere.instability}
            min={0}
            max={1}
            step={0.01}
            formatValue={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => onAtmosphereChange('instability', v)}
          />
          <TouchSlider
            label="Complexity"
            value={preset.atmosphere.complexity}
            min={0}
            max={1}
            step={0.01}
            formatValue={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => onAtmosphereChange('complexity', v)}
          />
        </div>
      </section>

      <div className="h-px bg-[#222230]" />

      <section className="space-y-2">
        <h2 className="text-xs font-semibold tracking-wider text-[#808090] uppercase">
          Main Filter
        </h2>
        <SegmentedControl
          label="Filter Type"
          value={preset.filter.type}
          options={FILTER_OPTIONS}
          onChange={(t) => onParamTypeChange('filter.type', t)}
        />
        <div className="grid grid-cols-1 gap-x-6 lg:grid-cols-2">
          <TouchSlider
            label="Filter Cutoff"
            value={preset.filter.frequency}
            min={20}
            max={12000}
            step={1}
            unit="Hz"
            onChange={(v) => onParamChange('filter.frequency', v)}
          />
          <TouchSlider
            label="Filter Resonance (Q)"
            value={preset.filter.Q}
            min={0.1}
            max={40}
            step={0.1}
            onChange={(v) => onParamChange('filter.Q', v)}
          />
        </div>
      </section>

      <div className="h-px bg-[#222230]" />

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xs font-semibold tracking-wider text-[#808090] uppercase">
            Delay &amp; Reverb Effects
          </h2>
          <button
            type="button"
            role="switch"
            aria-checked={preset.effects.reverb.enabled}
            onClick={() => onReverbEnabledChange(!preset.effects.reverb.enabled)}
            className={`min-h-[36px] rounded-lg border px-3 py-1 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              preset.effects.reverb.enabled
                ? 'border-[#ff8c00] bg-[#ff8c00]/15 text-[#ffaa33]'
                : 'border-[#222230] bg-[#141419] text-[#808090]'
            }`}
          >
            Reverb: {preset.effects.reverb.enabled ? 'On' : 'Off'}
          </button>
        </div>
        <div className="grid grid-cols-1 gap-x-6 lg:grid-cols-2">
          <TouchSlider
            label="Delay Time"
            value={preset.effects.delay.time}
            min={0.01}
            max={2.0}
            step={0.01}
            unit="s"
            onChange={(v) => onParamChange('delay.time', v)}
          />
          <TouchSlider
            label="Delay Feedback"
            value={preset.effects.delay.feedback}
            min={0}
            max={0.95}
            step={0.01}
            formatValue={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => onParamChange('delay.feedback', v)}
          />
          <TouchSlider
            label="Delay Mix"
            value={preset.effects.delay.mix}
            min={0}
            max={1}
            step={0.01}
            formatValue={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => onParamChange('delay.mix', v)}
          />
          <TouchSlider
            label="Reverb Mix"
            value={preset.effects.reverb.mix}
            min={0}
            max={1}
            step={0.01}
            formatValue={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => onParamChange('reverb.mix', v)}
          />
          <TouchSlider
            label="Reverb Decay"
            value={preset.effects.reverb.decay}
            min={0.5}
            max={5.0}
            step={0.1}
            unit="s"
            onChange={(v) => onParamChange('reverb.decay', v)}
          />
        </div>
      </section>

      <div className="h-px bg-[#222230]" />

      <section className="space-y-2 pb-2">
        <h2 className="text-xs font-semibold tracking-wider text-[#808090] uppercase">
          Session Seed
        </h2>
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            value={seedInput}
            aria-label="Session seed"
            onChange={(e) => setSeedInput(e.target.value)}
            onBlur={handleSeedCommit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSeedCommit();
            }}
            className="font-mono-tabular min-h-[44px] flex-1 rounded-lg border border-[#222230] bg-[#141419] px-3 text-sm text-[#e0e0e6] focus:border-[#ff8c00] focus:outline-none"
          />
          <button
            type="button"
            onClick={handleSeedCommit}
            className="min-h-[44px] rounded-lg border border-[#222230] bg-[#1c1c24] px-4 text-xs font-semibold text-[#e0e0e6] hover:border-[#ff8c00] whitespace-nowrap shrink-0"
          >
            Apply
          </button>
          <button
            type="button"
            onClick={onRandomizeSeed}
            aria-label="Randomize session seed"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-lg border border-[#ff8c00]/50 bg-[#ff8c00]/15 px-3 text-xs font-semibold text-[#ffaa33] hover:bg-[#ff8c00] hover:text-[#0a0a0f] whitespace-nowrap shrink-0"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            <span>New</span>
          </button>
        </div>
      </section>
    </div>
  );
};
