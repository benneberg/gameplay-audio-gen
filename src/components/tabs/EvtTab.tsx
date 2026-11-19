import {
  Activity,
  AlertTriangle,
  ArrowDown,
  CheckCircle2,
  Compass,
  Flame,
  Ghost,
  Radio,
  RotateCcw,
  Skull,
  Volume2,
  Waves,
  Wind,
  Zap,
} from 'lucide-react';
import React, { useState } from 'react';
import type { EventName, GameplayState } from '../../echo-engine/types';
import { TouchSlider } from '../TouchSlider';
import { XYPad } from '../XYPad';

interface EvtTabProps {
  gameplayState: GameplayState;
  onTriggerEvent: (name: EventName, intensity: number) => void;
  onStateChange: (key: keyof GameplayState, value: number) => void;
  onXYChange: (tension: number, instability: number) => void;
  onEnsureAudio: () => Promise<void>;
}

const GAMEPLAY_EVENTS: {
  id: EventName;
  label: string;
  subtitle: string;
  icon: React.FC<{ className?: string }>;
}[] = [
  { id: 'newGame', label: 'New Game', subtitle: 'Re-seed & start', icon: RotateCcw },
  { id: 'portal', label: 'Portal', subtitle: 'Spectral sweep', icon: Compass },
  { id: 'danger', label: 'Danger', subtitle: 'Detune surge', icon: AlertTriangle },
  { id: 'pass', label: 'Pass', subtitle: 'Tension release', icon: CheckCircle2 },
  { id: 'collision', label: 'Collision', subtitle: 'Sub impact burst', icon: Zap },
  { id: 'nearMiss', label: 'Near Miss', subtitle: 'Resonance pulse', icon: Flame },
  { id: 'gameOver', label: 'Game Over', subtitle: 'Filter descent', icon: Skull },
];

const APPARITION_EVENTS: {
  id: EventName;
  label: string;
  subtitle: string;
  icon: React.FC<{ className?: string }>;
}[] = [
  { id: 'whisper', label: 'Whisper', subtitle: 'Formant air burst', icon: Wind },
  { id: 'growl', label: 'Growl', subtitle: 'Low AM rasp', icon: Volume2 },
  { id: 'subDrop', label: 'Sub Drop', subtitle: 'Cinematic braam', icon: ArrowDown },
  { id: 'creak', label: 'Creak', subtitle: 'Metallic groan', icon: Activity },
  { id: 'wail', label: 'Wail', subtitle: 'Distant harmonic', icon: Radio },
  { id: 'lurch', label: 'Lurch', subtitle: 'Pitch droop plunge', icon: Ghost },
  { id: 'shepardDive', label: 'Shepard Dive', subtitle: 'Infinity surge', icon: Waves },
];

export const EvtTab: React.FC<EvtTabProps> = ({
  gameplayState,
  onTriggerEvent,
  onStateChange,
  onXYChange,
  onEnsureAudio,
}) => {
  const [intensity, setIntensity] = useState(0.85);
  const [flashingId, setFlashingId] = useState<EventName | null>(null);

  const handleTap = (id: EventName) => {
    setFlashingId(id);
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(14);
      } catch {
        // Ignore unsupported environments
      }
    }
    onTriggerEvent(id, intensity);
    window.setTimeout(() => {
      setFlashingId((prev) => (prev === id ? null : prev));
    }, 220);
  };

  return (
    <div className="space-y-6 pb-2">
      {/* Touch XY Atmosphere Matrix */}
      <XYPad
        x={gameplayState.tension}
        y={gameplayState.instability}
        onChange={onXYChange}
        onEnsureAudio={() => {
          void onEnsureAudio();
        }}
      />

      <div className="h-px bg-[#222230]" />

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold tracking-wider text-[#808090] uppercase">
            Discrete Gameplay &amp; Apparition Triggers
          </h2>
        </div>

        <TouchSlider
          label="Event Intensity"
          value={intensity}
          min={0.1}
          max={1.0}
          step={0.05}
          formatValue={(v) => `${Math.round(v * 100)}%`}
          onChange={setIntensity}
          haptic={false}
        />

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          {[...GAMEPLAY_EVENTS, ...APPARITION_EVENTS].map(({ id, label, subtitle, icon: Icon }) => {
            const active = flashingId === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => handleTap(id)}
                className={`flex min-h-[54px] items-center gap-3 rounded-xl border px-3 py-2 text-left transition-all duration-150 focus-visible:outline-2 focus-visible:outline-[#ff8c00] active:scale-[0.97] ${
                  active
                    ? 'border-[#ff8c00] bg-[#ff8c00] text-[#0a0a0f]'
                    : 'border-[#222230] bg-[#1c1c24] text-[#e0e0e6] hover:border-[#ff8c00]/60'
                }`}
              >
                <Icon
                  className={`h-4 w-4 shrink-0 ${active ? 'text-[#0a0a0f]' : 'text-[#ff8c00]'}`}
                />
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{label}</div>
                  <div
                    className={`truncate text-[11px] ${
                      active ? 'text-[#0a0a0f]/80' : 'text-[#808090]'
                    }`}
                  >
                    {subtitle}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <div className="h-px bg-[#222230]" />

      <section className="space-y-1">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xs font-semibold tracking-wider text-[#808090] uppercase">
            Explicit Continuous State Vectors
          </h2>
          <span className="text-xs text-[#808090]">Independent non-coupled dimensions</span>
        </div>
        <div className="grid grid-cols-1 gap-x-6 lg:grid-cols-2">
          <TouchSlider
            label="Tension"
            value={gameplayState.tension}
            min={0}
            max={1}
            step={0.01}
            formatValue={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => onStateChange('tension', v)}
          />
          <TouchSlider
            label="Instability"
            value={gameplayState.instability}
            min={0}
            max={1}
            step={0.01}
            formatValue={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => onStateChange('instability', v)}
          />
          <TouchSlider
            label="Complexity"
            value={gameplayState.complexity}
            min={0}
            max={1}
            step={0.01}
            formatValue={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => onStateChange('complexity', v)}
          />
          <TouchSlider
            label="Progress"
            value={gameplayState.progress}
            min={0}
            max={1}
            step={0.01}
            formatValue={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => onStateChange('progress', v)}
          />
          <TouchSlider
            label="Proximity"
            value={gameplayState.proximity}
            min={0}
            max={1}
            step={0.01}
            formatValue={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => onStateChange('proximity', v)}
          />
          <TouchSlider
            label="Danger"
            value={gameplayState.danger}
            min={0}
            max={1}
            step={0.01}
            formatValue={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => onStateChange('danger', v)}
          />
        </div>
      </section>
    </div>
  );
};
