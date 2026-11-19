import React, { useCallback, useRef, useState } from 'react';

interface XYPadProps {
  x: number; // Tension (0..1)
  y: number; // Instability (0..1)
  onChange: (x: number, y: number) => void;
  onEnsureAudio?: () => void;
}

export const XYPad: React.FC<XYPadProps> = ({ x, y, onChange, onEnsureAudio }) => {
  const padRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);

  const updateFromClient = useCallback(
    (clientX: number, clientY: number) => {
      const el = padRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const nx = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
      const ny = Math.max(0, Math.min(1, 1 - (clientY - rect.top) / Math.max(1, rect.height)));
      onChange(Number(nx.toFixed(2)), Number(ny.toFixed(2)));
    },
    [onChange]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    onEnsureAudio?.();
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    updateFromClient(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    updateFromClient(e.clientX, e.clientY);
  };

  const handlePointerUp = () => {
    setDragging(false);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold tracking-wider text-[#808090] uppercase">
          Atmosphere Matrix
        </span>
        <span className="font-mono-tabular text-xs text-[#00ff88]">
          Tension {Math.round(x * 100)}% · Instability {Math.round(y * 100)}%
        </span>
      </div>

      <div
        ref={padRef}
        role="application"
        aria-label="Atmosphere XY matrix pad for tension and instability"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="relative h-44 w-full touch-none select-none overflow-hidden rounded-xl border border-[#222230] bg-[#0c0c12] cursor-crosshair"
        style={{
          backgroundImage:
            'radial-gradient(circle at center, rgba(255, 140, 0, 0.08) 0%, transparent 72%), linear-gradient(to right, rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.035) 1px, transparent 1px)',
          backgroundSize: '100% 100%, 25% 25%, 25% 25%',
        }}
      >
        <span className="pointer-events-none absolute top-2 left-2.5 text-[10px] font-medium tracking-wider text-[#808090] uppercase">
          Instability
        </span>
        <span className="pointer-events-none absolute right-2.5 bottom-2 text-[10px] font-medium tracking-wider text-[#808090] uppercase">
          Tension
        </span>

        {/* Crosshair guide lines */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-0 bottom-0 w-px bg-[#ff8c00]/20"
          style={{ left: `${x * 100}%` }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-0 left-0 h-px bg-[#ff8c00]/20"
          style={{ top: `${(1 - y) * 100}%` }}
        />

        {/* Puck */}
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#ff8c00] bg-[#ff8c00]/25 transition-transform ${
            dragging ? 'scale-110' : 'scale-100'
          }`}
          style={{
            left: `${x * 100}%`,
            top: `${(1 - y) * 100}%`,
            boxShadow: '0 0 18px rgba(255, 140, 0, 0.45)',
          }}
        />
      </div>
    </div>
  );
};
