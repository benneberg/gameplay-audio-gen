import { Download, Link2, Save, Trash2, Upload } from 'lucide-react';
import React, { useRef, useState } from 'react';
import type { Preset } from '../../echo-engine/types';

interface PrstTabProps {
  savedPresets: Preset[];
  builtInPresets: Preset[];
  activePresetName: string;
  onSavePreset: (name: string) => void;
  onLoadPreset: (preset: Preset) => void;
  onDeletePreset: (name: string) => void;
  onExportPreset: () => void;
  onImportPreset: (file: File) => void;
  onSharePreset: () => void;
}

export const PrstTab: React.FC<PrstTabProps> = ({
  savedPresets,
  builtInPresets,
  activePresetName,
  onSavePreset,
  onLoadPreset,
  onDeletePreset,
  onExportPreset,
  onImportPreset,
  onSharePreset,
}) => {
  const [nameInput, setNameInput] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = nameInput.trim() || `Patch ${savedPresets.length + 1}`;
    onSavePreset(trimmed);
    setNameInput('');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImportPreset(file);
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-6 pb-2">
      <section className="space-y-2">
        <h2 className="text-xs font-semibold tracking-wider text-[#808090] uppercase">
          Save Current State
        </h2>
        <form onSubmit={handleSave} className="flex items-center gap-2">
          <input
            type="text"
            value={nameInput}
            maxLength={50}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder="Preset name (e.g. Dark Machine)"
            aria-label="New preset name"
            className="min-h-[44px] flex-1 rounded-lg border border-[#222230] bg-[#141419] px-3 text-sm text-[#e0e0e6] placeholder:text-[#808090] focus:border-[#ff8c00] focus:outline-none"
          />
          <button
            type="submit"
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-[#ff8c00] px-4 text-sm font-semibold text-[#0a0a0f] transition-colors hover:bg-[#ffaa33] whitespace-nowrap shrink-0"
          >
            <Save className="h-4 w-4" aria-hidden="true" />
            <span>Save</span>
          </button>
        </form>
      </section>

      <div className="h-px bg-[#222230]" />

      <section className="space-y-2">
        <h2 className="text-xs font-semibold tracking-wider text-[#808090] uppercase">
          Export, Import &amp; Share
        </h2>
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={onExportPreset}
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-[#222230] bg-[#1c1c24] px-3 text-xs font-semibold text-[#e0e0e6] hover:border-[#ff8c00] whitespace-nowrap"
          >
            <Download className="h-4 w-4 text-[#ff8c00]" aria-hidden="true" />
            <span>Export</span>
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-[#222230] bg-[#1c1c24] px-3 text-xs font-semibold text-[#e0e0e6] hover:border-[#ff8c00] whitespace-nowrap"
          >
            <Upload className="h-4 w-4 text-[#ff8c00]" aria-hidden="true" />
            <span>Import</span>
          </button>
          <button
            type="button"
            onClick={onSharePreset}
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-[#222230] bg-[#1c1c24] px-3 text-xs font-semibold text-[#e0e0e6] hover:border-[#ff8c00] whitespace-nowrap"
          >
            <Link2 className="h-4 w-4 text-[#ff8c00]" aria-hidden="true" />
            <span>Share URL</span>
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          onChange={handleFileChange}
          className="hidden"
          aria-hidden="true"
        />
      </section>

      <div className="h-px bg-[#222230]" />

      <section className="space-y-2.5">
        <h2 className="text-xs font-semibold tracking-wider text-[#808090] uppercase">
          Saved Presets
        </h2>
        {savedPresets.length === 0 ? (
          <p className="rounded-xl border border-[#222230] bg-[#141419] px-4 py-3 text-sm text-[#808090]">
            No saved presets yet. Save your current patch above.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
            {savedPresets.map((p) => {
              const isActive = p.name === activePresetName;
              return (
                <div
                  key={p.name}
                  className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
                    isActive
                      ? 'border-[#ff8c00]/70 bg-[#1c1c24]'
                      : 'border-[#222230] bg-[#141419]'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-[#e0e0e6]">{p.name}</div>
                    <div className="font-mono-tabular text-xs text-[#808090]">
                      Seed {p.seed} · {Math.round(p.atmosphere.tension * 100)}% tension
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onLoadPreset(p)}
                      className="min-h-[40px] rounded-lg border border-[#ff8c00] px-3.5 text-xs font-semibold text-[#ff8c00] transition-colors hover:bg-[#ff8c00] hover:text-[#0a0a0f]"
                    >
                      Load
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeletePreset(p.name)}
                      aria-label={`Delete preset ${p.name}`}
                      className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg border border-[#222230] text-[#808090] transition-colors hover:border-[#ff3344] hover:text-[#ff3344]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-2.5">
        <h2 className="text-xs font-semibold tracking-wider text-[#808090] uppercase">
          Built-In Library
        </h2>
        <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
          {builtInPresets.map((p) => {
            const isActive = p.name === activePresetName;
            return (
              <div
                key={p.name}
                className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
                  isActive
                    ? 'border-[#ff8c00]/70 bg-[#1c1c24]'
                    : 'border-[#222230] bg-[#141419]'
                }`}
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-[#e0e0e6]">{p.name}</div>
                  <div className="truncate text-xs text-[#808090]">
                    {p.description || `Seed ${p.seed}`}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onLoadPreset(p)}
                  className="min-h-[40px] shrink-0 rounded-lg border border-[#ff8c00] px-3.5 text-xs font-semibold text-[#ff8c00] transition-colors hover:bg-[#ff8c00] hover:text-[#0a0a0f]"
                >
                  Load
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
