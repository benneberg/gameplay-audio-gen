export interface SeededRNG {
  next(): number;
  nextRange(min: number, max: number): number;
  nextInt(min: number, max: number): number;
  reset(newSeed?: number): void;
  getSeed(): number;
}

/**
 * Mulberry32 deterministic PRNG.
 * Produces repeatable floats in [0.0, 1.0) from a 32-bit integer seed.
 */
export function createRNG(seed: number): SeededRNG {
  let initialSeed = seed | 0;
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
        initialSeed = newSeed | 0;
      }
      state = initialSeed;
    },
    getSeed(): number {
      return initialSeed >>> 0;
    },
  };
}
