// Checks tools/fe.ts against shapes with known answers, before it is trusted with the bowl:
//   a free ring of square section, against thin-ring theory, in and out of its plane;
//   a free circular plate through the axis, against Kirchhoff's plate, whose frequencies are
//   found here from the free edge's Bessel-function equation, itself checked against Leissa.
//
//   node yaobian/tools/fe-check.ts

import { modes, raster, type Material } from './fe.ts';

const report = (label: string, fe: number, theory: number) => {
  const err = (fe / theory - 1) * 100;
  console.log(`  ${label.padEnd(34)} FE ${fe.toFixed(1).padStart(9)} Hz   theory ${theory.toFixed(1).padStart(9)} Hz   ${err >= 0 ? '+' : ''}${err.toFixed(2)} %`);
  return Math.abs(err);
};
let worst = 0;

// The ring: mean radius R, square section t × t.
{
  const R = 0.07, t = 0.0035, cells = 12, h = t / cells;
  const steel: Material = { E: 60e9, nu: 0.2, rho: 2350 };
  const g = raster(h, [{ outline: [[R - t / 2, 0], [R + t / 2, 0], [R + t / 2, t], [R - t / 2, t]], material: 0 }], [steel]);
  const base = Math.sqrt((steel.E * t * t) / (12 * steel.rho * R ** 4)) / (2 * Math.PI);
  const G = steel.E / (2 * (1 + steel.nu)), EIoverGJ = (steel.E * t ** 4 / 12) / (G * 0.1406 * t ** 4);
  console.log(`ring, R ${R * 1000} mm, section ${t * 1000} mm square, ${cells} cells across:`);
  for (const n of [2, 3, 4, 5]) {
    const found = modes(g, n, 3).map((m) => m.f);
    const inPlane = base * (n * (n * n - 1)) / Math.sqrt(n * n + 1);
    const outOfPlane = base * (n * (n * n - 1)) / Math.sqrt(n * n + EIoverGJ);
    // The two lowest of each harmonic are the two bendings; which is which, the theory's order says.
    const [a, b] = found.slice(0, 2);
    const [lo, hi] = inPlane < outOfPlane ? [inPlane, outOfPlane] : [outOfPlane, inPlane];
    worst = Math.max(worst, report(`n ${n}, ${inPlane < outOfPlane ? 'in plane' : 'out of plane'}`, a, lo), report(`n ${n}, ${inPlane < outOfPlane ? 'out of plane' : 'in plane'}`, b, hi));
  }
}

// Bessel functions by their series, and the free plate's frequency equation.
const fact = (k: number) => { let f = 1; for (let i = 2; i <= k; i++) f *= i; return f; };
const J = (n: number, x: number): number => { if (n < 0) return (n % 2 ? -1 : 1) * J(-n, x); let s = 0; for (let k = 0; k < 40; k++) s += ((k % 2 ? -1 : 1) * (x / 2) ** (2 * k + n)) / (fact(k) * fact(k + n)); return s; };
const I = (n: number, x: number) => { n = Math.abs(n); let s = 0; for (let k = 0; k < 40; k++) s += (x / 2) ** (2 * k + n) / (fact(k) * fact(k + n)); return s; };
const dJ = (n: number, x: number) => (J(n - 1, x) - J(n + 1, x)) / 2;
const dI = (n: number, x: number) => (I(n - 1, x) + I(n + 1, x)) / 2;
/** Leissa's free-edge equation for a circular plate, as a difference that is zero at a root λ. */
function freeEdge(n: number, x: number, nu: number): number {
  const a = x * x * J(n, x) + (1 - nu) * (x * dJ(n, x) - n * n * J(n, x));
  const b = x * x * I(n, x) - (1 - nu) * (x * dI(n, x) - n * n * I(n, x));
  const c = x ** 3 * dJ(n, x) + (1 - nu) * n * n * (x * dJ(n, x) - J(n, x));
  const d = x ** 3 * dI(n, x) - (1 - nu) * n * n * (x * dI(n, x) - I(n, x));
  return a * d - b * c;
}
function roots(n: number, nu: number, count: number): number[] {
  const out: number[] = [];
  let x = 0.5, prev = freeEdge(n, x, nu);
  while (out.length < count && x < 14) {
    const next = x + 0.01, v = freeEdge(n, next, nu);
    if (Math.sign(v) !== Math.sign(prev)) {
      let lo = x, hi = next;
      for (let it = 0; it < 80; it++) { const mid = (lo + hi) / 2; if (Math.sign(freeEdge(n, mid, nu)) === Math.sign(freeEdge(n, lo, nu))) lo = mid; else hi = mid; }
      const root = (lo + hi) / 2;
      if (!(n === 0 && root < 1) && !(n === 1 && root < 1)) out.push(root); // rigid motions
    }
    x = next; prev = v;
  }
  return out;
}
{
  // Leissa, Vibration of Plates (1969), table 2.3, ν = 0.33: λ² = 5.253 (2, 0), 9.084 (0, 1), 12.23 (3, 0), 20.52 (1, 1).
  const nu = 0.33;
  console.log('\nthe free-edge equation against Leissa (ν 0.33), λ²:');
  const table: [number, number, number][] = [[2, 0, 5.253], [0, 0, 9.084], [3, 0, 12.23], [1, 0, 20.52]];
  for (const [n, s, leissa] of table) {
    const l2 = roots(n, nu, s + 1)[s] ** 2;
    console.log(`  n ${n}: ${l2.toFixed(3)} against ${leissa}  (${((l2 / leissa - 1) * 100).toFixed(2)} %)`);
  }
  // The plate: radius a, thickness t, through the axis.
  const a = 0.05, t = 0.002, h = t / 8;
  const m: Material = { E: 60e9, nu, rho: 2350 };
  const g = raster(h, [{ outline: [[0, 0], [a, 0], [a, t], [0, t]], material: 0 }], [m]);
  const D = (m.E * t ** 3) / (12 * (1 - nu * nu));
  const scale = Math.sqrt(D / (m.rho * t)) / (a * a) / (2 * Math.PI);
  console.log(`\nfree plate, radius ${a * 1000} mm, ${t * 1000} mm thick, ${t / h} cells through it, against Kirchhoff:`);
  for (const [n, k] of [[0, 0], [1, 0], [2, 0], [3, 0], [2, 1]] as [number, number][]) {
    const theory = roots(n, nu, k + 1)[k] ** 2 * scale;
    const found = modes(g, n, 4).map((mm) => mm.f);
    const near = found.reduce((x, y) => (Math.abs(y - theory) < Math.abs(x - theory) ? y : x));
    worst = Math.max(worst, report(`n ${n}, ${k} nodal circle${k === 1 ? '' : 's'} beyond the least`, near, theory));
  }
}
console.log(`\nworst ${worst.toFixed(2)} %: ${worst <= 2 ? 'within' : 'OUTSIDE'} the 2 % the plan asks`);

// Bowls against a recording: the same solver on bowls shaped as kitchen bowls are, spherical caps of
// uniform wall, beside a kitchen bowl recorded ringing free (tools/sound-references.ts): 821 Hz,
// 1 : 2.36 : 4.18. Its shape was not recorded, so this is a range, not a match.
{
  console.log('\nbowls shaped as kitchen bowls, beside one recorded ringing free (821 Hz, 1 : 2.36 : 4.18):');
  const m: Material = { E: 60e9, nu: 0.2, rho: 2350 };
  for (const [label, R, t, deg] of [['a hemisphere, 4 mm', 0.07, 0.004, 90], ['a cap of 60°, 4 mm', 0.09, 0.004, 60], ['a cap of 45°, 3.5 mm', 0.11, 0.0035, 45]] as [string, number, number, number][]) {
    const a = (deg * Math.PI) / 180, pts: [number, number][] = [];
    for (let i = 0; i <= 120; i++) { const q = (a * i) / 120; pts.push([(R + t) * Math.sin(q), R - (R + t) * Math.cos(q)]); }
    for (let i = 120; i >= 0; i--) { const q = (a * i) / 120; pts.push([R * Math.sin(q), R - R * Math.cos(q)]); }
    const g = raster(t / 10, [{ outline: pts, material: 0 }], [m]);
    const f = [2, 3, 4].map((n) => modes(g, n, 1)[0].f);
    console.log(`  ${label.padEnd(24)} lowest ${f[0].toFixed(0)} Hz   1 : ${(f[1] / f[0]).toFixed(2)} : ${(f[2] / f[0]).toFixed(2)}`);
  }
}
