# ECHO ENGINE — Preset Format Specification

**Version:** 1.0  
**Format:** JSON  
**Encoding:** UTF-8

---

## 1. Overview

A preset captures the complete state of the Echo Engine at a moment in
time. Presets can be saved, loaded, exported, imported, and shared.

---

## 2. Preset Schema

```json
{
  "$schema": "https://echo-engine.dev/schema/preset-v1.json",
  "version": "1.0",
  "name": "Dark Machine",
  "seed": 42,
  "description": "A deep, unstable mechanical drone",
  "author": "",
  "tags": ["dark", "mechanical", "drone"],

  "sources": {
    "osc1": {
      "waveform": "sawtooth",
      "frequency": 120.0,
      "detune": 0.0,
      "gain": 0.3
    },
    "osc2": {
      "waveform": "triangle",
      "frequency": 180.0,
      "detune": -5.0,
      "gain": 0.2
    },
    "osc3": {
      "waveform": "sine",
      "frequency": 240.0,
      "detune": 8.0,
      "gain": 0.25
    },
    "noise": {
      "type": "pink",
      "gain": 0.15,
      "filterType": "bandpass",
      "filterFrequency": 800.0
    }
  },

  "filter": {
    "type": "lowpass",
    "frequency": 1200.0,
    "Q": 8.0
  },

  "modulation": {
    "lfo1": {
      "waveform": "sine",
      "rate": 0.1,
      "depth": 30.0,
      "target": "osc1.frequency"
    },
    "lfo2": {
      "waveform": "triangle",
      "rate": 0.05,
      "depth": 500.0,
      "target": "filter.frequency"
    },
    "lfo3": {
      "waveform": "sine",
      "rate": 0.02,
      "depth": 0.8,
      "target": "panner.pan"
    },
    "randomWalk1": {
      "target": "filter.Q",
      "min": 2.0,
      "max": 20.0,
      "stepSize": 1.0,
      "interval": 100,
      "smoothing": 0.1
    },
    "randomWalk2": {
      "target": "filter.frequency",
      "min": 400.0,
      "max": 3000.0,
      "stepSize": 150.0,
      "interval": 200,
      "smoothing": 0.2
    },
    "randomWalk3": {
      "target": "masterGain",
      "min": 0.5,
      "max": 1.0,
      "stepSize": 0.05,
      "interval": 150,
      "smoothing": 0.15
    }
  },

  "effects": {
    "delay": {
      "time": 0.3,
      "feedback": 0.4,
      "mix": 0.3
    },
    "reverb": {
      "enabled": true,
      "mix": 0.2,
      "decay": 2.5
    }
  },

  "atmosphere": {
    "tension": 0.3,
    "instability": 0.4,
    "complexity": 0.5
  },

  "master": {
    "gain": 0.7,
    "pan": 0.0
  }
}
```

---

## 3. Field Reference

### 3.1 Top Level

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `version` | string | ✅ | Preset format version |
| `name` | string | ✅ | Human-readable preset name |
| `seed` | integer | ✅ | PRNG seed for session variation |
| `description` | string | ❌ | Optional description |
| `author` | string | ❌ | Optional author |
| `tags` | string[] | ❌ | Optional categorization tags |

### 3.2 Sources

Each oscillator:
| Field | Type | Range | Default |
|-------|------|-------|---------|
| `waveform` | string | `sine`, `triangle`, `sawtooth`, `square` | `sawtooth` |
| `frequency` | number | 20–2000 | 120 |
| `detune` | number | -1200–1200 | 0 |
| `gain` | number | 0.0–1.0 | 0.3 |

Noise:
| Field | Type | Range | Default |
|-------|------|-------|---------|
| `type` | string | `white`, `pink` | `pink` |
| `gain` | number | 0.0–1.0 | 0.15 |
| `filterType` | string | `lowpass`, `bandpass`, `highpass` | `bandpass` |
| `filterFrequency` | number | 50–8000 | 800 |

### 3.3 Filter

| Field | Type | Range | Default |
|-------|------|-------|---------|
| `type` | string | `lowpass`, `highpass`, `bandpass`, `notch`, `peaking` | `lowpass` |
| `frequency` | number | 20–12000 | 1200 |
| `Q` | number | 0.1–40 | 8 |

### 3.4 Modulation — LFOs

| Field | Type | Range | Default |
|-------|------|-------|---------|
| `waveform` | string | `sine`, `triangle`, `sawtooth`, `square` | `sine` |
| `rate` | number | 0.01–20 | 0.1 |
| `depth` | number | target-specific | varies |
| `target` | string | see target list | `osc1.frequency` |

### 3.5 Modulation — Random Walks

| Field | Type | Range | Default |
|-------|------|-------|---------|
| `target` | string | see target list | `filter.Q` |
| `min` | number | target-specific | 2 |
| `max` | number | target-specific | 20 |
| `stepSize` | number | 0.01–5.0 | 1.0 |
| `interval` | integer | 50–500 | 100 |
| `smoothing` | number | 0.01–1.0 | 0.1 |

### 3.6 Modulation Targets

```
osc1.frequency    osc2.frequency    osc3.frequency
osc1.detune       osc2.detune       osc3.detune
osc1.gain         osc2.gain         osc3.gain
filter.frequency  filter.Q
noise.gain        noise.filterFrequency
delay.time        delay.feedback    delay.mix
reverb.mix
panner.pan        masterGain
lfo1.rate         lfo2.rate         lfo3.rate
```

### 3.7 Effects

Delay:
| Field | Type | Range | Default |
|-------|------|-------|---------|
| `time` | number | 0.01–2.0 | 0.3 |
| `feedback` | number | 0.0–0.95 | 0.4 |
| `mix` | number | 0.0–1.0 | 0.3 |

Reverb:
| Field | Type | Range | Default |
|-------|------|-------|---------|
| `enabled` | boolean | true/false | true |
| `mix` | number | 0.0–1.0 | 0.2 |
| `decay` | number | 0.5–5.0 | 2.5 |

---

## 4. Built-In Presets (v1.0)

### 4.1 Deep Drone

```json
{
  "version": "1.0",
  "name": "Deep Drone",
  "seed": 101,
  "description": "A deep, slow, atmospheric drone",
  "sources": {
    "osc1": { "waveform": "sawtooth", "frequency": 55, "detune": 0, "gain": 0.35 },
    "osc2": { "waveform": "triangle", "frequency": 82, "detune": -3, "gain": 0.25 },
    "osc3": { "waveform": "sine", "frequency": 110, "detune": 2, "gain": 0.2 },
    "noise": { "type": "pink", "gain": 0.1, "filterType": "lowpass", "filterFrequency": 400 }
  },
  "filter": { "type": "lowpass", "frequency": 600, "Q": 5 },
  "modulation": {
    "lfo1": { "waveform": "sine", "rate": 0.03, "depth": 15, "target": "osc1.frequency" },
    "lfo2": { "waveform": "triangle", "rate": 0.01, "depth": 200, "target": "filter.frequency" },
    "lfo3": { "waveform": "sine", "rate": 0.008, "depth": 0.6, "target": "panner.pan" },
    "randomWalk1": { "target": "filter.Q", "min": 3, "max": 12, "stepSize": 0.5, "interval": 300, "smoothing": 0.3 },
    "randomWalk2": { "target": "filter.frequency", "min": 300, "max": 1200, "stepSize": 50, "interval": 500, "smoothing": 0.5 },
    "randomWalk3": { "target": "delay.mix", "min": 0.1, "max": 0.5, "stepSize": 0.03, "interval": 400, "smoothing": 0.2 }
  },
  "effects": {
    "delay": { "time": 0.8, "feedback": 0.5, "mix": 0.3 },
    "reverb": { "enabled": true, "mix": 0.35, "decay": 3.5 }
  },
  "atmosphere": { "tension": 0.15, "instability": 0.25, "complexity": 0.4 },
  "master": { "gain": 0.7, "pan": 0 }
}
```

### 4.2 Tension Builder

```json
{
  "version": "1.0",
  "name": "Tension Builder",
  "seed": 202,
  "description": "Rising dissonance and instability",
  "sources": {
    "osc1": { "waveform": "sawtooth", "frequency": 110, "detune": 0, "gain": 0.3 },
    "osc2": { "waveform": "square", "frequency": 165, "detune": -25, "gain": 0.25 },
    "osc3": { "waveform": "sawtooth", "frequency": 220, "detune": 15, "gain": 0.2 },
    "noise": { "type": "white", "gain": 0.2, "filterType": "bandpass", "filterFrequency": 1200 }
  },
  "filter": { "type": "lowpass", "frequency": 2000, "Q": 12 },
  "modulation": {
    "lfo1": { "waveform": "sawtooth", "rate": 0.5, "depth": 40, "target": "osc1.frequency" },
    "lfo2": { "waveform": "sawtooth", "rate": 0.2, "depth": 800, "target": "filter.frequency" },
    "lfo3": { "waveform": "triangle", "rate": 0.08, "depth": 0.9, "target": "panner.pan" },
    "randomWalk1": { "target": "filter.Q", "min": 5, "max": 35, "stepSize": 2.5, "interval": 80, "smoothing": 0.08 },
    "randomWalk2": { "target": "delay.feedback", "min": 0.2, "max": 0.8, "stepSize": 0.1, "interval": 100, "smoothing": 0.1 },
    "randomWalk3": { "target": "masterGain", "min": 0.5, "max": 1.0, "stepSize": 0.08, "interval": 60, "smoothing": 0.05 }
  },
  "effects": {
    "delay": { "time": 0.2, "feedback": 0.6, "mix": 0.4 },
    "reverb": { "enabled": true, "mix": 0.15, "decay": 1.5 }
  },
  "atmosphere": { "tension": 0.7, "instability": 0.65, "complexity": 0.7 },
  "master": { "gain": 0.75, "pan": 0 }
}
```

### 4.3 Serene Void

```json
{
  "version": "1.0",
  "name": "Serene Void",
  "seed": 303,
  "description": "Quiet, spacious, minimal",
  "sources": {
    "osc1": { "waveform": "sine", "frequency": 65, "detune": 0, "gain": 0.2 },
    "osc2": { "waveform": "sine", "frequency": 98, "detune": 2, "gain": 0.15 },
    "osc3": { "waveform": "sine", "frequency": 130, "detune": -1, "gain": 0.1 },
    "noise": { "type": "pink", "gain": 0.05, "filterType": "lowpass", "filterFrequency": 300 }
  },
  "filter": { "type": "lowpass", "frequency": 500, "Q": 2 },
  "modulation": {
    "lfo1": { "waveform": "sine", "rate": 0.01, "depth": 8, "target": "osc1.frequency" },
    "lfo2": { "waveform": "sine", "rate": 0.005, "depth": 150, "target": "filter.frequency" },
    "lfo3": { "waveform": "sine", "rate": 0.003, "depth": 0.4, "target": "panner.pan" },
    "randomWalk1": { "target": "filter.Q", "min": 1, "max": 5, "stepSize": 0.2, "interval": 500, "smoothing": 0.5 },
    "randomWalk2": { "target": "reverb.mix", "min": 0.2, "max": 0.5, "stepSize": 0.02, "interval": 800, "smoothing": 0.3 },
    "randomWalk3": { "target": "masterGain", "min": 0.6, "max": 0.8, "stepSize": 0.02, "interval": 600, "smoothing": 0.4 }
  },
  "effects": {
    "delay": { "time": 1.5, "feedback": 0.3, "mix": 0.2 },
    "reverb": { "enabled": true, "mix": 0.5, "decay": 4.5 }
  },
  "atmosphere": { "tension": 0.1, "instability": 0.15, "complexity": 0.3 },
  "master": { "gain": 0.6, "pan": 0 }
}
```

---

## 5. Serialization

### Save to localStorage

```js
localStorage.setItem('echo-preset-' + preset.name, JSON.stringify(preset));
```

### Export to file

```js
function exportPreset(preset) {
  const blob = new Blob([JSON.stringify(preset, null, 2)], {
    type: 'application/json'
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `echo-preset-${preset.name.toLowerCase().replace(/\s+/g, '-')}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
```

### Share via URL

```js
function encodePresetToHash(preset) {
  const json = JSON.stringify(preset);
  return '#preset=' + btoa(encodeURIComponent(json));
}

function decodePresetFromHash() {
  const match = location.hash.match(/#preset=(.+)/);
  if (!match) return null;
  return JSON.parse(decodeURIComponent(atob(match[1])));
}
```

---

## 6. Validation

When loading a preset (import or URL):

1. Parse JSON (catch errors)
2. Check `version` field exists
3. Validate all required fields exist
4. Clamp all numeric values to valid ranges
5. Log warnings for missing optional fields (use defaults)
6. Reject if `version` major version is incompatible

---

## 7. Versioning

| Version | Changes |
|---------|---------|
| 1.0 | Initial format |

Forward compatibility: unknown fields are ignored on load.
Backward compatibility: missing optional fields use defaults.
