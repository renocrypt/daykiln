// KILN's bowl, rung: its modes computed by finite elements (tools/fe.ts, checked by fe-check.ts)
// from the profile the picture is lathed from (src/kiln/bowl.ts), for the sound of its crackle.
//
//   node yaobian/tools/bowl-modes.ts            writes src/kiln/modes.json
//   node yaobian/tools/bowl-modes.ts --converge  compares 0.3 mm pixels with 0.15 mm, and reports
//
// The section is the body, stoneware, between the outside and inside profiles, closed along the
// axis; over it the glaze, a layer of glass as thick as the dip laid it, averaged around the bowl
// (its variation around the bowl splits each pair of modes a little; that is left to the piece's
// seeded split). Fired: both as the kiln leaves them. Before the fire the body is dried clay, much
// softer and lossier, under a raw coat of glaze powder, weak but bonded to it.
//
// Materials are assumptions, labeled (the sound plan, §4): fired stoneware E 60 GPa, ν 0.2,
// 2,350 kg/m³; the glaze, a lime-alkali glass, 70 GPa, 0.22, 2,500; dried clay 4 GPa, 0.25,
// 1,900; the raw coat 2 GPa, 1,600. The frequencies scale as √(E/ρ), so a different E moves them all together; the ratios,
// which the ear hears as the object, come from the shape.
//
// Each mode is written as its frequency and, along each glaze surface by arc length, the displacement
// normal to it and the strains in it around and along the bowl, mass-normalized over the whole bowl
// (a crack strikes a mode by the work its released tension does on that strain: reciprocity), with
// the radiation efficiency of a sphere's
// mode of the same order, radius the rim's, at its frequency: an approximation for how well a mode
// reaches the air (the plan, §6.1.2).

import { writeFileSync } from 'node:fs';
import { at, bare, profile, RIM_RADIUS, thickness, type Profile } from '../src/kiln/bowl.ts';
import { modes, raster, sample, type Material } from './fe.ts';
import { strike, type Mode, type Piece } from '../src/kiln/ring.ts';

const FIRED: Material = { E: 60e9, nu: 0.2, rho: 2350 };
const GLAZE: Material = { E: 70e9, nu: 0.22, rho: 2500 };
const DRIED: Material = { E: 4e9, nu: 0.25, rho: 1900 };
const RAW: Material = { E: 2e9, nu: 0.25, rho: 1600 }; // raw glaze, dried on: weak, but bonded to the clay; softer, it rang on its own as no coat does
const TOP = 16000; // Hz: modes above this are left out
const HARMONICS = 12;
const PER = 6; // modes per harmonic
const mm = 1e-3;

const inside = profile('inside', 0.25), outside = profile('outside', 0.25);

/** The glaze's thickness at arc length s, averaged around the bowl, mm, bare features included. */
function meanGlaze(p: Profile, s: number, dip: number): number {
  let sum = 0;
  const count = 64;
  for (let k = 0; k < count; k++) {
    const phi = ((k + 0.5) / count) * Math.PI * 2;
    sum += thickness(p, s, phi) * (1 - bare(p, s, phi, at(p, p.r, s)));
  }
  return (dip * sum) / count;
}

/** The section's polygons, m: the body, and the body with its glaze over it. */
function section(dip: number): { body: [number, number][]; glazed: [number, number][] } {
  const body: [number, number][] = [], glazed: [number, number][] = [];
  for (let i = 0; i < outside.s.length; i++) {
    body.push([outside.r[i] * mm, outside.y[i] * mm]);
    const h = meanGlaze(outside, outside.s[i], dip);
    glazed.push([(outside.r[i] + outside.nr[i] * h) * mm, (outside.y[i] + outside.ny[i] * h) * mm]);
  }
  for (let i = inside.s.length - 1; i >= 0; i--) {
    body.push([inside.r[i] * mm, inside.y[i] * mm]);
    const h = meanGlaze(inside, inside.s[i], dip);
    glazed.push([(inside.r[i] + inside.nr[i] * h) * mm, (inside.y[i] + inside.ny[i] * h) * mm]);
  }
  return { body, glazed };
}

/** A sphere's mode of order n: radiation efficiency at ka, Re(−i h_n / h_n'), spherical Hankel h = j + i y. */
function radiation(n: number, ka: number): number {
  const j = [Math.sin(ka) / ka, Math.sin(ka) / ka ** 2 - Math.cos(ka) / ka];
  const y = [-Math.cos(ka) / ka, -Math.cos(ka) / ka ** 2 - Math.sin(ka) / ka];
  for (let k = 1; k <= n; k++) {
    j.push(((2 * k + 1) / ka) * j[k] - j[k - 1]);
    y.push(((2 * k + 1) / ka) * y[k] - y[k - 1]);
  }
  // h_n' = h_{n−1} − (n + 1)/x h_n, with h_{−1} = j_{−1} + i y_{−1} = cos x / x + i sin x / x.
  const hr = j[n], hi = y[n];
  const pr = n === 0 ? Math.cos(ka) / ka - hr / ka : j[n - 1] - ((n + 1) / ka) * hr;
  const pi = n === 0 ? Math.sin(ka) / ka - hi / ka : y[n - 1] - ((n + 1) / ka) * hi;
  // The real part of −i h / h', with the time convention e^(−iωt).
  return (hr * pi - hi * pr) / (pr * pr + pi * pi); // checked: (ka)²/(1 + (ka)²) for n = 0, (ka)⁴/(4 + (ka)⁴) for n = 1
}

/**
 * Along a surface, 1 mm apart from the pole: the normal displacement at the glaze's interface, and
 * the three strains in the surface there (around the bowl, along its meridian, and their shear), each
 * with its gradient outward, per mm, so the strain at the glaze's own mid-plane can be found for any
 * thickness of glaze. Displacement and the two normal strains go as cos nθ; the shear as sin nθ.
 */
type Along = { w: number[]; hoop: number[]; hoopOut: number[]; meridian: number[]; meridianOut: number[]; shear: number[]; shearOut: number[] };
type Solved = { n: number; k: number; f: number; inside: Along; outside: Along };

/**
 * The body's thickness along a surface, mm, 1 mm apart from the pole: from the surface inward along
 * its normal until the clay ends. A crack in the glaze pulls on the wall off its middle surface by
 * half this and half the glaze: the lever by which it bends the wall.
 */
function wall(p: Profile, dip: number): number[] {
  const { body, glazed } = section(dip);
  const g = raster(0.05 * mm, [{ outline: glazed, material: 1 }, { outline: body, material: 0 }], [FIRED, GLAZE]);
  const clay = (r: number, y: number) => {
    const i = Math.floor((r * mm) / g.h), j = Math.floor((y * mm - g.z0) / g.h);
    return i >= 0 && i < g.ni && j >= 0 && j < g.nj && g.cell[j * g.ni + i] === 0;
  };
  const out: number[] = [];
  for (let s = 0; s <= p.length; s += 1) {
    const r = at(p, p.r, s), y = at(p, p.y, s), nr = at(p, p.nr, s), ny = at(p, p.ny, s);
    let d = 0.05;
    while (d < 30 && (clay(r - nr * d, y - ny * d) || d < 0.3)) d += 0.05;
    out.push(Number(d.toFixed(2)));
  }
  return out;
}

/** Solve one bowl: its modes to TOP, with each mode's normal displacement along both surfaces. */
function solve(pixel: number, dip: number, fired: boolean, shapes: boolean): Solved[] {
  const { body, glazed } = section(dip);
  const g = raster(pixel, [{ outline: glazed, material: 1 }, { outline: body, material: 0 }], fired ? [FIRED, GLAZE] : [DRIED, RAW]);
  const out: Solved[] = [];
  for (let n = 0; n < HARMONICS; n++) {
    const t0 = performance.now();
    const found = modes(g, n, PER);
    if (process.argv.includes('--verbose')) process.stderr.write(`  n ${n}: ${found.map((m) => m.f.toFixed(0)).join(' ')} Hz, ${((performance.now() - t0) / 1000).toFixed(1)} s\n`);
    for (const m of found) {
      if (m.f > TOP) break;
      // In the clay at two fixed depths, 0.3 and 0.6 mm, the same whatever the mesh, and extrapolated
      // to the interface, where the glaze is bonded and the strains in the surface are the glaze's too;
      // the difference between the depths is the gradient outward. The tangent is the profile's own,
      // along increasing s; derivatives along it are taken 0.25 mm either way.
      //   along the meridian  ε_ss = t_r ∂U/∂s + t_z ∂W/∂s
      //   around the bowl     ε_θθ = (U + nV)/r
      //   shear               γ_sθ = ∂V/∂s − t_r V/r − n (t_r U + t_z W)/r
      const along = (p: Profile): Along => {
        const out: Along = { w: [], hoop: [], hoopOut: [], meridian: [], meridianOut: [], shear: [], shearOut: [] };
        const U = (r: number, z: number) => sample(g, m.U, Math.max(r, 0), z), V = (r: number, z: number) => sample(g, m.V, Math.max(r, 0), z), W = (r: number, z: number) => sample(g, m.W, Math.max(r, 0), z);
        const D1 = 0.3, D2 = 0.6, STEP = 0.25; // mm
        for (let s = 0; s <= p.length; s += 1) {
          const r = at(p, p.r, s), y = at(p, p.y, s), nr = at(p, p.nr, s), ny = at(p, p.ny, s);
          const dr = at(p, p.r, Math.min(p.length, s + 0.1)) - at(p, p.r, Math.max(0, s - 0.1)), dy = at(p, p.y, Math.min(p.length, s + 0.1)) - at(p, p.y, Math.max(0, s - 0.1));
          const tl = Math.hypot(dr, dy) || 1, tr = dr / tl, tz = dy / tl;
          const strains = (depth: number) => {
            const pr = (r - nr * depth) * mm, pz = (y - ny * depth) * mm, d = STEP * mm;
            const rr = Math.max(pr, 1 * mm);
            const u = U(pr, pz), v = V(pr, pz), wz = W(pr, pz);
            const ds = (f: typeof U) => (f(pr + tr * d, pz + tz * d) - f(pr - tr * d, pz - tz * d)) / (2 * d);
            return {
              w: u * nr + wz * ny,
              hoop: (u + n * v) / rr,
              meridian: tr * ds(U) + tz * ds(W),
              shear: ds(V) - (tr * v) / rr - (n * (tr * u + tz * wz)) / rr,
            };
          };
          const a = strains(D1), b = strains(D2);
          const edge = (key: 'w' | 'hoop' | 'meridian' | 'shear') => a[key] + ((a[key] - b[key]) * D1) / (D2 - D1);
          const outward = (key: 'hoop' | 'meridian' | 'shear') => (a[key] - b[key]) / (D2 - D1);
          out.w.push(edge('w'));
          out.hoop.push(edge('hoop')); out.hoopOut.push(outward('hoop'));
          out.meridian.push(edge('meridian')); out.meridianOut.push(outward('meridian'));
          out.shear.push(edge('shear')); out.shearOut.push(outward('shear'));
        }
        return out;
      };
      const none: Along = { w: [], hoop: [], hoopOut: [], meridian: [], meridianOut: [], shear: [], shearOut: [] };
      out.push({ n, k: m.k, f: m.f, inside: shapes ? along(inside) : none, outside: shapes ? along(outside) : none });
    }
  }
  return out.sort((a, b) => a.f - b.f);
}

const round = (x: number, digits = 4) => (x === 0 ? 0 : Number(x.toPrecision(digits)));

if (process.argv.includes('--converge')) {
  // The frequencies, and what a crack does with the modes: the strain across each of a set of
  // reference cracks, at the glaze's mid-plane (1 mm of glaze), on each mode, compared between 0.3 mm
  // and 0.15 mm pixels. Modes are matched by (n, k), their signs aligned by their displacements.
  const started = performance.now();
  const coarse = solve(0.3 * mm, 1, true, true);
  const t1 = performance.now();
  const fine = solve(0.15 * mm, 1, true, true);
  const t2 = performance.now();
  console.log(`0.3 mm: ${((t1 - started) / 1000).toFixed(0)} s; 0.15 mm: ${((t2 - t1) / 1000).toFixed(0)} s`);
  for (const c of coarse) {
    const f = fine.find((x) => x.n === c.n && x.k === c.k);
    console.log(`  (${c.n}, ${c.k})  ${c.f.toFixed(0).padStart(6)} Hz  at 0.15 mm ${f ? f.f.toFixed(0).padStart(6) : '—'}  ${f ? ((c.f / f.f - 1) * 100).toFixed(2) + ' %' : ''}`);
  }
  const across = (a: Along, s: number, psi: number, h: number) => {
    const i = Math.round(s), sin = Math.sin(psi), cos = Math.cos(psi);
    const mid = (e: number[], g: number[]) => e[i] + g[i] * (h / 2);
    return [sin * sin * mid(a.meridian, a.meridianOut) + cos * cos * mid(a.hoop, a.hoopOut), -sin * cos * mid(a.shear, a.shearOut)];
  };
  const cracks: [string, 'inside' | 'outside', number, number][] = [
    ['in the well, up', 'inside', 15, 0], ['in the well, around', 'inside', 15, Math.PI / 2], ['mid-wall, up', 'inside', 60, 0],
    ['mid-wall, oblique', 'inside', 60, Math.PI / 4], ['near the lip, around', 'inside', 95, Math.PI / 2], ['outside wall, up', 'outside', 90, 0],
  ];
  console.log('\nthe strains across each crack at the glaze\'s mid-plane, 1 mm of glaze, on every mode: 0.3 mm against 0.15 mm, as a relative difference of the whole vector:');
  let worst = 0;
  for (const [label, side, s0, psi] of cracks) {
    const a: number[] = [], b: number[] = [];
    for (const c of coarse) {
      const f = fine.find((x) => x.n === c.n && x.k === c.k);
      if (!f) continue;
      const dot = c.inside.w.reduce((sum, w, i) => sum + w * (f.inside.w[i] ?? 0), 0);
      const sign = dot < 0 ? -1 : 1;
      a.push(...across(c[side], s0, psi, 1));
      b.push(...across(f[side], s0, psi, 1).map((x) => x * sign));
    }
    const diff = Math.hypot(...a.map((x, i) => x - b[i])) / Math.hypot(...b);
    worst = Math.max(worst, diff);
    console.log(`  ${label.padEnd(24)} ${(diff * 100).toFixed(1)} %`);
  }
  console.log(`worst ${(worst * 100).toFixed(1)} %`);

  // And as the piece strikes: each crack 5 mm long, in pieces of 1 mm in its own glaze at the dip of
  // 1, through ring.ts's strike (the strip's h^3/2, the mid-plane, both orientations, 1/ω), each mode
  // weighted by its radiation, √σ: the vector a ping is made of.
  const matched = coarse.map((c) => {
    const f = fine.find((x) => x.n === c.n && x.k === c.k);
    if (!f) return null;
    const sign = c.inside.w.reduce((sum, w, i) => sum + w * (f.inside.w[i] ?? 0), 0) < 0 ? -1 : 1;
    const flip = (a: Along): Along => Object.fromEntries(Object.entries(a).map(([key, v]) => [key, v.map((x) => x * sign)])) as Along;
    return { c, f: { ...f, inside: flip(f.inside), outside: flip(f.outside) } };
  }).filter((m) => m !== null);
  const asModes = (pick: 'c' | 'f') => matched.map((m) => {
    const x = m[pick];
    return { n: x.n, k: x.k, f: x.f, split: 0, phase: 0, sigma: radiation(x.n, (2 * Math.PI * x.f * RIM_RADIUS * mm) / 343), inside: x.inside, outside: x.outside, dried: 1 } as unknown as Mode;
  });
  const [mc, mf] = [asModes('c'), asModes('f')];
  console.log('\nthe strike as the piece makes it, 5 mm cracks, weighted by radiation: 0.3 mm against 0.15 mm:');
  let worstStrike = 0;
  for (const [label, side, s0, psi] of cracks) {
    const p = profile(side), pieces: Piece[] = [];
    for (let q = 0; q < 5; q++) {
      const s = s0 + (psi === 0 ? q + 0.5 : 0), phi = psi === 0 ? 0.3 : 0.3 + (q + 0.5) / Math.max(at(p, p.r, s0), 1);
      pieces.push({ side, s, phi, psi, length: 1, h: thickness(p, s, phi) });
    }
    const weigh = (set: Mode[]) => strike(set, pieces).map((v, j) => v * Math.sqrt(set[j >> 1].sigma));
    const a = weigh(mc), b = weigh(mf);
    const diff = Math.hypot(...a.map((x, i) => x - b[i])) / Math.hypot(...b);
    worstStrike = Math.max(worstStrike, diff);
    console.log(`  ${label.padEnd(24)} ${(diff * 100).toFixed(1)} %`);
  }
  console.log(`worst ${(worstStrike * 100).toFixed(1)} %`);
} else {
  const started = performance.now();
  const PIXEL = 0.3 * mm;
  const fired = solve(PIXEL, 1, true, true);
  const thin = solve(PIXEL, 0.55, true, false), thick = solve(PIXEL, 1.45, true, false);
  const dried = solve(PIXEL, 1, false, false);
  const a = RIM_RADIUS * mm, c = 343;
  const shift = (set: Solved[], m: Solved) => round((set.find((x) => x.n === m.n && x.k === m.k)?.f ?? m.f) / m.f, 5);
  const data = {
    source: 'tools/bowl-modes.ts, from src/kiln/bowl.ts; finite elements checked by tools/fe-check.ts',
    materials: { fired: FIRED, glaze: GLAZE, dried: DRIED, raw: RAW, note: 'assumptions: frequencies scale with √(E/ρ); ratios come from the shape' },
    pixel: PIXEL,
    step: 1, // mm between samples along each surface, from the pole
    wall: { inside: wall(inside, 1), outside: wall(outside, 1) },
    modes: fired.map((m) => ({
      n: m.n,
      k: m.k,
      f: round(m.f, 6),
      // The dip's glaze weighs on the bowl: the frequency at dips 0.55 and 1.45, as multiples of this.
      thin: shift(thin, m),
      thick: shift(thick, m),
      // Before the fire: dried clay under a raw coat.
      dried: shift(dried, m),
      radiation: round(radiation(m.n, (2 * Math.PI * m.f * a) / c), 4),
      // Three figures: a strain weighting needs no more, and the file is fetched by every visitor.
      inside: Object.fromEntries(Object.entries(m.inside).map(([key, a]) => [key, a.map((x) => round(x, 3))])),
      outside: Object.fromEntries(Object.entries(m.outside).map(([key, a]) => [key, a.map((x) => round(x, 3))])),
    })),
  };
  writeFileSync(new URL('../src/kiln/modes.json', import.meta.url), JSON.stringify(data));
  const f2 = fired.find((m) => m.n === 2 && m.k === 0)!.f;
  console.log(`${fired.length} modes below ${TOP} Hz in ${((performance.now() - started) / 1000).toFixed(0)} s; (2, 0) at ${f2.toFixed(0)} Hz`);
  for (const m of fired.slice(0, 24)) {
    const rim = m.inside.w[m.inside.w.length - 1], well = m.inside.w[20];
    console.log(`  (${m.n}, ${m.k})  ${m.f.toFixed(0).padStart(6)} Hz  ×${(m.f / f2).toFixed(2)}  dried ×${shift(dried, m).toFixed(3)}  σ ${radiation(m.n, (2 * Math.PI * m.f * a) / c).toFixed(3)}  |w| rim ${Math.abs(rim).toExponential(2)} well ${Math.abs(well).toExponential(2)}`);
  }
}
