// Every cue's level measured against the mix (src/core/mix.ts), offline: each rendered as its piece
// sends it (KILN's from src/kiln/cues.ts and ring.ts), through the worklet's own processors in Node
// (tools/worklet-node.ts), before the master's compressor and soft clip. Exits 1 if any misses.
//
//   node yaobian/tools/levels.ts
//
// KILN's crackle is real firings': the fracture model run on both glaze surfaces, at the thin, even
// and thick dips, three seeds each; their pings struck, placed in the cooling and chosen as the piece
// chooses them. A thicker glaze cracks less often and louder, a crack's strike going as h^3/2
// (src/kiln/ring.ts): the loudest cooling is the thick dip's.

import { MIX, TOLERANCE, type Target } from '../src/core/mix.ts';
import { chartSurface, profile, type Side } from '../src/kiln/bowl.ts';
import * as cue from '../src/kiln/cues.ts';
import { LEVEL, PING } from '../src/kiln/cues.ts';
import { crackle as fracture, FRACTURE_DEFAULTS } from '../src/kiln/fracture.ts';
import { bank, bowlModes, crackle, lossAt, referenceOf } from '../src/kiln/ring.ts';
import { render } from './worklet-node.ts';

const RATE = 48000;
const db = (x: number) => 20 * Math.log10(Math.max(x, 1e-12));
const peakOf = (channels: Float32Array[], from = 0) => { let p = 0; for (const c of channels) for (let i = from; i < c.length; i++) p = Math.max(p, Math.abs(c[i])); return db(p); };

const measured: { key: string; target: Target; value: number | null; note?: string }[] = [];

// KILN: the crackle ------------------------------------------------------------------------------------
// Two sets of firings. The first set the pings' level and law (src/kiln/cues.ts); the second, seeds
// no level was set on, only checks them, against the same targets. The isolated pings ring at the
// bowl's loss at 560 °C, the whole cooling at its loss at 300 °C: fixed losses, not the piece's own,
// which glides as the glaze cools.
const DIPS = [0.55, 1, 1.45], SEEDS = { set: [11, 910257, 3], check: [2718, 31415, 16180] };
type Firing = { dip: number; seed: number; pings: number; heard: number; opens: number; alone: number[]; first: number; firstLength: number; loudest: number; second: string };
const over: number[] = [];
function fire(seeds: number[]): Firing[] {
  const firings: Firing[] = [];
  for (const dip of DIPS) for (const seed of seeds) {
    const fired = (['inside', 'outside'] as Side[]).map((side) => ({ side, cracks: fracture(chartSurface(profile(side), dip), { ...FRACTURE_DEFAULTS, seed }).cracks }));
    const modes = bowlModes(dip, seed);
    const scale = LEVEL.ping / referenceOf(modes);
    const pings = crackle(fired, dip, modes), heard = pings.filter((p) => p.heard).sort((a, b) => a.at - b.at);
    const alone = heard.map((p) => peakOf(render('modal', [bank(modes, lossAt(560)), { type: 'events', events: [cue.ping(0.01, p, scale)] }], 0.3)));
    // How a ping's peak alone stands over its strike's norm, uncompressed: the law's estimate (cues.ts, PING.over).
    heard.forEach((p, i) => { if (i % 5 === 0) over.push(peakOf(render('modal', [bank(modes, lossAt(560)), { type: 'events', events: [{ time: 0.01, amplitudes: p.amplitudes.map((a) => a * scale) }] }], 0.3)) - db(p.loud * scale)); });
    const cooling = render('modal', [bank(modes, lossAt(300)), { type: 'events', events: heard.map((p) => cue.ping(0.1 + p.at, p, scale)) }], heard[heard.length - 1].at + 3);
    const second: string[] = [];
    for (let s = 0; s + RATE <= cooling[0].length; s += RATE) second.push(peakOf(cooling.map((c) => c.subarray(s, s + RATE))).toFixed(0));
    firings.push({ dip, seed, pings: pings.length, heard: heard.length, opens: heard[0].at, alone, first: alone[0], firstLength: heard[0].length, loudest: peakOf(cooling), second: second.filter((v) => v !== '-240').join(' ') });
  }
  return firings;
}
const percentile = (v: number[], q: number) => { const s = [...v].sort((a, b) => a - b); return s[Math.round(q * (s.length - 1))]; };
for (const [which, seeds] of Object.entries(SEEDS)) {
  const firings = fire(seeds), tag = which === 'check' ? ' (check)' : '';
  const even = firings.filter((f) => f.dip === 1).flatMap((f) => f.alone);
  const loudest = firings.reduce((a, f) => (f.loudest > a.loudest ? f : a));
  measured.push({ key: `kiln.cooling${tag}`, target: MIX.kiln.cooling, value: loudest.loudest, note: `the dip ${loudest.dip}, seed ${loudest.seed}: peak a second from its first ping, ${loudest.second}` });
  measured.push({ key: `kiln.pings${tag}`, target: MIX.kiln.pings, value: percentile(even, 0.9), note: `10th percentile ${percentile(even, 0.1).toFixed(1)}, median ${percentile(even, 0.5).toFixed(1)}, loudest ${percentile(even, 1).toFixed(1)}` });
  const firsts = firings.map((f) => f.first).sort((a, b) => a - b);
  measured.push({ key: `kiln.firstPing${tag}`, target: MIX.kiln.firstPing, value: firsts[0], note: 'the quietest' });
  measured.push({ key: `kiln.firstPing${tag}`, target: MIX.kiln.firstPing, value: firsts[firsts.length - 1], note: 'the loudest' });
  console.log(which === 'check' ? '  firings that only check:' : '  firings the levels were set on:');
  for (const f of firings) console.log(`  dip ${f.dip.toFixed(2)} seed ${String(f.seed).padEnd(7)} ${String(f.heard).padStart(5)} of ${f.pings} pings heard; the first ${f.opens.toFixed(1)} s after the kiln opens, ${f.first.toFixed(1)} dBFS (a run of ${f.firstLength.toFixed(1)} mm); 90th percentile ${percentile(f.alone, 0.9).toFixed(1)}; the cooling's loudest ${f.loudest.toFixed(1)}`);
}
console.log(`  a ping's peak alone over its strike's norm: ${percentile(over, 0.05).toFixed(1)} to ${percentile(over, 0.95).toFixed(1)} dB in nine of ten, median ${percentile(over, 0.5).toFixed(1)} (PING.over is ${PING.over})`);
console.log('');

// The table ---------------------------------------------------------------------------------------------
let misses = 0;
const show = (t: number | [number, number]) => (typeof t === 'number' ? `${t} ±${TOLERANCE}` : `${t[0]} to ${t[1]}`);
for (const m of measured) {
  const kind = m.target.peak !== undefined ? 'peak' : 'RMS', target = (m.target.peak ?? m.target.rms)!;
  const ok = m.value === null ? null : typeof target === 'number' ? Math.abs(m.value - target) <= TOLERANCE : m.value >= target[0] && m.value <= target[1];
  if (ok === false) misses++;
  console.log(`${ok === null ? '  ·  ' : ok ? '  ok ' : ' MISS'} ${m.key.padEnd(23)} ${kind.padEnd(4)} ${show(target).padEnd(12)} ${m.value === null ? '     —' : m.value.toFixed(1).padStart(6)}   ${m.target.what}${m.target.primary ? ' (primary)' : ''}`);
  if (m.note) console.log(`${' '.repeat(53)}${m.note}`);
}
console.log(misses ? `\n${misses} missed` : '\nall within');
process.exit(misses ? 1 : 0);
