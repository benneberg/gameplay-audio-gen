import React, { useId, useRef } from 'react';

interface TouchSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  formatValue?: (val: number) => string;
  onChange: (value: number) => void;
  haptic?: boolean;
}

export const TouchSlider: React.FC<TouchSliderProps> = ({
  label,
  value,
  min,
  max,
  step = 0.01,
  unit = '',
  formatValue,
  onChange,
  haptic = true,
}) => {
  const id = useId();
  const lastVibrateRef = useRef(0);

  const clamped = Math.max(min, Math.min(max, value));
  const pct = max > min ? ((clamped - min) / (max - min)) * 100 : 0;

  const display = formatValue
    ? formatValue(clamped)
    : `${step >= 1 ? Math.round(clamped) : clamped.toFixed(step >= 0.1 ? 1 : 2)}${unit ? ` ${unit}` : ''}`;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = parseFloat(e.target.value);
    if (Number.isNaN(next)) return;
    if (haptic && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      const now = Date.now();
      if (now - lastVibrateRef.current >= 50) {
        lastVibrateRef.current = now;
        try {
          navigator.vibrate(8);
        } catch {
          // Ignore unsupported environments
        }
      }
    }
    onChange(next);
  };

  return (
    <div className="flex flex-col py-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-[13px] font-medium text-[#e0e0e6] truncate">
          {label}
        </label>
        <span className="font-mono-tabular text-[13px] text-[#ff8c00] whitespace-nowrap shrink-0">
          {display}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={clamped}
        onChange={handleChange}
        aria-label={label}
        style={{ '--slider-pct': `${pct}%` } as React.CSSProperties}
        className="echo-slider"
      />
    </div>
  );
};
