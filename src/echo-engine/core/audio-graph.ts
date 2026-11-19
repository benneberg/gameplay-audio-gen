import type { NoiseType } from '../types';
import type { SeededRNG } from './rng';

export interface AudioGraphNodes {
  osc1: OscillatorNode;
  osc2: OscillatorNode;
  osc3: OscillatorNode;
  osc1Gain: GainNode;
  osc2Gain: GainNode;
  osc3Gain: GainNode;
  noise: AudioBufferSourceNode;
  noiseFilter: BiquadFilterNode;
  noiseGain: GainNode;
  filter: BiquadFilterNode;
  postGain: GainNode;
  delay: DelayNode;
  delayFeedback: GainNode;
  delayMix: GainNode;
  reverb: ConvolverNode;
  reverbMix: GainNode;
  panner: StereoPannerNode;
  masterGain: GainNode;
  analyser: AnalyserNode | null;
  lfo1: OscillatorNode;
  lfo1Depth: GainNode;
  lfo2: OscillatorNode;
  lfo2Depth: GainNode;
  lfo3: OscillatorNode;
  lfo3Depth: GainNode;
}

export function generateNoiseBuffer(
  ctx: AudioContext,
  type: NoiseType,
  duration = 4,
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

export function generateReverbIR(
  ctx: AudioContext,
  decay = 2.5,
  channels = 2,
  rng?: SeededRNG
): AudioBuffer {
  const safeDecay = Math.max(0.2, Math.min(8.0, decay));
  const length = Math.max(1, Math.floor(ctx.sampleRate * safeDecay));
  const buffer = ctx.createBuffer(channels, length, ctx.sampleRate);
  const rand = rng ? () => rng.next() : () => Math.random();

  for (let ch = 0; ch < channels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (rand() * 2 - 1) * Math.pow(1 - i / length, safeDecay);
    }
  }
  return buffer;
}

export function buildAudioGraph(
  ctx: AudioContext,
  analyserEnabled = true,
  rng?: SeededRNG
): AudioGraphNodes {
  const osc1 = ctx.createOscillator();
  osc1.type = 'sawtooth';
  osc1.frequency.value = 120;

  const osc2 = ctx.createOscillator();
  osc2.type = 'triangle';
  osc2.frequency.value = 180;
  osc2.detune.value = -5;

  const osc3 = ctx.createOscillator();
  osc3.type = 'sine';
  osc3.frequency.value = 240;
  osc3.detune.value = 8;

  const osc1Gain = ctx.createGain();
  osc1Gain.gain.value = 0.3;

  const osc2Gain = ctx.createGain();
  osc2Gain.gain.value = 0.2;

  const osc3Gain = ctx.createGain();
  osc3Gain.gain.value = 0.25;

  const noise = ctx.createBufferSource();
  noise.buffer = generateNoiseBuffer(ctx, 'pink', 4, rng);
  noise.loop = true;

  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'bandpass';
  noiseFilter.frequency.value = 800;

  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0.15;

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1200;
  filter.Q.value = 8;

  const postGain = ctx.createGain();
  postGain.gain.value = 1.0;

  const delay = ctx.createDelay(2.0);
  delay.delayTime.value = 0.3;

  const delayFeedback = ctx.createGain();
  delayFeedback.gain.value = 0.4;

  const delayMix = ctx.createGain();
  delayMix.gain.value = 0.3;

  const reverb = ctx.createConvolver();
  reverb.buffer = generateReverbIR(ctx, 2.5, 2, rng);

  const reverbMix = ctx.createGain();
  reverbMix.gain.value = 0.2;

  const panner = ctx.createStereoPanner();
  panner.pan.value = 0;

  const masterGain = ctx.createGain();
  masterGain.gain.value = 0.7;

  const analyser = analyserEnabled ? ctx.createAnalyser() : null;
  if (analyser) {
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.82;
  }

  const lfo1 = ctx.createOscillator();
  lfo1.type = 'sine';
  lfo1.frequency.value = 0.1;
  const lfo1Depth = ctx.createGain();
  lfo1Depth.gain.value = 20;

  const lfo2 = ctx.createOscillator();
  lfo2.type = 'triangle';
  lfo2.frequency.value = 0.05;
  const lfo2Depth = ctx.createGain();
  lfo2Depth.gain.value = 500;

  const lfo3 = ctx.createOscillator();
  lfo3.type = 'sine';
  lfo3.frequency.value = 0.02;
  const lfo3Depth = ctx.createGain();
  lfo3Depth.gain.value = 0.8;

  // === Connections ===
  osc1.connect(osc1Gain);
  osc2.connect(osc2Gain);
  osc3.connect(osc3Gain);
  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);

  osc1Gain.connect(filter);
  osc2Gain.connect(filter);
  osc3Gain.connect(filter);
  noiseGain.connect(filter);

  filter.connect(postGain);

  // Dry signal -> panner
  postGain.connect(panner);

  // Delay feedback loop -> delayMix -> panner & reverb
  postGain.connect(delay);
  delay.connect(delayFeedback);
  delayFeedback.connect(delay);
  delay.connect(delayMix);
  delayMix.connect(panner);
  delayMix.connect(reverb);

  // Direct + delay signal -> reverb -> reverbMix -> panner
  postGain.connect(reverb);
  reverb.connect(reverbMix);
  reverbMix.connect(panner);

  // Panner -> master -> (analyser ->) destination
  panner.connect(masterGain);
  if (analyser) {
    masterGain.connect(analyser);
    analyser.connect(ctx.destination);
  } else {
    masterGain.connect(ctx.destination);
  }

  // LFO default routing
  lfo1.connect(lfo1Depth);
  lfo2.connect(lfo2Depth);
  lfo3.connect(lfo3Depth);

  lfo1Depth.connect(osc1.frequency);
  lfo2Depth.connect(filter.frequency);
  lfo3Depth.connect(panner.pan);

  // Start continuous audio nodes
  osc1.start();
  osc2.start();
  osc3.start();
  noise.start();
  lfo1.start();
  lfo2.start();
  lfo3.start();

  return {
    osc1,
    osc2,
    osc3,
    osc1Gain,
    osc2Gain,
    osc3Gain,
    noise,
    noiseFilter,
    noiseGain,
    filter,
    postGain,
    delay,
    delayFeedback,
    delayMix,
    reverb,
    reverbMix,
    panner,
    masterGain,
    analyser,
    lfo1,
    lfo1Depth,
    lfo2,
    lfo2Depth,
    lfo3,
    lfo3Depth,
  };
}
