import { Activity, BarChart3 } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';

interface VisualizerProps {
  analyser: AnalyserNode | null;
  isPlaying: boolean;
}

type VizMode = 'waveform' | 'spectrum';

export const Visualizer: React.FC<VisualizerProps> = ({ analyser, isPlaying }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [mode, setMode] = useState<VizMode>('waveform');

  useEffect(() => {
    if (!analyser) return;
    analyser.fftSize = mode === 'waveform' ? 2048 : 1024;
  }, [analyser, mode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let rafId = 0;
    let lastDraw = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const targetW = Math.max(1, Math.floor(rect.width * dpr));
      const targetH = Math.max(1, Math.floor(rect.height * dpr));
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const drawGrid = (w: number, h: number) => {
      ctx.fillStyle = '#0c0c12';
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.moveTo(w * 0.25, 0);
      ctx.lineTo(w * 0.25, h);
      ctx.moveTo(w * 0.5, 0);
      ctx.lineTo(w * 0.5, h);
      ctx.moveTo(w * 0.75, 0);
      ctx.lineTo(w * 0.75, h);
      ctx.stroke();
    };

    const drawFrame = (now: number) => {
      const isMobile = window.innerWidth < 640;
      const frameBudget = reducedMotion ? 250 : isMobile ? 33 : 16;

      if (now - lastDraw >= frameBudget) {
        lastDraw = now;
        const w = canvas.width;
        const h = canvas.height;
        drawGrid(w, h);

        if (analyser && isPlaying) {
          if (mode === 'waveform') {
            const bufferLen = analyser.fftSize;
            const data = new Uint8Array(bufferLen);
            analyser.getByteTimeDomainData(data);

            ctx.lineWidth = Math.max(1.5, Math.min(window.devicePixelRatio || 1, 2) * 1.1);
            ctx.strokeStyle = '#00ff88';
            ctx.beginPath();

            const sliceWidth = w / bufferLen;
            let x = 0;
            for (let i = 0; i < bufferLen; i++) {
              const v = data[i] / 128.0;
              const y = (v * h) / 2;
              if (i === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
              x += sliceWidth;
            }
            ctx.stroke();
          } else {
            const binCount = analyser.frequencyBinCount;
            const freqData = new Uint8Array(binCount);
            analyser.getByteFrequencyData(freqData);

            const barCount = isMobile ? 36 : 64;
            const gap = Math.max(2, Math.floor(w / barCount / 5));
            const barWidth = Math.max(2, (w - gap * (barCount + 1)) / barCount);

            const grad = ctx.createLinearGradient(0, h, 0, 0);
            grad.addColorStop(0, '#ff8c00');
            grad.addColorStop(1, '#ffaa33');
            ctx.fillStyle = grad;

            for (let i = 0; i < barCount; i++) {
              // Logarithmic frequency mapping for musical balance
              const logStart = Math.floor(Math.pow(binCount, i / barCount));
              const logEnd = Math.max(logStart + 1, Math.floor(Math.pow(binCount, (i + 1) / barCount)));
              let peak = 0;
              for (let b = logStart; b < Math.min(binCount, logEnd); b++) {
                if (freqData[b] > peak) peak = freqData[b];
              }
              const barH = Math.max(2, (peak / 255) * (h * 0.88));
              const bx = gap + i * (barWidth + gap);
              ctx.fillRect(bx, h - barH, barWidth, barH);
            }
          }
        } else {
          // Resting flat baseline
          ctx.strokeStyle = mode === 'waveform' ? 'rgba(0, 255, 136, 0.32)' : 'rgba(255, 140, 0, 0.3)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(0, h / 2);
          ctx.lineTo(w, h / 2);
          ctx.stroke();
        }
      }

      if (isPlaying && !reducedMotion) {
        rafId = requestAnimationFrame(drawFrame);
      }
    };

    rafId = requestAnimationFrame(drawFrame);

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [analyser, isPlaying, mode]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0c0c12]">
      <canvas ref={canvasRef} className="block h-full w-full" aria-label={`Audio ${mode} visualizer`} />
      <button
        type="button"
        onClick={() => setMode((m) => (m === 'waveform' ? 'spectrum' : 'waveform'))}
        aria-label={`Switch to ${mode === 'waveform' ? 'spectrum' : 'waveform'} view`}
        className="absolute top-2.5 right-2.5 inline-flex min-h-[40px] min-w-[40px] items-center gap-1.5 rounded-lg border border-[#222230] bg-[#141419]/90 px-2.5 py-1.5 text-xs font-medium text-[#e0e0e6] backdrop-blur-sm transition-colors hover:border-[#ff8c00] focus-visible:outline-2 focus-visible:outline-[#ff8c00]"
      >
        {mode === 'waveform' ? (
          <>
            <BarChart3 className="h-4 w-4 text-[#ff8c00]" aria-hidden="true" />
            <span className="hidden sm:inline">Spectrum</span>
          </>
        ) : (
          <>
            <Activity className="h-4 w-4 text-[#00ff88]" aria-hidden="true" />
            <span className="hidden sm:inline">Waveform</span>
          </>
        )}
      </button>
    </div>
  );
};
