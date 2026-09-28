/**
 * Seeded randomness. Every simulation carries a seed so its record re-runs to the same result
 * (SCORE.md, rule 7).
 */
export type Rng = () => number;

/** mulberry32: a small, fast generator with a full 2^32 period; uniform in [0, 1). */
export function rng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal, by Box–Muller. */
export function gaussian(random: Rng): number {
  const u = Math.max(random(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
}

/** Weibull with unit scale: the strength spread of a brittle material's flaws. */
export function weibull(random: Rng, modulus: number): number {
  return Math.pow(-Math.log(Math.max(1 - random(), 1e-12)), 1 / modulus);
}
