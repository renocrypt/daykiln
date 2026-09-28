// The bowl's ring (the sound plan, .agents/plans/sound.md, §6.1): its own modes, computed from its
// profile by finite elements (tools/bowl-modes.ts, src/kiln/modes.json); how a crack running in its
// glaze strikes them, by the work its released tension does on each mode's strain (a model, labeled),
// and how a knock does; and which of the cooling's cracks are heard. Pure: the piece's voice
// (voice.ts) and tools/levels.ts both strike the bowl through it.

import { rng } from '../core/rng.ts';
import { at, profile, thickness, type Side } from './bowl.ts';
import type { Crack } from './fracture.ts';
import computed from './modes.json' with { type: 'json' };
import { coolingClock, type CoolingClock } from './schedule.ts';

/**
 * Along one glaze surface, 1 mm apart from the pole (tools/bowl-modes.ts): the normal displacement at
 * the glaze's interface; the strains in the surface there, around the bowl, along its meridian, and
 * their shear; and each strain's gradient outward, per mm.
 */
type Along = { w: number[]; hoop: number[]; hoopOut: number[]; meridian: number[]; meridianOut: number[]; shear: number[]; shearOut: number[] };
/** One of the bowl's modes, as heard: its frequency at this dip, how its pair splits, and its shapes. */
export type Mode = { n: number; k: number; f: number; split: number; phase: number; sigma: number; inside: Along; outside: Along; dried: number };

const profiles = { inside: profile('inside'), outside: profile('outside') };

/**
 * Loss factor. Fired: a bowl resting on a shelf or a
 * table, not ringing free; recordings measure 0.0007–0.0009 for one ringing free, 0.002–0.005 for one
 * held or resting (tools/sound-references.ts). While the glaze is still hot enough to craze it is
 * lossier, glass nearing its set point: an assumption, its size and shape unmeasured, rising from the
 * resting bowl's to twice that at 560 °C, where the glaze sets.
 */
export const LOSS = { resting: 0.003 };
export const lossAt = (celsius: number) => LOSS.resting * (1 + Math.min(1, Math.max(0, celsius / 560)) ** 3);

/**
 * The bowl's modes at a dip (the glaze's thickness as a multiple of the lab's bowl): the glaze is
 * glass bonded to the wall, stiffening it, so the frequencies rise with the dip, interpolated between
 * the three computed. Each pair of a harmonic n ≥ 1 is split a little, as no bowl is quite round,
 * the split and its orientation drawn from the firing's seed.
 */
export function bowlModes(dip: number, seed: number): Mode[] {
  const random = rng(seed * 7 + 3);
  return computed.modes.map((c) => {
    const shift = dip < 1 ? 1 + ((c.thin - 1) * (1 - dip)) / 0.45 : 1 + ((c.thick - 1) * (dip - 1)) / 0.45;
    return {
      n: c.n, k: c.k, f: c.f * shift, sigma: c.radiation, inside: c.inside as Along, outside: c.outside as Along, dried: c.dried,
      split: c.n ? 0.001 + 0.003 * random() : 0, phase: c.n ? (random() * Math.PI * 2) / c.n : 0,
    };
  });
}


/**
 * A resonator bank for the modal processor: each mode as a pair, a hair apart, for its two
 * orientations; gains, the square root of how well each reaches the air (a sphere's mode of the same
 * order, at the rim's radius: an approximation; for dried clay taken at the fired frequency).
 */
export function bank(modes: Mode[], loss: number) {
  const frequencies: number[] = [], dampings: number[] = [], gains: number[] = [];
  for (const m of modes) for (const side of [-1, 1]) {
    frequencies.push(m.f * (1 + (side * m.split) / 2));
    dampings.push(loss / 2);
    gains.push(Math.sqrt(m.sigma));
  }
  return { type: 'modes', frequencies, dampings, gains };
}

const lerp = (a: number[], s: number) => { const i = Math.min(a.length - 2, Math.max(0, Math.floor(s))), u = s - i; return a[i] + (a[i + 1] - a[i]) * u; };

/** A piece of a crack, 1 mm or less: where, which way it runs (ψ from the meridian toward +φ), how long and in what glaze, mm. */
export type Piece = { side: Side; s: number; phi: number; psi: number; length: number; h: number };

/**
 * How hard a crack strikes each mode: a model, labeled. When a crack opens, the glaze's tension across
 * it is released over a strip each side as wide as the shear-lag length, ℓ = shearLag · h
 * (fracture.ts). The tension that runs a crack through glaze h goes as 1/√h (fracture.ts), so the force
 * released per length, σh, goes as √h, and the strip's width as h: the work it does on a mode, its
 * generalized force, goes as h^3/2 × length × the mode's strain normal to the crack, at the glaze's
 * mid-plane (the strain at the interface, moved out by its gradient over h/2):
 *   ε_nn = sin²ψ ε_ss + cos²ψ ε_θθ − sinψ cosψ γ_sθ,
 * the normal strains going as cos nφ around the bowl and the shear as sin nφ. Summed over the crack's
 * pieces, each at its own place, way and glaze, signs kept. A sudden release rings a mode with velocity
 * Q/ω, and the sound radiated follows the velocity, so each resonator is struck with Q/ω, its sine
 * starting at rest as a velocity does. The release is taken as a step, a ping's every piece at once:
 * an assumption. A brittle crack runs millimetres in microseconds; at 1,000 m/s, a speed assumed, not
 * measured for this glaze, a 25 mm run releases over 25 µs, which would take 0.6 dB off 8 kHz and 2.4
 * off 16 kHz. Two amplitudes a mode, one per orientation.
 */
export function strike(modes: Mode[], pieces: Piece[]): number[] {
  const out = new Array<number>(modes.length * 2).fill(0);
  for (const p of pieces) {
    const i = p.s, sin = Math.sin(p.psi), cos = Math.cos(p.psi), weight = p.h ** 1.5 * p.length;
    modes.forEach((m, k) => {
      const a = m[p.side];
      const mid = (e: number[], g: number[]) => lerp(e, i) + lerp(g, i) * (p.h / 2);
      const N = sin * sin * mid(a.meridian, a.meridianOut) + cos * cos * mid(a.hoop, a.hoopOut);
      const S = sin * cos * mid(a.shear, a.shearOut);
      const c = Math.cos(m.n * (p.phi - m.phase)), s = Math.sin(m.n * (p.phi - m.phase));
      const scale = weight / (2 * Math.PI * m.f);
      out[k * 2] += (N * c - S * s) * scale;
      out[k * 2 + 1] += (N * s + S * c) * scale;
    });
  }
  return out;
}

/** The reference: a first crack, 5 mm up the well's floor in its glaze, as heard, before level. */
export function referenceOf(modes: Mode[]): number {
  const first: Piece = { side: 'inside', s: 15, phi: 0, psi: 0, length: 5, h: thickness(profiles.inside, 15, 0) };
  return Math.hypot(...strike(modes, [first]).map((v, j) => v * Math.sqrt(modes[j >> 1].sigma)));
}

// Pings ------------------------------------------------------------------------------------------------

/** What is heard of the crackle: a crack running, at the tension it opens at, struck on the modes. */
export type Ping = {
  /** The tension it opens at; the index of its crack among its surface's; its surface; its runs' length, mm. */
  load: number; crack: number; side: Side; length: number;
  amplitudes: number[]; loud: number;
  /** When it falls in the cooling as shown, s after the kiln opens; and whether it is among those heard. */
  at: number; heard: boolean;
};
/** A crack's runs whose tension is this close to its earliest's, as a fraction of the final, are one crack running: a sound-design heuristic. */
export const MERGE = 0.002;
/** A ping whose runs add to less than this, mm, is a tip edging on, not a crack running: silent. A heuristic. */
export const RUN = 1;
/** Pings heard in any 50 ms, at most, the loudest: a sound-design heuristic; beyond, the ear hears a texture. */
export const DENSITY = 4;

type Run = { load: number; pieces: Piece[]; length: number };

/** Tensions this close, as a fraction of the final, are one: the grain a crack's stretches are read at. */
const GRAIN = 1e-4;
/** mm: the longest piece a run is struck in. */
const PIECE = 1;

/**
 * A crack's runs, each the stretch that cracked at one tension, cut into equal pieces of at most
 * 1 mm. The fracture model joins a crack's two tips end to end, its tensions falling toward the flaw it
 * opened at and rising along the other tip, so the polyline's order is not the order in time: the runs
 * are taken out first, as the stretches whose tensions round to one grain, and cut into equal pieces,
 * so which way the polyline is walked changes nothing. Each piece keeps its place, its way (the chart
 * is exact along the profile and stretched r/s around it; a way and its reverse strike alike), its
 * true length, and the glaze there.
 */
export function runsOf(crack: Crack, side: Side, dip: number): Run[] {
  const p = profiles[side], P = crack.points, L = crack.pointLoads, count = P.length / 2;
  const load = (j: number) => Math.max(L[j - 1], L[j]);
  const runs: Run[] = [];
  let j = 1;
  while (j < count) {
    const key = Math.round(load(j) / GRAIN);
    // The run's stretches: each its ends in the chart, its steps along and around, its length.
    const segments: { x0: number; y0: number; x1: number; y1: number; ds: number; dt: number; l: number }[] = [];
    let most = 0, total = 0;
    for (; j < count && Math.round(load(j) / GRAIN) === key; j++) {
      const x0 = P[j * 2 - 2], y0 = P[j * 2 - 1], x1 = P[j * 2], y1 = P[j * 2 + 1];
      const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, s = Math.max(Math.hypot(mx, my), 1e-6);
      const k = at(p, p.r, s) / s;
      const ds = ((x1 - x0) * mx + (y1 - y0) * my) / s, dt = (((x1 - x0) * -my + (y1 - y0) * mx) / s) * k;
      const l = Math.hypot(ds, dt);
      segments.push({ x0, y0, x1, y1, ds, dt, l });
      most = Math.max(most, load(j));
      total += l;
    }
    if (total <= 0) continue;
    const run: Run = { load: most, pieces: [], length: total };
    const n = Math.max(1, Math.ceil(total / PIECE - 1e-9)), each = total / n;
    let piece = { l: 0, ds: 0, dt: 0, u: 0, v: 0 };
    const close = () => {
      const u = piece.u / piece.l, v = piece.v / piece.l, s = Math.hypot(u, v);
      let phi = Math.atan2(v, u);
      if (phi < 0) phi += Math.PI * 2;
      run.pieces.push({ side, s, phi, psi: Math.atan2(piece.dt, piece.ds), length: piece.l, h: dip * thickness(p, s, phi) });
      piece = { l: 0, ds: 0, dt: 0, u: 0, v: 0 };
    };
    for (const g of segments) {
      let from = 0; // how far along this stretch, as a fraction
      while (from < 1 - 1e-12) {
        const room = each - piece.l; // what the piece can still take, mm
        const to = run.pieces.length === n - 1 ? 1 : Math.min(1, from + room / Math.max(g.l, 1e-12));
        const f = to - from, l = g.l * f;
        const mx = g.x0 + (g.x1 - g.x0) * (from + f / 2), my = g.y0 + (g.y1 - g.y0) * (from + f / 2);
        // A piece keeps one way: its steps along the meridian taken with the piece's own.
        const flip = piece.l > 0 && g.ds * piece.ds + g.dt * piece.dt < 0 ? -1 : 1;
        piece.l += l; piece.ds += g.ds * f * flip; piece.dt += g.dt * f * flip; piece.u += mx * l; piece.v += my * l;
        from = to;
        if (piece.l >= each * (1 - 1e-9) && run.pieces.length < n - 1) close();
      }
    }
    if (piece.l > 0) close();
    runs.push(run);
  }
  return runs;
}

/**
 * The pings of one surface's cracks: each crack's runs in the order of the tension they crack at, and
 * gathered from its earliest, those within `MERGE` of it one crack running; creep that adds to less
 * than `RUN` dropped. Each is struck on the modes, every piece of it at its own place. The heaviest
 * step of the crackle, so the piece runs it in each surface's fire worker (fire.worker.ts).
 */
export function pingsOf(cracks: Crack[], side: Side, dip: number, modes: Mode[]): Ping[] {
  const out: Ping[] = [];
  cracks.forEach((crack, index) => {
    const runs = runsOf(crack, side, dip).sort((a, b) => a.load - b.load);
    let i = 0;
    while (i < runs.length) {
      const load = runs[i].load, pieces: Piece[] = [];
      let length = 0;
      for (; i < runs.length && runs[i].load - load < MERGE; i++) { pieces.push(...runs[i].pieces); length += runs[i].length; }
      if (length < RUN) continue;
      const amplitudes = strike(modes, pieces);
      out.push({ load, crack: index, side, length, amplitudes, loud: Math.hypot(...amplitudes.map((v, j) => v * Math.sqrt(modes[j >> 1].sigma))), at: 0, heard: false });
    }
  });
  return out.sort((a, b) => a.load - b.load);
}

/**
 * Which pings are heard: placed in the cooling as the piece will show it, and the loudest by their
 * strike's norm kept, never more than `DENSITY` in any 50 ms, rolling. Chosen ahead of the cooling, so
 * the live piece and tools/levels.ts choose the same, and a loud crack is never crowded out by quiet ones that
 * happened to come first. The live voice holds the same rule again on the times it actually sends
 * (voice.ts), as a frame's timing can differ from the clock by a little.
 */
export function choose(pings: Ping[], clock: CoolingClock, density = DENSITY): void {
  for (const p of pings) { p.at = clock.at(p.load); p.heard = false; }
  const kept: number[] = []; // times, sorted
  for (const p of [...pings].sort((a, b) => b.loud - a.loud)) p.heard = admit(kept, p.at, density);
}

/**
 * Whether a ping at `time` may sound among those already sounding at `kept` (ascending, s): with it
 * in, every `density` + 1 of them in a row span 50 ms or more. If so it is added to `kept`.
 */
export function admit(kept: number[], time: number, density = DENSITY): boolean {
  let lo = 0, hi = kept.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (kept[mid] < time) lo = mid + 1; else hi = mid; }
  const times = [...kept.slice(Math.max(0, lo - density), lo), time, ...kept.slice(lo, lo + density)];
  for (let a = 0; a + density < times.length; a++) if (times[a + density] - times[a] < 0.05) return false;
  kept.splice(lo, 0, time);
  return true;
}

/** Both surfaces' pings, struck, in order of tension, and chosen on the cooling as the piece will show it. */
export function chosen(inside: Ping[], outside: Ping[], clock: CoolingClock, density = DENSITY): Ping[] {
  const pings = [...inside, ...outside].sort((a, b) => a.load - b.load);
  choose(pings, clock, density);
  return pings;
}

/** A firing's crackle, ready to be heard: both surfaces' pings struck here, and chosen. */
export function crackle(fired: { side: Side; cracks: Crack[] }[], dip: number, modes: Mode[], density = DENSITY): Ping[] {
  const inside = fired.find((f) => f.side === 'inside')!.cracks, outside = fired.find((f) => f.side === 'outside')?.cracks ?? [];
  return chosen(pingsOf(inside, 'inside', dip, modes), pingsOf(outside, 'outside', dip, modes), coolingClock(inside), density);
}
