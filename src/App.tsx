import {
  AudioWaveform,
  Dices,
  Gamepad2,
  Play,
  Save,
  Sliders,
  Square,
  Volume2,
  WifiOff,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EchoEngine } from './echo-engine/echo-engine';
import { PresetManager } from './echo-engine/presets/preset-manager';
import type { EventName, LFOConfig, Preset, RandomWalkConfig } from './echo-engine/types';
import { PWAInstallButton } from './components/PWAInstallButton';
import { Visualizer } from './components/Visualizer';
import { EvtTab } from './components/tabs/EvtTab';
import { GenTab } from './components/tabs/GenTab';
import { ModTab } from './components/tabs/ModTab';
import { PrstTab } from './components/tabs/PrstTab';
import { SrcTab } from './components/tabs/SrcTab';
import { useOnlineStatus } from './hooks/usePWAInstall';

type TabId = 'gen' | 'mod' | 'src' | 'evt' | 'prst';

const TABS: { id: TabId; label: string; icon: React.FC<{ className?: string }> }[] = [
  { id: 'gen', label: 'GEN', icon: Sliders },
  { id: 'mod', label: 'MOD', icon: AudioWaveform },
  { id: 'src', label: 'SRC', icon: Volume2 },
  { id: 'evt', label: 'EVT', icon: Gamepad2 },
  { id: 'prst', label: 'PRST', icon: Save },
];

function createInitialEngine(): EchoEngine {
  const hashPreset = typeof window !== 'undefined' ? PresetManager.decodePresetFromHash() : null;
  return new EchoEngine({
    seed: hashPreset?.seed ?? 42,
    preset: hashPreset ?? undefined,
    volume: hashPreset?.master.gain ?? 0.7,
  });
}

export default function App() {
  const engineRef = useRef<EchoEngine | null>(null);
  const getEngine = useCallback((): EchoEngine => {
    if (!engineRef.current || engineRef.current.getState() === 'destroyed') {
      engineRef.current = createInitialEngine();
    }
    return engineRef.current;
  }, []);

  const isOnline = useOnlineStatus();
  const [unlocked, setUnlocked] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('gen');
  const [presetState, setPresetState] = useState<Preset>(() => getEngine().getPreset());
  const [savedPresets, setSavedPresets] = useState<Preset[]>(() =>
    typeof window !== 'undefined' ? PresetManager.loadAllFromStorage() : []
  );
  const [gameStates, setGameStates] = useState<Record<string, number>>(() => ({
    progress: 0,
    proximity: 0,
    danger: 0,
    tension: getEngine().getPreset().atmosphere.tension,
  }));
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const builtInPresets = useMemo(() => PresetManager.getBuiltInPresets(), []);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
    }, 2400);
  }, []);

  useEffect(() => {
    const current = getEngine();
    setPresetState(current.getPreset());

    const unsubscribe = current.onEvent((eventName) => {
      if (eventName === 'started') {
        setIsPlaying(true);
        setAnalyser(current.getAnalyser());
      } else if (eventName === 'stopped') {
        setIsPlaying(false);
      } else if (eventName === 'presetLoaded' || eventName === 'seedChanged') {
        const nextPreset = current.getPreset();
        setPresetState(nextPreset);
        setGameStates((prev) => ({ ...prev, tension: nextPreset.atmosphere.tension }));
      }
    });

    if (typeof window !== 'undefined' && window.location.hash.includes('#preset=')) {
      showToast(`Loaded shared preset: ${current.getPreset().name}`);
    }

    return () => {
      unsubscribe();
      current.destroy();
    };
  }, [getEngine, showToast]);

  const syncState = useCallback(() => {
    setPresetState(getEngine().getPreset());
  }, [getEngine]);

  const handleUnlockAndStart = useCallback(async () => {
    const current = getEngine();
    try {
      await current.start();
      setUnlocked(true);
      setIsPlaying(true);
      setAnalyser(current.getAnalyser());
    } catch {
      setUnlocked(true);
      showToast('Tap Play to start audio');
    }
  }, [getEngine, showToast]);

  const handlePlay = useCallback(async () => {
    const current = getEngine();
    try {
      await current.start();
      setUnlocked(true);
      setIsPlaying(true);
      setAnalyser(current.getAnalyser());
    } catch {
      showToast('Unable to start Web Audio');
    }
  }, [getEngine, showToast]);

  const handleStop = useCallback(() => {
    getEngine().stop();
    setIsPlaying(false);
  }, [getEngine]);

  const handleNewSeed = useCallback(() => {
    const nextSeed = getEngine().reseed(undefined, true);
    syncState();
    showToast(`Seed ${nextSeed} generated`);
  }, [getEngine, showToast, syncState]);

  // Desktop keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) {
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        if (getEngine().isRunning()) handleStop();
        else void handlePlay();
      } else if (e.key === 'r' || e.key === 'R') {
        handleNewSeed();
      } else if (e.key >= '1' && e.key <= '5') {
        const idx = parseInt(e.key, 10) - 1;
        if (TABS[idx]) setActiveTab(TABS[idx].id);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [getEngine, handleNewSeed, handlePlay, handleStop]);

  const handleVolumeChange = (val: number) => {
    getEngine().setVolume(val);
    syncState();
  };

  const handleAtmosphereChange = (key: 'tension' | 'instability' | 'complexity', val: number) => {
    const current = getEngine();
    if (key === 'tension') {
      current.setTension(val);
      setGameStates((prev) => ({ ...prev, tension: val }));
    } else if (key === 'instability') {
      current.setInstability(val);
    } else {
      current.setComplexity(val);
    }
    syncState();
  };

  const handleParamChange = (path: string, val: number) => {
    getEngine().setParam(path, val);
    syncState();
  };

  const handleParamTypeChange = (path: string, type: string) => {
    getEngine().setParamType(path, type);
    syncState();
  };

  const handleReverbEnabledChange = (enabled: boolean) => {
    getEngine().setReverbEnabled(enabled);
    syncState();
  };

  const handleSeedApply = (seed: number) => {
    getEngine().reseed(seed, true);
    syncState();
    showToast(`Seed set to ${seed}`);
  };

  const handleLFOChange = (lfoNum: 1 | 2 | 3, next: LFOConfig) => {
    getEngine().configureLFO(lfoNum, next);
    syncState();
  };

  const handleWalkChange = (walkNum: 0 | 1 | 2, next: RandomWalkConfig) => {
    getEngine().configureRandomWalk(walkNum, next);
    syncState();
  };

  const handleTriggerEvent = (name: EventName, intensity: number) => {
    const current = getEngine();
    if (!current.isRunning()) {
      void handlePlay().then(() => {
        getEngine().triggerEvent(name, { intensity });
        syncState();
      });
    } else {
      current.triggerEvent(name, { intensity });
      syncState();
    }
    showToast(`Event: ${name}`);
  };

  const handleGameStateChange = (key: string, value: number) => {
    setGameStates((prev) => ({ ...prev, [key]: value }));
    getEngine().setState(key, value);
    syncState();
  };

  const handleSavePreset = (name: string) => {
    const preset = getEngine().savePreset(name);
    PresetManager.saveToStorage(preset);
    setSavedPresets(PresetManager.loadAllFromStorage());
    syncState();
    showToast(`Saved "${preset.name}"`);
  };

  const handleLoadPreset = (preset: Preset) => {
    getEngine().loadPreset(preset);
    syncState();
    showToast(`Loaded "${preset.name}"`);
  };

  const handleDeletePreset = (name: string) => {
    PresetManager.deleteFromStorage(name);
    setSavedPresets(PresetManager.loadAllFromStorage());
    showToast(`Deleted "${name}"`);
  };

  const handleExportPreset = () => {
    const preset = getEngine().getPreset();
    PresetManager.exportPreset(preset);
    showToast(`Exported ${preset.name}.json`);
  };

  const handleImportPreset = async (file: File) => {
    try {
      const preset = await PresetManager.importPresetFromFile(file);
      PresetManager.saveToStorage(preset);
      setSavedPresets(PresetManager.loadAllFromStorage());
      getEngine().loadPreset(preset);
      syncState();
      showToast(`Imported "${preset.name}"`);
    } catch {
      showToast('Invalid preset JSON file');
    }
  };

  const handleSharePreset = async () => {
    const preset = getEngine().getPreset();
    const hash = PresetManager.encodePresetToHash(preset);
    window.history.replaceState(null, '', hash);
    const fullUrl = window.location.href;
    try {
      await navigator.clipboard.writeText(fullUrl);
      showToast('Share URL copied to clipboard');
    } catch {
      showToast('Share URL updated in address bar');
    }
  };

  return (
    <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-[#0a0a0f] text-[#e0e0e6] pb-[var(--safe-bottom)]">
      {/* Mobile-required Audio Unlock Overlay */}
      {!unlocked && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Enable Web Audio"
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0a0a0f]/95 p-6 text-center backdrop-blur-md"
        >
          <div className="flex max-w-sm flex-col items-center gap-5">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-[#222230] bg-[#141419]">
              <AudioWaveform className="h-10 w-10 text-[#00ff88]" aria-hidden="true" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold tracking-tight text-[#e0e0e6]">
                Echo Engine Sound Lab
              </h1>
              <p className="text-sm text-[#808090]">
                Procedural Web Audio synthesizer for evolving atmospheric soundscapes.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleUnlockAndStart()}
              className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#ff8c00] px-6 text-base font-semibold text-[#0a0a0f] transition-transform active:scale-[0.98] hover:bg-[#ffaa33]"
            >
              <Volume2 className="h-5 w-5" aria-hidden="true" />
              <span>Tap to Enable Audio</span>
            </button>
          </div>
        </div>
      )}

      {/* Top Bar (52px compact height, 3 clean zones) */}
      <header className="flex h-[52px] shrink-0 items-center justify-between gap-4 border-b border-[#222230] bg-[#141419] px-4 lg:px-6">
        <span className="text-base font-bold tracking-tight text-[#e0e0e6] whitespace-nowrap shrink-0">
          ECHO LAB
        </span>

        <div className="font-mono-tabular flex items-center gap-2 text-xs text-[#808090] whitespace-nowrap shrink-0">
          <span>Seed {presetState.seed}</span>
          <span aria-hidden="true">·</span>
          <span className="hidden sm:inline truncate max-w-[160px]">{presetState.name}</span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!isOnline && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-[#ffaa33]">
              <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Offline</span>
            </span>
          )}
          <PWAInstallButton />
        </div>
      </header>

      {/* Main Responsive Workspace: Mobile Portrait Column <-> Tablet/Desktop Multi-Column */}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* Tablet / Desktop Left Sidebar Navigation */}
        <aside className="hidden md:flex md:w-20 lg:w-48 shrink-0 flex-col border-r border-[#222230] bg-[#141419] p-2 lg:p-3">
          <nav aria-label="Sound Lab sections" className="flex flex-col gap-1.5">
            {TABS.map(({ id, label, icon: Icon }) => {
              const active = activeTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveTab(id)}
                  aria-current={active ? 'page' : undefined}
                  className={`flex min-h-[44px] items-center justify-center lg:justify-start gap-3 rounded-lg px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-[#ff8c00] text-[#0a0a0f]'
                      : 'text-[#808090] hover:bg-[#1c1c24] hover:text-[#e0e0e6]'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="hidden lg:inline">{label}</span>
                </button>
              );
            })}
          </nav>

          <div className="mt-auto hidden lg:block space-y-1 border-t border-[#222230] pt-3 text-[11px] text-[#808090]">
            <div>Space: Play / Stop</div>
            <div>R: New Seed</div>
            <div>1–5: Switch Tab</div>
          </div>
        </aside>

        {/* Center / Top Visualizer + Status + Transport */}
        <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-12">
          <section className="flex shrink-0 flex-col border-b border-[#222230] lg:col-span-5 lg:border-r lg:border-b-0">
            {/* Visualizer */}
            <div className="h-[20vh] min-h-[132px] max-h-[220px] lg:h-[280px] lg:max-h-none w-full border-b border-[#222230]">
              <Visualizer analyser={analyser} isPlaying={isPlaying} />
            </div>

            {/* Status Strip */}
            <div className="flex h-10 shrink-0 items-center justify-between border-b border-[#222230] bg-[#141419] px-4 text-xs">
              <div className="flex items-center gap-2 font-mono-tabular">
                <span
                  aria-hidden="true"
                  className={`h-2 w-2 rounded-full ${
                    isPlaying ? 'bg-[#00ff88]' : 'bg-[#808090]'
                  }`}
                />
                <span className={isPlaying ? 'font-semibold text-[#00ff88]' : 'text-[#808090]'}>
                  {isPlaying ? 'PLAYING' : 'STOPPED'}
                </span>
              </div>
              <div className="font-mono-tabular text-[#e0e0e6]">
                Vol {Math.round(presetState.master.gain * 100)}%
              </div>
            </div>

            {/* Primary Transport Action Row */}
            <div className="grid grid-cols-3 gap-2 bg-[#141419] p-2.5 lg:p-4">
              <button
                type="button"
                onClick={() => void handlePlay()}
                disabled={isPlaying}
                className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border text-sm font-semibold transition-colors whitespace-nowrap ${
                  isPlaying
                    ? 'border-[#ff8c00]/40 bg-[#ff8c00]/15 text-[#ffaa33] opacity-75'
                    : 'border-[#ff8c00] bg-[#ff8c00] text-[#0a0a0f] hover:bg-[#ffaa33]'
                }`}
              >
                <Play className="h-4 w-4 fill-current" aria-hidden="true" />
                <span>Play</span>
              </button>

              <button
                type="button"
                onClick={handleStop}
                disabled={!isPlaying}
                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-[#ff3344]/60 bg-[#1c1c24] text-sm font-semibold text-[#ff3344] transition-colors hover:bg-[#ff3344] hover:text-[#0a0a0f] disabled:opacity-40 whitespace-nowrap"
              >
                <Square className="h-4 w-4 fill-current" aria-hidden="true" />
                <span>Stop</span>
              </button>

              <button
                type="button"
                onClick={handleNewSeed}
                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-[#222230] bg-[#1c1c24] text-sm font-semibold text-[#e0e0e6] transition-colors hover:border-[#ff8c00] whitespace-nowrap"
              >
                <Dices className="h-4 w-4 text-[#ff8c00]" aria-hidden="true" />
                <span>New</span>
              </button>
            </div>

            {/* Desktop-only Quick Summary below transport */}
            <div className="hidden lg:flex flex-1 flex-col justify-between bg-[#0a0a0f] p-4 text-xs text-[#808090]">
              <div className="space-y-2">
                <div className="font-semibold text-[#e0e0e6]">Active Patch Snapshot</div>
                <div className="font-mono-tabular flex justify-between border-b border-[#222230] pb-1.5">
                  <span>Oscillators</span>
                  <span className="text-[#e0e0e6]">
                    {presetState.sources.osc1.frequency} / {presetState.sources.osc2.frequency} /{' '}
                    {presetState.sources.osc3.frequency} Hz
                  </span>
                </div>
                <div className="font-mono-tabular flex justify-between border-b border-[#222230] pb-1.5">
                  <span>Main Filter</span>
                  <span className="text-[#e0e0e6]">
                    {presetState.filter.type} · {Math.round(presetState.filter.frequency)} Hz · Q{' '}
                    {presetState.filter.Q.toFixed(1)}
                  </span>
                </div>
                <div className="font-mono-tabular flex justify-between">
                  <span>Atmosphere</span>
                  <span className="text-[#e0e0e6]">
                    T {Math.round(presetState.atmosphere.tension * 100)}% · I{' '}
                    {Math.round(presetState.atmosphere.instability * 100)}% · C{' '}
                    {Math.round(presetState.atmosphere.complexity * 100)}%
                  </span>
                </div>
              </div>
              <div className="text-[11px] text-[#808090]">
                Standalone procedural Web Audio synthesizer · Zero dependencies
              </div>
            </div>
          </section>

          {/* Scrollable Context Controls Area */}
          <main className="echo-scroll min-h-0 flex-1 overflow-y-auto px-4 py-4 lg:col-span-7 lg:px-6 lg:py-5">
            {activeTab === 'gen' && (
              <GenTab
                preset={presetState}
                onVolumeChange={handleVolumeChange}
                onAtmosphereChange={handleAtmosphereChange}
                onParamChange={handleParamChange}
                onParamTypeChange={handleParamTypeChange}
                onReverbEnabledChange={handleReverbEnabledChange}
                onSeedApply={handleSeedApply}
                onRandomizeSeed={handleNewSeed}
              />
            )}
            {activeTab === 'mod' && (
              <ModTab
                preset={presetState}
                onLFOChange={handleLFOChange}
                onWalkChange={handleWalkChange}
              />
            )}
            {activeTab === 'src' && (
              <SrcTab
                preset={presetState}
                onParamChange={handleParamChange}
                onParamTypeChange={handleParamTypeChange}
              />
            )}
            {activeTab === 'evt' && (
              <EvtTab
                gameStates={gameStates}
                onTriggerEvent={handleTriggerEvent}
                onStateChange={handleGameStateChange}
              />
            )}
            {activeTab === 'prst' && (
              <PrstTab
                savedPresets={savedPresets}
                builtInPresets={builtInPresets}
                activePresetName={presetState.name}
                onSavePreset={handleSavePreset}
                onLoadPreset={handleLoadPreset}
                onDeletePreset={handleDeletePreset}
                onExportPreset={handleExportPreset}
                onImportPreset={(f) => void handleImportPreset(f)}
                onSharePreset={() => void handleSharePreset()}
              />
            )}
          </main>
        </div>
      </div>

      {/* Mobile Bottom Navigation (56px height) */}
      <nav
        aria-label="Primary mobile tabs"
        className="grid h-[56px] shrink-0 grid-cols-5 border-t border-[#222230] bg-[#141419] md:hidden"
      >
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              aria-current={active ? 'page' : undefined}
              className={`relative flex min-h-[44px] flex-col items-center justify-center gap-0.5 text-[10px] font-semibold transition-colors whitespace-nowrap ${
                active ? 'text-[#ff8c00]' : 'text-[#808090]'
              }`}
            >
              {active && (
                <span
                  aria-hidden="true"
                  className="absolute top-0 h-0.5 w-10 rounded-full bg-[#ff8c00]"
                />
              )}
              <Icon className="h-5 w-5" aria-hidden="true" />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>

      {/* Non-intrusive Toast Notification */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed bottom-20 left-1/2 z-40 -translate-x-1/2 rounded-lg border border-[#ff8c00]/50 bg-[#1c1c24] px-4 py-2 text-xs font-medium text-[#e0e0e6] shadow-lg md:bottom-6"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
