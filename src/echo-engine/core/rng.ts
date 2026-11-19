export interface SeededRNG {
  next(): number;
  nextRange(min: number, max: number): number;
  nextInt(min: number, max: number): number;
  reset(newSeed?: number): void;
  getSeed(): number;
}

export type StreamName = 'buffers' | 'identity' | 'walk' | 'events' | 'texture';

export interface SeededStreams {
  readonly baseSeed: number;
  readonly buffers: SeededRNG;
  readonly identity: SeededRNG;
  readonly walk: SeededRNG;
  readonly events: SeededRNG;
  readonly texture: SeededRNG;
  resetAll(newSeed?: number): void;
}

/**
 * FNV-1a style string hash to derive independent 32-bit seeds per stream.
 */
function deriveStreamSeed(baseSeed: number, tag: StreamName): number {
  let h = (2166136261 ^ (baseSeed | 0)) >>> 0;
  for (let i = 0; i < tag.length; i++) {
    h ^= tag.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  // Mix bits with Murmur finalizer so sequential tags diverge completely
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h || 1;
}

/**
 * Mulberry32 deterministic PRNG.
 * Produces repeatable floats in [0.0, 1.0) from a 32-bit integer seed.
 */
export function createRNG(seed: number): SeededRNG {
  let initialSeed = (seed | 0) || 1;
  let state = initialSeed;

  return {
    next(): number {
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    nextRange(min: number, max: number): number {
      return min + this.next() * (max - min);
    },
    nextInt(min: number, max: number): number {
      return Math.floor(this.nextRange(min, max + 1));
    },
    reset(newSeed?: number): void {
      if (newSeed !== undefined) {
        initialSeed = (newSeed | 0) || 1;
      }
      state = initialSeed;
    },
    getSeed(): number {
      return initialSeed >>> 0;
    },
  };
}

/**
 * Creates independent deterministic RNG streams from one session seed so
 * procedural buffer/IR generation never perturbs random-walk trajectories
 * or event variations.
 */
export function createSeededStreams(baseSeed: number): SeededStreams {
  let currentBase = Math.floor(Math.abs(baseSeed)) || 1;

  const buffers = createRNG(deriveStreamSeed(currentBase, 'buffers'));
  const identity = createRNG(deriveStreamSeed(currentBase, 'identity'));
  const walk = createRNG(deriveStreamSeed(currentBase, 'walk'));
  const events = createRNG(deriveStreamSeed(currentBase, 'events'));
  const texture = createRNG(deriveStreamSeed(currentBase, 'texture'));

  return {
    get baseSeed() {
      return currentBase;
    },
    buffers,
    identity,
    walk,
    events,
    texture,
    resetAll(newSeed?: number): void {
      if (newSeed !== undefined) {
        currentBase = Math.floor(Math.abs(newSeed)) || 1;
      }
      buffers.reset(deriveStreamSeed(currentBase, 'buffers'));
      identity.reset(deriveStreamSeed(currentBase, 'identity'));
      walk.reset(deriveStreamSeed(currentBase, 'walk'));
      events.reset(deriveStreamSeed(currentBase, 'events'));
      texture.reset(deriveStreamSeed(currentBase, 'texture'));
    },
  };
}
