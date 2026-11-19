import type { NoiseType } from '../types';
import type { SeededRNG } from './rng';

export interface AudioGraphNodes {
  osc1: OscillatorNode;
  osc2: OscillatorNode;
  osc3: OscillatorNode;
  subOsc: OscillatorNode;
  fmOsc: OscillatorNode;
  osc1Gain: GainNode;
  osc2Gain: GainNode;
  osc3Gain: GainNode;
  subGain: GainNode;
  fmGain: GainNode;
  fmFeedbackGain: GainNode;
  noise: AudioBufferSourceNode;
  noiseFilter: BiquadFilterNode;
  noiseGain: GainNode;
  formantFilter: BiquadFilterNode;
  formantGain: GainNode;
  filter: BiquadFilterNode;
  preFxBus: GainNode;
  ringOsc: OscillatorNode;
  ringModGain: GainNode;
  ringMix: GainNode;
  shepardOscs: OscillatorNode[];
  shepardGains: GainNode[];
  shepardBus: GainNode;
  keyBus: GainNode;
  postGain: GainNode;
  panner: StereoPannerNode;
  shaper: WaveShaperNode;
  delay: DelayNode;
  delayDamping: BiquadFilterNode;
  delayFeedback: GainNode;
  delayMix: GainNode;
  reverb: ConvolverNode;
  reverbMix: GainNode;
  compressor: DynamicsCompressorNode;
  masterGain: GainNode;
  analyser: AnalyserNode | null;
  lfo1: OscillatorNode;
  lfo1Depth: GainNode;
  lfo2: OscillatorNode;
  lfo2Depth: GainNode;
  lfo3: OscillatorNode;
  lfo3Depth: GainNode;
  whiteNoiseBuffer: AudioBuffer;
  brownNoiseBuffer: AudioBuffer;
}

export function buildTransferCurve(drive = 0.2, crush = 0): Float32Array<ArrayBuffer> {
  const samples = 2048;
  const curve = new Float32Array(samples);
  const k = 1 + Math.max(0, Math.min(1, drive)) * 10;
  const norm = Math.tanh(k) || 1;
  const safeCrush = Math.max(0, Math.min(1, crush));
  const levels = Math.max(2, Math.round(2 + 126 * Math.pow(1 - safeCrush, 2)));

  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / (samples - 1) - 1;
    const saturated = Math.tanh(k * x) / norm;
    curve[i] = safeCrush > 0.01 ? Math.round(saturated * levels) / levels : saturated;
  }
  return curve;
}

export function generateNoiseBuffer(
  ctx: AudioContext,
  type: NoiseType,
  duration = 5,
  rng?: SeededRNG
): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  const rand = rng ? () => rng.next() : () => Math.random();

  if (type === 'white') {
    for (let i = 0; i < length; i++) {
      data[i] = rand() * 2 - 1;
    }
  } else if (type === 'brown') {
    // Integrated leaky Brownian walk for deep subterranean rumble
    let lastOut = 0;
    for (let i = 0; i < length; i++) {
      const white = rand() * 2 - 1;
      lastOut = (lastOut + 0.024 * white) / 1.024;
      data[i] = Math.max(-1, Math.min(1, lastOut * 3.4));
    }
  } else {
    // Paul Kellet's refined pink noise algorithm
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    let b3 = 0;
    let b4 = 0;
    let b5 = 0;
    let b6 = 0;
    for (let i = 0; i < length; i++) {
      const white = rand() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }
  }
  return buffer;
}

/**
 * Generates a dark, 1-pole low-pass damped stereo cavern impulse response
 * entirely in code so reverb tails recede smoothly without harsh hiss.
 */
export function generateReverbIR(
  ctx: AudioContext,
  decay = 3.0,
  channels = 2,
  rng?: SeededRNG
): AudioBuffer {
  const safeDecay = Math.max(0.2, Math.min(8.0, decay));
  const length = Math.max(1, Math.floor(ctx.sampleRate * safeDecay));
  const buffer = ctx.createBuffer(channels, length, ctx.sampleRate);
  const rand = rng ? () => rng.next() : () => Math.random();

  for (let ch = 0; ch < channels; ch++) {
    const data = buffer.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < length; i++) {
      const env = Math.pow(1 - i / length, Math.max(1.8, safeDecay * 0.9));
      const white = (rand() * 2 - 1) * env;
      // Progressive low-pass damping for dark receding cavern acoustics
      lp = lp * 0.86 + white * 0.14;
      data[i] = lp * 1.75;
    }
  }
  return buffer;
}

export function buildAudioGraph(
  ctx: AudioContext,
  analyserEnabled = true,
  bufferRng?: SeededRNG
): AudioGraphNodes {
  // === Core Drone Oscillators + Sub + Cross-FM ===
  const osc1 = ctx.createOscillator();
  osc1.type = 'triangle';
  osc1.frequency.value = 55;

  const osc2 = ctx.createOscillator();
  osc2.type = 'sawtooth';
  osc2.frequency.value = 55;
  osc2.detune.value = -7;

  const osc3 = ctx.createOscillator();
  osc3.type = 'sine';
  osc3.frequency.value = 82.5;
  osc3.detune.value = 7;

  const subOsc = ctx.createOscillator();
  subOsc.type = 'sine';
  subOsc.frequency.value = 27.5;

  const fmOsc = ctx.createOscillator();
  fmOsc.type = 'sine';
  fmOsc.frequency.value = 77.5;

  const osc1Gain = ctx.createGain();
  osc1Gain.gain.value = 0.28;

  const osc2Gain = ctx.createGain();
  osc2Gain.gain.value = 0.22;

  const osc3Gain = ctx.createGain();
  osc3Gain.gain.value = 0.16;

  const subGain = ctx.createGain();
  subGain.gain.value = 0.32;

  const fmGain = ctx.createGain();
  fmGain.gain.value = 16;

  const fmFeedbackGain = ctx.createGain();
  fmFeedbackGain.gain.value = 0;

  // === Noise & Whisper Formant Path ===
  const whiteNoiseBuffer = generateNoiseBuffer(ctx, 'white', 4, bufferRng);
  const brownNoiseBuffer = generateNoiseBuffer(ctx, 'brown', 5, bufferRng);
  const initialNoiseBuffer = generateNoiseBuffer(ctx, 'brown', 5, bufferRng);

  const noise = ctx.createBufferSource();
  noise.buffer = initialNoiseBuffer;
  noise.loop = true;

  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'bandpass';
  noiseFilter.frequency.value = 540;
  noiseFilter.Q.value = 4.2;

  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0.18;

  const formantFilter = ctx.createBiquadFilter();
  formantFilter.type = 'bandpass';
  formantFilter.frequency.value = 650;
  formantFilter.Q.value = 8.0;

  const formantGain = ctx.createGain();
  formantGain.gain.value = 0.12;

  // === Main Drone Filter & Pre-FX Bus ===
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 340;
  filter.Q.value = 4.5;

  const preFxBus = ctx.createGain();
  preFxBus.gain.value = 1.0;

  // === Ring Modulator Branch ===
  const ringOsc = ctx.createOscillator();
  ringOsc.type = 'sine';
  ringOsc.frequency.value = 14;

  const ringModGain = ctx.createGain();
  ringModGain.gain.value = 0;

  const ringMix = ctx.createGain();
  ringMix.gain.value = 0;

  // === Shepard Infinity Ladder (6 octave-staggered sines) ===
  const shepardOscs: OscillatorNode[] = [];
  const shepardGains: GainNode[] = [];
  const shepardBus = ctx.createGain();
  shepardBus.gain.value = 0;

  for (let i = 0; i < 6; i++) {
    const so = ctx.createOscillator();
    so.type = 'sine';
    so.frequency.value = 90 * Math.pow(2, i - 2);
    const sg = ctx.createGain();
    sg.gain.value = 0.0001;
    so.connect(sg);
    sg.connect(shepardBus);
    shepardOscs.push(so);
    shepardGains.push(sg);
  }

  // === Keyboard / Piano Roll Bus ===
  const keyBus = ctx.createGain();
  keyBus.gain.value = 1.0;

  // === Post-Filter Spatial & Saturation Stages ===
  const postGain = ctx.createGain();
  postGain.gain.value = 1.0;

  const panner = ctx.createStereoPanner();
  panner.pan.value = 0;

  const shaper = ctx.createWaveShaper();
  shaper.curve = buildTransferCurve(0.22, 0);
  shaper.oversample = '2x';

  // === Dark Damped Delay Feedback Loop ===
  const delay = ctx.createDelay(2.5);
  delay.delayTime.value = 0.45;

  const delayDamping = ctx.createBiquadFilter();
  delayDamping.type = 'lowpass';
  delayDamping.frequency.value = 1250;
  delayDamping.Q.value = 0.7;

  const delayFeedback = ctx.createGain();
  delayFeedback.gain.value = 0.46;

  const delayMix = ctx.createGain();
  delayMix.gain.value = 0.34;

  // === Procedural Cavern Reverb ===
  const reverb = ctx.createConvolver();
  reverb.buffer = generateReverbIR(ctx, 3.2, 2, bufferRng);

  const reverbMix = ctx.createGain();
  reverbMix.gain.value = 0.42;

  // === Safety Dynamics Limiter, Master & Analyser ===
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -10;
  compressor.knee.value = 8;
  compressor.ratio.value = 12;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.2;

  const masterGain = ctx.createGain();
  masterGain.gain.value = 0.7;

  const analyser = analyserEnabled ? ctx.createAnalyser() : null;
  if (analyser) {
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.82;
  }

  // === 3 LFOs (timbral & spatial defaults — no slow siren frequency sweep) ===
  const lfo1 = ctx.createOscillator();
  lfo1.type = 'sine';
  lfo1.frequency.value = 0.07;
  const lfo1Depth = ctx.createGain();
  lfo1Depth.gain.value = 9; // subtle cents detune breathing by default

  const lfo2 = ctx.createOscillator();
  lfo2.type = 'triangle';
  lfo2.frequency.value = 0.04;
  const lfo2Depth = ctx.createGain();
  lfo2Depth.gain.value = 130; // gentle spectral sweep on filter cutoff

  const lfo3 = ctx.createOscillator();
  lfo3.type = 'sine';
  lfo3.frequency.value = 0.025;
  const lfo3Depth = ctx.createGain();
  lfo3Depth.gain.value = 0.45; // slow stereo drift

  // === Signal Connections ===
  // FM modulation -> osc1, osc2 & self-feedback
  fmOsc.connect(fmGain);
  fmGain.connect(osc1.frequency);
  fmGain.connect(osc2.frequency);
  fmOsc.connect(fmFeedbackGain);
  fmFeedbackGain.connect(fmOsc.frequency);

  // Oscillators -> Main Filter
  osc1.connect(osc1Gain);
  osc2.connect(osc2Gain);
  osc3.connect(osc3Gain);
  subOsc.connect(subGain);

  osc1Gain.connect(filter);
  osc2Gain.connect(filter);
  osc3Gain.connect(filter);
  subGain.connect(filter);

  // Noise -> noiseFilter -> noiseGain -> filter + parallel formantFilter -> formantGain -> preFxBus
  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(filter);

  noiseFilter.connect(formantFilter);
  formantFilter.connect(formantGain);
  formantGain.connect(preFxBus);

  // Main filter & Shepard -> preFxBus
  filter.connect(preFxBus);
  shepardBus.connect(preFxBus);

  // Ring modulation branch off preFxBus
  ringOsc.connect(ringModGain.gain);
  preFxBus.connect(ringModGain);
  ringModGain.connect(ringMix);

  // Sum preFx + ringMix + keyBus -> postGain -> panner -> waveshaper
  preFxBus.connect(postGain);
  ringMix.connect(postGain);
  keyBus.connect(postGain);
  postGain.connect(panner);
  panner.connect(shaper);

  // Dry path -> compressor
  shaper.connect(compressor);

  // Damped delay feedback loop -> delayMix -> compressor & reverb
  shaper.connect(delay);
  delay.connect(delayDamping);
  delayDamping.connect(delayFeedback);
  delayFeedback.connect(delay);
  delayDamping.connect(delayMix);
  delayMix.connect(compressor);
  delayMix.connect(reverb);

  // Cavern reverb -> reverbMix -> compressor
  shaper.connect(reverb);
  reverb.connect(reverbMix);
  reverbMix.connect(compressor);

  // Compressor -> masterGain -> (analyser ->) destination
  compressor.connect(masterGain);
  if (analyser) {
    masterGain.connect(analyser);
    analyser.connect(ctx.destination);
  } else {
    masterGain.connect(ctx.destination);
  }

  // Default non-siren LFO routing
  lfo1.connect(lfo1Depth);
  lfo2.connect(lfo2Depth);
  lfo3.connect(lfo3Depth);

  lfo1Depth.connect(osc1.detune);
  lfo2Depth.connect(filter.frequency);
  lfo3Depth.connect(panner.pan);

  // Start persistent audio nodes once
  osc1.start();
  osc2.start();
  osc3.start();
  subOsc.start();
  fmOsc.start();
  ringOsc.start();
  noise.start();
  shepardOscs.forEach((so) => so.start());
  lfo1.start();
  lfo2.start();
  lfo3.start();

  return {
    osc1,
    osc2,
    osc3,
    subOsc,
    fmOsc,
    osc1Gain,
    osc2Gain,
    osc3Gain,
    subGain,
    fmGain,
    fmFeedbackGain,
    noise,
    noiseFilter,
    noiseGain,
    formantFilter,
    formantGain,
    filter,
    preFxBus,
    ringOsc,
    ringModGain,
    ringMix,
    shepardOscs,
    shepardGains,
    shepardBus,
    keyBus,
    postGain,
    panner,
    shaper,
    delay,
    delayDamping,
    delayFeedback,
    delayMix,
    reverb,
    reverbMix,
    compressor,
    masterGain,
    analyser,
    lfo1,
    lfo1Depth,
    lfo2,
    lfo2Depth,
    lfo3,
    lfo3Depth,
    whiteNoiseBuffer,
    brownNoiseBuffer,
  };
}
