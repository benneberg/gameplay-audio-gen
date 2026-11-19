import {
  AlertTriangle,
  CheckCircle2,
  Compass,
  Flame,
  RotateCcw,
  Skull,
  Zap,
} from 'lucide-react';
import React, { useState } from 'react';
import type { EventName } from '../../echo-engine/types';
import { TouchSlider } from '../TouchSlider';

interface EvtTabProps {
  gameStates: Record<string, number>;
  onTriggerEvent: (name: EventName, intensity: number) => void;
  onStateChange: (key: string, value: number) => void;
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
  { id: 'collision', label: 'Collision', subtitle: 'Dissonance burst', icon: Zap },
  { id: 'nearMiss', label: 'Near Miss', subtitle: 'Resonance pulse', icon: Flame },
  { id: 'gameOver', label: 'Game Over', subtitle: 'Filter descent', icon: Skull },
];

export const EvtTab: React.FC<EvtTabProps> = ({
  gameStates,
  onTriggerEvent,
  onStateChange,
}) => {
  const [intensity, setIntensity] = useState(1.0);
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
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold tracking-wider text-[#808090] uppercase">
            Simulate Gameplay Events
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

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {GAMEPLAY_EVENTS.map(({ id, label, subtitle, icon: Icon }) => {
            const active = flashingId === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => handleTap(id)}
                className={`flex min-h-[56px] items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-all duration-150 focus-visible:outline-2 focus-visible:outline-[#ff8c00] active:scale-[0.97] ${
                  active
                    ? 'border-[#ff8c00] bg-[#ff8c00] text-[#0a0a0f]'
                    : 'border-[#222230] bg-[#1c1c24] text-[#e0e0e6] hover:border-[#ff8c00]/60'
                }`}
              >
                <Icon
                  className={`h-5 w-5 shrink-0 ${active ? 'text-[#0a0a0f]' : 'text-[#ff8c00]'}`}
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
        <h2 className="text-xs font-semibold tracking-wider text-[#808090] uppercase">
          Continuous Gameplay States
        </h2>
        <div className="grid grid-cols-1 gap-x-6 lg:grid-cols-2">
          <TouchSlider
            label="Progress"
            value={gameStates.progress ?? 0}
            min={0}
            max={1}
            step={0.01}
            formatValue={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => onStateChange('progress', v)}
          />
          <TouchSlider
            label="Proximity"
            value={gameStates.proximity ?? 0}
            min={0}
            max={1}
            step={0.01}
            formatValue={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => onStateChange('proximity', v)}
          />
          <TouchSlider
            label="Danger"
            value={gameStates.danger ?? 0}
            min={0}
            max={1}
            step={0.01}
            formatValue={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => onStateChange('danger', v)}
          />
          <TouchSlider
            label="Tension"
            value={gameStates.tension ?? 0.3}
            min={0}
            max={1}
            step={0.01}
            formatValue={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => onStateChange('tension', v)}
          />
        </div>
      </section>
    </div>
  );
};
