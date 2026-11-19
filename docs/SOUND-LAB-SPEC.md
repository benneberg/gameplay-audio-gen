# ECHO ENGINE SOUND LABORATORY — UI/UX Specification

**Version:** 1.0  
**Design principle:** Mobile-first, dark theme, touch-optimized  
**Platform:** Progressive Web App (PWA-ready)

---

## 1. Overview

The Sound Lab is a standalone single-page web application for designing,
experimenting with, testing, and saving Echo Engine soundscapes. It runs
independently of Shadowflap.

**Primary target:** Mobile phones (portrait orientation)  
**Secondary target:** Tablets, desktop browsers  
**Aesthetic:** Dark, minimal, matching Shadowflap's atmosphere

---

## 2. Layout Structure (Mobile Portrait)

```
┌─────────────────────────────────┐
│          TOP BAR                │
│  ☠ ECHO LAB    🎲 Seed: 42    │  56px height
├─────────────────────────────────┤
│                                 │
│        VISUALIZER AREA          │  ~25vh
│    ┌───────────────────────┐    │
│    │  Waveform + Spectrum  │    │  Canvas
│    │  (dark background,    │    │
│    │   green/amber lines)  │    │
│    └───────────────────────┘    │
│                                 │
├─────────────────────────────────┤
│          STATUS BAR             │
│  ● PLAYING    Vol: 70%   ⚡     │  40px height
├─────────────────────────────────┤
│                                 │
│     CONTEXT CONTROLS AREA       │  Scrollable
│   (changes per active tab)      │  ~40vh
│                                 │
│   ┌─────────────────────────┐  │
│   │ Parameter control rows  │  │
│   │ with touch sliders      │  │
│   │ and value readouts      │  │
│   └─────────────────────────┘  │
│                                 │
│   ┌─────────────────────────┐  │
│   │ More parameters...      │  │
│   │ (scroll down)           │  │
│   └─────────────────────────┘  │
│                                 │
├─────────────────────────────────┤
│         ACTION BUTTONS          │  Row of buttons
│  [▶ Play] [⏹ Stop] [🎲 New]  │  48px height
│  [💾 Save] [📂 Load] [🔗]    │
├─────────────────────────────────┤
│         BOTTOM NAVIGATION       │  56px height
│  ┌────┬────┬────┬────┬────┐   │
│  │ ⚙  │ 🎛 │ 🔊 │ 🎮 │ 💾 │   │
│  │GEN │MOD │SRC │EVT │PRST│   │
│  └────┴────┴────┴────┴────┘   │
└─────────────────────────────────┘
```

---

## 3. Color Palette

| Element | Color | Hex |
|---------|-------|-----|
| Background | Near black | `#0a0a0f` |
| Surface / cards | Dark gray | `#141419` |
| Surface elevated | Slightly lighter | `#1c1c24` |
| Primary text | Light gray | `#e0e0e6` |
| Secondary text | Muted gray | `#808090` |
| Accent / active | Amber/orange | `#ff8c00` |
| Accent hover | Bright amber | `#ffaa33` |
| Visualizer waveform | Green | `#00ff88` |
| Visualizer spectrum | Amber | `#ff8c00` |
| Danger / stop | Red | `#ff3344` |
| Slider track | Dark | `#2a2a35` |
| Slider fill | Accent gradient | `#ff8c00` → `#ffaa33` |
| Slider thumb | Accent | `#ff8c00` |
| Border | Subtle | `#222230` |

---

## 4. Typography

| Element | Font | Size | Weight |
|---------|------|------|--------|
| Title | System UI stack | 18px | 700 |
| Section headers | System UI stack | 14px | 600 |
| Parameter labels | System UI stack | 13px | 500 |
| Values / readouts | Monospace | 13px | 400 |
| Buttons | System UI stack | 14px | 600 |
| Nav icons + labels | System UI stack | 10px | 500 |

**Font stack:**
```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
             Oxygen, Ubuntu, Cantarell, sans-serif;
```

---

## 5. Component Specifications

### 5.1 Touch Slider

The primary control element. Used for all numeric parameters.

```
┌─────────────────────────────────────┐
│  Filter Cutoff              2400 Hz │  ← Label (left) + Value (right)
│  ┌────────────────────────────────┐ │
│  │████████████████░░░░░░░░░░░░░░░░│ │  ← Track (8px height)
│  └────────────────────────────────┘ │     Touch target: 44px height
│         ○                           │  ← Thumb (20px visible, 44px hit)
└─────────────────────────────────────┘
```

**Specs:**
- Track height: 8px, rounded (4px radius)
- Thumb: 20px visible circle, 44px touch area
- Fill: gradient from accent-dark to accent-light
- Value updates in real-time during drag
- Snap to steps if step size specified (e.g., 1 Hz for frequency)
- Haptic feedback on value change (10ms vibration, if supported)

### 5.2 Toggle / Dropdown

Used for enumerated parameters (waveform, filter type).

**Toggle (binary):**
```
┌─────────────────────────────┐
│  Reverb              [ ON ] │  ← Pill toggle
└─────────────────────────────┘
```

**Dropdown (multi-option):**
```
┌─────────────────────────────┐
│  Osc 1 Waveform             │
│  ┌────────────────────────┐ │
│  │  [sine|triangle|saw~|sq]│ │  ← Segmented control
│  └────────────────────────┘ │
└─────────────────────────────┘
```

### 5.3 Action Button

```
┌──────────────────────┐
│     ▶  PLAY          │  ← 48px height, full-width or half-width
└──────────────────────┘
```

**States:**
- Default: surface background, border
- Pressed: accent background, white text
- Disabled: 40% opacity
- Active (e.g., playing): accent background

### 5.4 Seed Display

```
┌─────────────────────────────┐
│  🎲 Seed                    │
│  ┌────────────────────────┐ │
│  │  42               [↻]  │ │  ← Number input + randomize button
│  └────────────────────────┘ │
└─────────────────────────────┘
```

### 5.5 Visualizer

A single `<canvas>` element showing two views:

**Mode 1: Waveform (default)**
- Oscilloscope-style time-domain display
- Green line on dark background
- 1px line width, smooth rendering

**Mode 2: Spectrum**
- Frequency-domain bar chart
- Amber/orange gradient bars
- Logarithmic frequency scale

Toggle between modes via a small button overlay.

**Performance:**
- Uses `requestAnimationFrame`
- 30fps target on mobile (60fps on desktop)
- Canvas sized to device pixel ratio
- AnalyserNode `fftSize`: 2048 (waveform), 1024 (spectrum)

### 5.6 Parameter Row

A reusable row component for a parameter + slider:

```html
<div class="param-row">
  <label class="param-label">Filter Cutoff</label>
  <span class="param-value">2400 Hz</span>
  <input type="range" class="param-slider"
         min="20" max="12000" value="2400" step="1">
</div>
```

---

## 6. Tab Content Specifications

### Tab 1: GEN (Generation / Atmosphere)

Master controls and atmosphere macros.

**Parameters:**
| Parameter | Control | Range | Default |
|-----------|---------|-------|---------|
| Master Volume | Slider | 0.0–1.0 | 0.7 |
| Tension | Slider | 0.0–1.0 | 0.3 |
| Instability | Slider | 0.0–1.0 | 0.4 |
| Complexity | Slider | 0.0–1.0 | 0.5 |
| Seed | Number input | integer | random |

### Tab 2: MOD (Modulation)

LFO and random walk controls.

**LFO 1:**
| Parameter | Control | Range | Default |
|-----------|---------|-------|---------|
| LFO 1 Waveform | Segmented | sine/tri/saw/sq | sine |
| LFO 1 Rate | Slider | 0.01–20 Hz | 0.1 |
| LFO 1 Depth | Slider | 0.0–100% | 30% |
| LFO 1 Target | Dropdown | osc1.freq / osc2.freq / osc3.freq / filter.freq / filter.Q / pan / delay.time | osc1.freq |

**LFO 2:** (same structure, default: filter.freq)  
**LFO 3:** (same structure, default: pan)

**Random Walk 1:**
| Parameter | Control | Range | Default |
|-----------|---------|-------|---------|
| RW1 Target | Dropdown | filter.Q / filter.freq / masterGain / delay.feedback | filter.Q |
| RW1 Range Min | Slider | target-specific | 2 |
| RW1 Range Max | Slider | target-specific | 20 |
| RW1 Step Size | Slider | 0.1–5.0 | 1.0 |
| RW1 Speed | Slider | 50–500ms interval | 100ms |

**Random Walk 2 & 3:** (same structure)

### Tab 3: SRC (Sources)

Oscillator and noise controls.

**Oscillator 1:**
| Parameter | Control | Range | Default |
|-----------|---------|-------|---------|
| Osc 1 Waveform | Segmented | sine/tri/saw/sq | sawtooth |
| Osc 1 Frequency | Slider | 20–2000 Hz | 120 |
| Osc 1 Detune | Slider | -1200–1200 cents | 0 |
| Osc 1 Gain | Slider | 0.0–1.0 | 0.3 |

**Oscillator 2:** (default: triangle, 180Hz, -5 cents, 0.2)  
**Oscillator 3:** (default: sine, 240Hz, +8 cents, 0.25)

**Noise:**
| Parameter | Control | Range | Default |
|-----------|---------|-------|---------|
| Noise Type | Segmented | white / pink | pink |
| Noise Gain | Slider | 0.0–1.0 | 0.15 |
| Noise Filter Freq | Slider | 50–8000 Hz | 800 |
| Noise Filter Type | Segmented | lowpass / bandpass / highpass | bandpass |

### Tab 4: EVT (Events)

Gameplay event simulation buttons.

```
┌─────────────────────────────────────┐
│  SIMULATE GAMEPLAY EVENTS           │
│                                     │
│  [🌀 New Game]  [🔮 Portal]        │
│  [⚠️ Danger]    [✅ Pass]           │
│  [💥 Collision] [💨 Near Miss]      │
│  [💀 Game Over]                     │
│                                     │
│  ───────────────────────────────    │
│                                     │
│  CONTINUOUS STATES                  │
│                                     │
│  Progress          ████████░░  80%  │
│  Proximity         ████░░░░░░  40%  │
│  Danger            █░░░░░░░░░  10%  │
│                                     │
└─────────────────────────────────────┘
```

**Event buttons:** 2-column grid, 48px height each  
**State sliders:** Same touch slider component  
**Feedback:** Brief visual pulse on button tap + haptic

### Tab 5: PRST (Presets)

Preset management interface.

```
┌─────────────────────────────────────┐
│  PRESETS                            │
│                                     │
│  ┌─────────────────────────────┐   │
│  │  💾 Save Current State      │   │
│  │  [name input]  [SAVE]       │   │
│  └─────────────────────────────┘   │
│                                     │
│  SAVED PRESETS                      │
│  ┌─────────────────────────────┐   │
│  │  Dark Machine       [LOAD]  │   │
│  │  Echo Chamber       [LOAD]  │   │
│  │  Unstable Signal    [LOAD]  │   │
│  └─────────────────────────────┘   │
│                                     │
│  BUILT-IN PRESETS                   │
│  ┌─────────────────────────────┐   │
│  │  Deep Drone         [LOAD]  │   │
│  │  Tension Builder    [LOAD]  │   │
│  │  Serene Void        [LOAD]  │   │
│  └─────────────────────────────┘   │
│                                     │
│  ───────────────────────────────    │
│  [📤 Export]  [📥 Import]  [🔗]   │
│  ───────────────────────────────    │
│                                     │
└─────────────────────────────────────┘
```

**Export:** Downloads JSON file  
**Import:** File picker → parse JSON → confirm → load  
**Share link:** Copies URL with preset data in hash

---

## 7. Interaction Patterns

### 7.1 Audio Unlock

On first user interaction (tap anywhere):
1. Display overlay: "Tap to enable audio"
2. On tap: create AudioContext, resume, dismiss overlay
3. Subsequent taps: no action needed

### 7.2 Parameter Adjustment

1. Touch and drag slider
2. Value updates in real-time
3. Engine parameter updates in real-time (via `setParam()`)
4. Haptic feedback every 50ms during drag (if supported)

### 7.3 Event Trigger

1. Tap event button
2. Button briefly flashes accent color
3. Engine event triggered
4. Visualizer responds (if audio changes)

### 7.4 Preset Save

1. Tap "Save Current State"
2. Input field appears (focused, keyboard open)
3. Type name, tap Save
4. Preset added to list, confirmation toast shown

### 7.5 Preset Load

1. Tap Load on a preset
2. All sliders animate to preset values (500ms transition)
3. Engine parameters update
4. Confirmation toast shown

---

## 8. Responsive Breakpoints

| Breakpoint | Layout | Target |
|-----------|--------|--------|
| < 640px | Mobile portrait (default) | Phones |
| 640–1024px | Tablet — 2-column controls | Tablets |
| > 1024px | Desktop — 3-column + wider visualizer | Desktop |

### Mobile (default)
- Single column
- Bottom tab navigation
- Full-width controls
- 100vh height, no page scroll (inner scroll for controls)

### Tablet
- Two-column parameter layout
- Tab navigation moves to left sidebar
- Visualizer spans full width

### Desktop
- Three-column layout
- Left: navigation, Center: visualizer + primary controls, Right: detail controls
- Keyboard shortcuts for common actions

---

## 9. Accessibility

| Requirement | Implementation |
|------------|----------------|
| Touch targets | Minimum 44×44px |
| Contrast | All text ≥ 4.5:1 contrast ratio |
| Screen reader | ARIA labels on all controls |
| Focus | Visible focus indicators (accent outline) |
| Reduced motion | Disable visualizer animation, slider transitions |
| Keyboard | All controls navigable and operable |

---

## 10. PWA Configuration

```json
{
  "name": "Echo Engine Sound Lab",
  "short_name": "Echo Lab",
  "start_url": "/lab/",
  "display": "standalone",
  "background_color": "#0a0a0f",
  "theme_color": "#ff8c00",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

Service worker caches:
- index.html
- lab.css
- All JS modules
- Default presets

---

## 11. Visual Hierarchy Summary

```
Priority 1 (always visible):   Visualizer, Play/Stop, Tab nav
Priority 2 (always accessible): Master volume, atmosphere macros
Priority 3 (per tab):          Detailed parameter controls
Priority 4 (tab):              Preset management
```
