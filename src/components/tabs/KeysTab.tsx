import { ChevronDown, ChevronUp, Play, Shuffle, Square, Trash2 } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EchoEngine } from '../../echo-engine/echo-engine';
import { TouchSlider } from '../TouchSlider';

interface KeysTabProps {
  engine: EchoEngine;
  isPlaying: boolean;
  onEnsureAudio: () => Promise<void>;
}

interface ScaleDef {
  id: string;
  label: string;
  steps: number[];
}

const SCALES: ScaleDef[] = [
  { id: 'naturalMinor', label: 'Natural Minor', steps: [0, 2, 3, 5, 7, 8, 10] },
  { id: 'harmonicMinor', label: 'Harmonic Minor', steps: [0, 2, 3, 5, 7, 8, 11] },
  { id: 'phrygian', label: 'Phrygian', steps: [0, 1, 3, 5, 7, 8, 10] },
  { id: 'locrian', label: 'Locrian', steps: [0, 1, 3, 5, 6, 8, 10] },
  { id: 'wholetone', label: 'Whole Tone', steps: [0, 2, 4, 6, 8, 10] },
  { id: 'tritone', label: 'Tritone Hex', steps: [0, 1, 4, 6, 7, 10] },
  { id: 'hungarian', label: 'Hungarian Minor', steps: [0, 2, 3, 6, 7, 8, 11] },
  { id: 'chromatic', label: 'Chromatic', steps: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
];

const TUNINGS: { value: number; label: string }[] = [
  { value: 1, label: '12-TET' },
  { value: 0.5, label: 'Quarter-tone' },
  { value: 0.667, label: 'Third-tone' },
  { value: 1.06, label: 'Stretched' },
  { value: 0.94, label: 'Compressed' },
];

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const QWERTY_MAP = 'awsedftgyhujkolp;';
const WHITE_STEPS = new Set([0, 2, 4, 5, 7, 9, 11]);
const TOTAL_KEYS = 24;
const ROLL_ROWS = 8;
const ROLL_STEPS = 16;

function createInitialPattern(): boolean[][] {
  const grid = Array.from({ length: ROLL_ROWS }, () => Array(ROLL_STEPS).fill(false));
  const seedNotes: [number, number][] = [
    [0, 0],
    [0, 8],
    [2, 4],
    [3, 10],
    [1, 12],
    [4, 14],
  ];
  for (const [r, c] of seedNotes) {
    grid[r][c] = true;
  }
  return grid;
}

export const KeysTab: React.FC<KeysTabProps> = ({ engine, isPlaying, onEnsureAudio }) => {
  // octaveOffset 0 => base MIDI 36 (C2..B3), range -1..+2 => C1..C6
  const [octaveOffset, setOctaveOffset] = useState(0);
  const [scaleId, setScaleId] = useState('naturalMinor');
  const [tuningScale, setTuningScale] = useState(1);
  const [glideMode, setGlideMode] = useState(false);
  const [sustainMode, setSustainMode] = useState(false);
  const [attack, setAttack] = useState(0.02);
  const [release, setRelease] = useState(0.75);

  const [activeKeys, setActiveKeys] = useState<number[]>([]);
  const [latchedKeys, setLatchedKeys] = useState<number[]>([]);
  const latchedRef = useRef<Set<number>>(new Set());
  const activePointersRef = useRef<Map<number, number>>(new Map());
  const kbRef = useRef<HTMLDivElement | null>(null);

  // Sequencer state
  const [pattern, setPattern] = useState<boolean[][]>(() => createInitialPattern());
  const [seqPlaying, setSeqPlaying] = useState(false);
  const [bpm, setBpm] = useState(72);
  const [division, setDivision] = useState<8 | 16>(8);
  const [playhead, setPlayhead] = useState<number>(-1);
  const patternRef = useRef(pattern);
  patternRef.current = pattern;

  const activeScale = useMemo(
    () => SCALES.find((s) => s.id === scaleId) ?? SCALES[0],
    [scaleId]
  );

  const baseMidi = 36 + octaveOffset * 12;
  const lowOctaveNumber = 2 + octaveOffset;
  const highOctaveNumber = lowOctaveNumber + 2;

  const scaleSet = useMemo(() => new Set(activeScale.steps), [activeScale]);

  const rowToMidi = useCallback(
    (rowIdx: number) => {
      const steps = activeScale.steps;
      const deg = rowIdx % steps.length;
      const octAdd = Math.floor(rowIdx / steps.length) * 12;
      return baseMidi + steps[deg] + octAdd;
    },
    [activeScale.steps, baseMidi]
  );

  const formatMidiName = (midi: number) => {
    const name = NOTE_NAMES[((midi % 12) + 12) % 12];
    const oct = Math.floor(midi / 12) - 1;
    return `${name}${oct}`;
  };

  const triggerKeyOn = useCallback(
    async (keyIndex: number) => {
      if (!isPlaying) {
        await onEnsureAudio();
      }
      const midi = baseMidi + keyIndex;

      if (glideMode) {
        if (engine.getState() === 'playing') {
          if (activeKeys.length > 0) {
            engine.retuneVoice('kb-glide', midi, tuningScale);
          } else {
            engine.noteOn('kb-glide', midi, { attack, release, tuningScale });
          }
        }
        setActiveKeys([keyIndex]);
        return;
      }

      if (sustainMode) {
        if (latchedRef.current.has(keyIndex)) {
          latchedRef.current.delete(keyIndex);
          engine.noteOff(`kb-${keyIndex}`, release);
          setLatchedKeys([...latchedRef.current]);
          setActiveKeys((prev) => prev.filter((k) => k !== keyIndex));
          return;
        }
        latchedRef.current.add(keyIndex);
        setLatchedKeys([...latchedRef.current]);
      }

      engine.noteOn(`kb-${keyIndex}`, midi, { attack, release, tuningScale });
      setActiveKeys((prev) => (prev.includes(keyIndex) ? prev : [...prev, keyIndex]));
    },
    [
      activeKeys.length,
      attack,
      baseMidi,
      engine,
      glideMode,
      isPlaying,
      onEnsureAudio,
      release,
      sustainMode,
      tuningScale,
    ]
  );

  const triggerKeyOff = useCallback(
    (keyIndex: number) => {
      if (sustainMode && latchedRef.current.has(keyIndex)) {
        return;
      }
      if (glideMode) {
        engine.noteOff('kb-glide', release);
        setActiveKeys([]);
        return;
      }
      engine.noteOff(`kb-${keyIndex}`, release);
      setActiveKeys((prev) => prev.filter((k) => k !== keyIndex));
    },
    [engine, glideMode, release, sustainMode]
  );

  const clearLatched = useCallback(() => {
    for (const k of latchedRef.current) {
      engine.noteOff(`kb-${k}`, 0.15);
    }
    latchedRef.current.clear();
    engine.noteOff('kb-glide', 0.15);
    setLatchedKeys([]);
    setActiveKeys([]);
  }, [engine]);

  // Desktop QWERTY playback
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')
      ) {
        return;
      }
      const idx = QWERTY_MAP.indexOf(e.key.toLowerCase());
      if (idx >= 0 && idx < TOTAL_KEYS) {
        void triggerKeyOn(idx);
      }
    };
    const up = (e: KeyboardEvent) => {
      const idx = QWERTY_MAP.indexOf(e.key.toLowerCase());
      if (idx >= 0 && idx < TOTAL_KEYS) {
        triggerKeyOff(idx);
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [triggerKeyOn, triggerKeyOff]);

  // Clean up held voices when tab unmounts
  useEffect(() => {
    return () => {
      engine.releaseAllNotes();
    };
  }, [engine]);

  // Step Sequencer Timer
  useEffect(() => {
    if (!seqPlaying) {
      setPlayhead(-1);
      return;
    }

    let step = 0;
    const stepMs = (60000 / bpm) / (division / 4);
    const noteDurSec = Math.max(0.08, (stepMs / 1000) * 0.72);

    const tick = () => {
      setPlayhead(step);
      const grid = patternRef.current;
      for (let r = 0; r < ROLL_ROWS; r++) {
        if (grid[r]?.[step]) {
          engine.playNote(rowToMidi(r), {
            dur: noteDurSec,
            attack,
            release: Math.min(release, 0.5),
            tuningScale,
            vel: 0.72,
          });
        }
      }
      step = (step + 1) % ROLL_STEPS;
    };

    tick();
    const timer = window.setInterval(tick, stepMs);
    return () => window.clearInterval(timer);
  }, [attack, bpm, division, engine, release, rowToMidi, seqPlaying, tuningScale]);

  const toggleSeqPlay = async () => {
    if (!seqPlaying && !isPlaying) {
      await onEnsureAudio();
    }
    setSeqPlaying((prev) => !prev);
  };

  const handleRandomPattern = () => {
    const next = Array.from({ length: ROLL_ROWS }, () =>
      Array.from({ length: ROLL_STEPS }, () => engine.getTextureRNGNext() < 0.16)
    );
    setPattern(next);
  };

  const handleClearPattern = () => {
    setPattern(Array.from({ length: ROLL_ROWS }, () => Array(ROLL_STEPS).fill(false)));
  };

  const toggleCell = (row: number, col: number) => {
    setPattern((prev) =>
      prev.map((r, ri) => (ri === row ? r.map((v, ci) => (ci === col ? !v : v)) : r))
    );
  };

  // Build keyboard layout coordinates (14 white keys across 2 octaves)
  const keysLayout = useMemo(() => {
    const items: {
      index: number;
      isBlack: boolean;
      leftPct: number;
      widthPct: number;
      label: string;
      inScale: boolean;
    }[] = [];
    let whiteIdx = 0;
    const whiteWidth = 100 / 14;

    for (let i = 0; i < TOTAL_KEYS; i++) {
      const pc = i % 12;
      const isBlack = !WHITE_STEPS.has(pc);
      const oct = lowOctaveNumber + Math.floor(i / 12);
      const inScale = scaleSet.has(pc);
      if (!isBlack) {
        items.push({
          index: i,
          isBlack: false,
          leftPct: whiteIdx * whiteWidth,
          widthPct: whiteWidth,
          label: pc === 0 ? `C${oct}` : NOTE_NAMES[pc],
          inScale,
        });
        whiteIdx++;
      } else {
        items.push({
          index: i,
          isBlack: true,
          leftPct: whiteIdx * whiteWidth,
          widthPct: 5.2,
          label: NOTE_NAMES[pc],
          inScale,
        });
      }
    }
    return items;
  }, [lowOctaveNumber, scaleSet]);

  const resolveKeyIndexFromPoint = (clientX: number, clientY: number): number | null => {
    const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    if (!el) return null;
    const keyAttr = el.closest('[data-key-index]')?.getAttribute('data-key-index');
    if (keyAttr === null || keyAttr === undefined) return null;
    const parsed = parseInt(keyAttr, 10);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const handleKeyboardPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const keyIdx = resolveKeyIndexFromPoint(e.clientX, e.clientY);
    if (keyIdx === null) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    activePointersRef.current.set(e.pointerId, keyIdx);
    void triggerKeyOn(keyIdx);
  };

  const handleKeyboardPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const prevKey = activePointersRef.current.get(e.pointerId);
    if (prevKey === undefined) return;
    const nextKey = resolveKeyIndexFromPoint(e.clientX, e.clientY);
    if (nextKey !== null && nextKey !== prevKey) {
      triggerKeyOff(prevKey);
      activePointersRef.current.set(e.pointerId, nextKey);
      void triggerKeyOn(nextKey);
    }
  };

  const handleKeyboardPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const keyIdx = activePointersRef.current.get(e.pointerId);
    if (keyIdx !== undefined) {
      activePointersRef.current.delete(e.pointerId);
      triggerKeyOff(keyIdx);
    }
  };

  return (
    <div className="space-y-6 pb-2">
      {/* Octave, Scale & Voicing Controls */}
      <section className="space-y-3 rounded-xl border border-[#222230] bg-[#141419] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-xs font-semibold tracking-wider text-[#808090] uppercase">
              Audition Keyboard &amp; Register
            </h2>
            <p className="font-mono-tabular text-xs text-[#e0e0e6]">
              Range C{lowOctaveNumber}–C{highOctaveNumber} · Routed through live filter &amp; cavern FX
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                clearLatched();
                setOctaveOffset((o) => Math.max(-1, o - 1));
              }}
              disabled={octaveOffset <= -1}
              className="inline-flex min-h-[44px] items-center gap-1 rounded-lg border border-[#222230] bg-[#1c1c24] px-3 text-xs font-semibold text-[#e0e0e6] hover:border-[#ff8c00] disabled:opacity-40 whitespace-nowrap"
            >
              <ChevronDown className="h-4 w-4 text-[#ff8c00]" aria-hidden="true" />
              <span>OCT −</span>
            </button>
            <button
              type="button"
              onClick={() => {
                clearLatched();
                setOctaveOffset((o) => Math.min(2, o + 1));
              }}
              disabled={octaveOffset >= 2}
              className="inline-flex min-h-[44px] items-center gap-1 rounded-lg border border-[#222230] bg-[#1c1c24] px-3 text-xs font-semibold text-[#e0e0e6] hover:border-[#ff8c00] disabled:opacity-40 whitespace-nowrap"
            >
              <ChevronUp className="h-4 w-4 text-[#ff8c00]" aria-hidden="true" />
              <span>OCT +</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <select
            aria-label="Scale quantization"
            value={scaleId}
            onChange={(e) => setScaleId(e.target.value)}
            className="min-h-[44px] rounded-lg border border-[#222230] bg-[#0c0c12] px-3 text-xs font-medium text-[#e0e0e6] focus:border-[#ff8c00] focus:outline-none"
          >
            {SCALES.map((s) => (
              <option key={s.id} value={s.id}>
                Scale: {s.label}
              </option>
            ))}
          </select>

          <select
            aria-label="Tuning system"
            value={tuningScale}
            onChange={(e) => setTuningScale(parseFloat(e.target.value))}
            className="min-h-[44px] rounded-lg border border-[#222230] bg-[#0c0c12] px-3 text-xs font-medium text-[#e0e0e6] focus:border-[#ff8c00] focus:outline-none"
          >
            {TUNINGS.map((t) => (
              <option key={t.label} value={t.value}>
                Tuning: {t.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            aria-pressed={glideMode}
            onClick={() => {
              clearLatched();
              setGlideMode((g) => !g);
            }}
            className={`min-h-[44px] rounded-lg border px-3 text-xs font-semibold transition-colors whitespace-nowrap ${
              glideMode
                ? 'border-[#ff8c00] bg-[#ff8c00]/15 text-[#ffaa33]'
                : 'border-[#222230] bg-[#1c1c24] text-[#808090] hover:text-[#e0e0e6]'
            }`}
          >
            Glide: {glideMode ? 'On' : 'Off'}
          </button>

          <div className="flex gap-2">
            <button
              type="button"
              aria-pressed={sustainMode}
              onClick={() => {
                if (sustainMode) clearLatched();
                setSustainMode((s) => !s);
              }}
              className={`min-h-[44px] flex-1 rounded-lg border px-3 text-xs font-semibold transition-colors whitespace-nowrap ${
                sustainMode
                  ? 'border-[#00ff88] bg-[#00ff88]/15 text-[#00ff88]'
                  : 'border-[#222230] bg-[#1c1c24] text-[#808090] hover:text-[#e0e0e6]'
              }`}
            >
              Sustain: {sustainMode ? 'Latch' : 'Off'}
            </button>
            {(latchedKeys.length > 0 || activeKeys.length > 0) && (
              <button
                type="button"
                onClick={clearLatched}
                className="min-h-[44px] rounded-lg border border-[#ff3344]/60 bg-[#1c1c24] px-3 text-xs font-semibold text-[#ff3344] whitespace-nowrap"
              >
                Off
              </button>
            )}
          </div>
        </div>

        {/* 2-Octave Playable Touch Keyboard */}
        <div
          ref={kbRef}
          onPointerDown={handleKeyboardPointerDown}
          onPointerMove={handleKeyboardPointerMove}
          onPointerUp={handleKeyboardPointerUp}
          onPointerCancel={handleKeyboardPointerUp}
          className="relative h-40 w-full touch-none select-none overflow-hidden rounded-lg border border-[#222230] bg-[#0a0a0f]"
        >
          {keysLayout.map((k) => {
            const isOn = activeKeys.includes(k.index) || latchedKeys.includes(k.index);
            if (!k.isBlack) {
              return (
                <div
                  key={k.index}
                  data-key-index={k.index}
                  style={{ left: `${k.leftPct}%`, width: `${k.widthPct}%` }}
                  className={`absolute top-0 bottom-0 flex items-end justify-center border-r border-[#0a0a0f] pb-2 font-mono text-[10px] transition-colors ${
                    isOn
                      ? 'bg-[#ff8c00] text-[#0a0a0f] font-bold'
                      : k.inScale
                        ? 'bg-[#d9dcea] text-[#282c3a]'
                        : 'bg-[#7d8296] text-[#1d202b] opacity-65'
                  }`}
                >
                  {k.label}
                </div>
              );
            }
            return (
              <div
                key={k.index}
                data-key-index={k.index}
                style={{ left: `${k.leftPct}%`, width: `${k.widthPct}%` }}
                className={`absolute top-0 z-10 h-[58%] -translate-x-1/2 rounded-b border border-[#0a0a0f] flex items-end justify-center pb-1.5 font-mono text-[8px] transition-colors ${
                  isOn
                    ? 'bg-[#00ff88] text-[#0a0a0f] font-bold'
                    : k.inScale
                      ? 'bg-[#191c26] text-[#9aa2b8]'
                      : 'bg-[#11131a] text-[#555c70] opacity-75'
                }`}
              >
                {k.label}
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-x-6 lg:grid-cols-2">
          <TouchSlider
            label="Key Attack"
            value={attack}
            min={0.005}
            max={1.2}
            step={0.005}
            unit="s"
            onChange={setAttack}
          />
          <TouchSlider
            label="Key Release"
            value={release}
            min={0.05}
            max={3.5}
            step={0.05}
            unit="s"
            onChange={setRelease}
          />
        </div>
      </section>

      {/* 16-Step Scale-Quantized Piano Roll Sequencer */}
      <section className="space-y-3 rounded-xl border border-[#222230] bg-[#141419] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xs font-semibold tracking-wider text-[#808090] uppercase">
            Pattern Roll (16-Step Sequencer)
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void toggleSeqPlay()}
              className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold whitespace-nowrap ${
                seqPlaying
                  ? 'border-[#00ff88] bg-[#00ff88]/15 text-[#00ff88]'
                  : 'border-[#ff8c00] bg-[#ff8c00] text-[#0a0a0f]'
              }`}
            >
              {seqPlaying ? (
                <>
                  <Square className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                  <span>Stop Roll</span>
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                  <span>Play Roll</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleRandomPattern}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-[#222230] bg-[#1c1c24] px-3 text-xs font-semibold text-[#e0e0e6] hover:border-[#ff8c00] whitespace-nowrap"
            >
              <Shuffle className="h-3.5 w-3.5 text-[#ff8c00]" aria-hidden="true" />
              <span>Rand</span>
            </button>
            <button
              type="button"
              onClick={handleClearPattern}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-[#222230] bg-[#1c1c24] px-3 text-xs font-semibold text-[#808090] hover:border-[#ff3344] hover:text-[#ff3344] whitespace-nowrap"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Clear</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:items-center">
          <div className="sm:col-span-2">
            <TouchSlider
              label="Tempo"
              value={bpm}
              min={40}
              max={180}
              step={1}
              unit="BPM"
              onChange={setBpm}
            />
          </div>
          <select
            aria-label="Step division"
            value={division}
            onChange={(e) => setDivision(parseInt(e.target.value, 10) as 8 | 16)}
            className="min-h-[44px] rounded-lg border border-[#222230] bg-[#0c0c12] px-3 text-xs font-medium text-[#e0e0e6] focus:border-[#ff8c00] focus:outline-none"
          >
            <option value={8}>1/8 Step Division</option>
            <option value={16}>1/16 Step Division</option>
          </select>
        </div>

        <div className="overflow-x-auto pb-1">
          <div className="grid min-w-[520px] grid-cols-[44px_repeat(16,minmax(24px,1fr))] gap-1">
            {Array.from({ length: ROLL_ROWS }, (_, idx) => ROLL_ROWS - 1 - idx).map((rowIdx) => {
              const midi = rowToMidi(rowIdx);
              return (
                <React.Fragment key={rowIdx}>
                  <div className="font-mono-tabular flex items-center justify-end pr-1.5 text-[10px] text-[#808090]">
                    {formatMidiName(midi)}
                  </div>
                  {Array.from({ length: ROLL_STEPS }, (_, stepIdx) => {
                    const active = pattern[rowIdx][stepIdx];
                    const isHead = playhead === stepIdx;
                    const isBeat = stepIdx % 4 === 0;
                    return (
                      <button
                        key={stepIdx}
                        type="button"
                        aria-label={`${formatMidiName(midi)} step ${stepIdx + 1}`}
                        aria-pressed={active}
                        onClick={() => toggleCell(rowIdx, stepIdx)}
                        className={`h-7 rounded border transition-colors ${
                          active
                            ? isHead
                              ? 'border-[#00ff88] bg-[#00ff88]'
                              : 'border-[#ff8c00] bg-[#ff8c00]'
                            : isHead
                              ? 'border-[#00ff88] bg-[#1c1c24]'
                              : isBeat
                                ? 'border-[#323244] bg-[#0e0e15]'
                                : 'border-[#222230] bg-[#0a0a0f]'
                        }`}
                      />
                    );
                  })}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
};
