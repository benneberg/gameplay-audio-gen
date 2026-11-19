import React from 'react';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  label: string;
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
}

export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <div className="flex flex-col gap-2 py-1.5">
      <span className="text-[13px] font-medium text-[#e0e0e6]">{label}</span>
      <div
        role="group"
        aria-label={label}
        className="grid gap-1 rounded-lg border border-[#222230] bg-[#141419] p-1"
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              aria-pressed={active}
              className={`min-h-[40px] rounded-md px-2 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-[#ff8c00] ${
                active
                  ? 'bg-[#ff8c00] text-[#0a0a0f] font-semibold'
                  : 'text-[#808090] hover:text-[#e0e0e6] hover:bg-[#1c1c24]'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
