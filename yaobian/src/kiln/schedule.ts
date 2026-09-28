// KILN's firing as the piece plays it: the schedule, compressed from hours to seconds; the pace the
// score slows it to once the kiln is open, so the first cracks can be seen; when a crack is seen; the
// glaze's tension as it cools. Shared by the piece, its
// voice, and tools/levels.ts, so the sound chosen ahead of the cooling is the sound the cooling plays.

import type { Crack } from './fracture.ts';

/**
 * The firing schedule: each step runs from the previous temperature to its own. The kiln opens after
 * the third step, still hot, dull red, the glaze a little above where it sets, and it goes on cooling,
 * and cracking, in the room.
 */
export const SCHEDULE = [
  { name: 'ramp', to: 1260, seconds: 7, shape: (u: number) => 0.5 - 0.5 * Math.cos(Math.PI * u) },
  { name: 'reduction', to: 1260, seconds: 3, shape: (u: number) => u },
  { name: 'cooling', to: 620, seconds: 4, shape: (u: number) => 1 - (1 - u) ** 1.6 },
  { name: 'cooling, the kiln open', to: 40, seconds: 13, shape: (u: number) => 1 - (1 - u) ** 1.5 },
] as const;
export const OPENS = SCHEDULE[0].seconds + SCHEDULE[1].seconds + SCHEDULE[2].seconds; // s into the firing
export const TOTAL = SCHEDULE.reduce((s, step) => s + step.seconds, 0);

const smoothstep = (x: number, a: number, b: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * How much the score slows the schedule once the kiln is open, by how many cracks have run: the
 * first are shown at a sixth of the firing's pace, so each can be seen to cross the glaze and stop,
 * and the pace returns as the network fills. The schedule is compressed from hours anyway; this
 * compresses the first cracks less. Before any crack runs, a little faster.
 */
export const pace = (run: number) => (run === 0 ? 0.6 : 0.16 + 0.6 * smoothstep(run, 4, 400));

/**
 * The tension at which a crack can be seen: when it has run 3 mm, or most of its length if it is
 * shorter. A crack starts at a flaw at a lower tension, a speck, and runs when the tension is enough
 * to carry it across the glaze; the count is of cracks seen, so the number grows as the picture does.
 */
export function seenAt(crack: Crack): number {
  const reach = Math.min(3, 0.8 * crack.length);
  const stretches: [number, number][] = [];
  for (let j = 1; j < crack.points.length / 2; j++) {
    const length = Math.hypot(crack.points[j * 2] - crack.points[j * 2 - 2], crack.points[j * 2 + 1] - crack.points[j * 2 - 1]);
    stretches.push([(crack.pointLoads[j - 1] + crack.pointLoads[j]) / 2, length]);
  }
  stretches.sort((a, b) => a[0] - b[0]);
  let run = 0;
  for (const [load, length] of stretches) if ((run += length) >= reach) return load;
  return 1;
}

export function temperatureAt(t: number): { celsius: number; step: string } {
  let from = 20, start = 0;
  for (const step of SCHEDULE) {
    if (t <= start + step.seconds) return { celsius: from + (step.to - from) * step.shape(Math.max(0, t - start) / step.seconds), step: step.name };
    from = step.to;
    start += step.seconds;
  }
  return { celsius: from, step: 'cold' };
}

/** The glaze's tension as it cools below where it sets: 0 none … 1 the model's final tension. */
export const tensionAt = (celsius: number, peaked: boolean) => (peaked ? Math.min(1, Math.max(0, (560 - celsius) / 520)) : 0);
/** The temperature at which the glaze reaches a tension. */
export const celsiusAtTension = (tension: number) => 560 - 520 * tension;

/** The cooling as the piece shows it, from the kiln's opening: the one time map the picture and the sound share. */
export type CoolingClock = {
  /** When the cooling reaches a tension: s of the piece's time after the kiln opens. */
  at(tension: number): number;
  /** Where the schedule is, s into it, `shown` s of the piece's time after the kiln opens. */
  kiln(shown: number): number;
};

/**
 * The cooling after the kiln opens, run forward at the score's pace from the cracks of the inside
 * that will be seen, once, at a fixed step. The piece reads its schedule from this while the kiln is
 * open, and the crackle's pings are placed and chosen on it, so what is chosen is what is shown.
 */
export function coolingClock(inside: Crack[]): CoolingClock {
  const seen = Float32Array.from(inside.map(seenAt)).sort();
  const dt = 1 / 240;
  const kilnT: number[] = [OPENS], tension: number[] = [0];
  let t = OPENS, cracked = 0;
  while (t < TOTAL) {
    t = Math.min(TOTAL, t + dt * pace(cracked));
    const now = tensionAt(temperatureAt(t).celsius, true);
    kilnT.push(t); tension.push(now);
    while (cracked < seen.length && seen[cracked] <= now) cracked++;
  }
  const last = tension.length - 1;
  return {
    at(x) {
      let lo = 0, hi = last;
      if (x >= tension[hi]) return hi * dt;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (tension[mid] < x) lo = mid; else hi = mid; }
      const u = tension[hi] > tension[lo] ? (x - tension[lo]) / (tension[hi] - tension[lo]) : 0;
      return (lo + u) * dt;
    },
    kiln(shown) {
      const i = Math.max(0, shown / dt);
      if (i >= last) return kilnT[last];
      const k = Math.floor(i);
      return kilnT[k] + (i - k) * (kilnT[k + 1] - kilnT[k]);
    },
  };
}

