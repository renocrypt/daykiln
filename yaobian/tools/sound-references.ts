// Yaobian's sounds measured beside recordings of the real things, by the same analysis, so a claim of
// accuracy rests on a measurement and not on an ear (the sound plan, .agents/plans/sound.md).
//
//   node yaobian/tools/sound-references.ts
//
// The recordings are fetched from Freesound as previews into $TMPDIR/yaobian/ref/sound/, reference
// only: nothing of them enters the repository.
//
//   bowls     two recordings of ceramic bowls struck: their resonances' ratios and loss factors,
//             which set the sketch's first guesses right and which the finite elements must match
//             on bowls of their shape (tools/fe-check.ts)

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decode, onsets, resonances } from './audio.ts';

const REFERENCES = {
  bowlTaps: { id: 848463, what: 'taps on a ceramic bowl, ringing free', by: '3D_Blanco', license: 'CC0' },
  bowlRim: { id: 855306, what: 'a wooden stick on a ceramic bowl\'s rim', by: 'GammaGool', license: 'CC0' },
} as const;

const folder = join(process.env.TMPDIR ?? tmpdir(), 'yaobian', 'ref', 'sound');
mkdirSync(folder, { recursive: true });
function fetchReference(id: number): string {
  const file = join(folder, `${id}.mp3`);
  if (existsSync(file)) return file;
  const page = execFileSync('curl', ['-sL', '-A', 'Mozilla/5.0', `https://freesound.org/s/${id}/`]).toString();
  const url = page.match(/https:\/\/cdn\.freesound\.org\/previews\/[^"]*-hq\.mp3/)?.[0];
  if (!url) throw new Error(`no preview found for Freesound ${id}`);
  execFileSync('curl', ['-sL', url, '-o', file]);
  return file;
}
const load = (key: keyof typeof REFERENCES) => {
  const r = REFERENCES[key];
  console.log(`  Freesound ${r.id}, ${r.what}, by ${r.by}, ${r.license}`);
  return decode(fetchReference(r.id));
};

// Bowls ---------------------------------------------------------------------------------------------
console.log('\nBOWLS: resonances as ratios to the strongest below 4 kHz, and loss factors η');
for (const key of ['bowlTaps', 'bowlRim'] as const) {
  const y = load(key);
  const on = onsets(y);
  on.slice(0, 5).forEach((o, i) => {
    const found = resonances(y, o, on[i + 1] ?? y.length).filter((r) => r.level > -20);
    const base = found.filter((r) => r.f < 4000).sort((a, b) => b.level - a.level)[0] ?? found[0];
    console.log(`    strike ${i + 1}: ` + found.slice(0, 6).map((r) => `${Math.round(r.f)} Hz ×${(r.f / base.f).toFixed(2)} η ${Number.isNaN(r.eta) ? '—' : r.eta.toFixed(4)}`).join(' · '));
  });
}
console.log('  The free bowl\'s first three strikes: 821, 1937, 3429 Hz, 1 : 2.36 : 4.18, η 0.0007–0.0009; its last two');
console.log('  are the scrapes. The stick on the rim is less clean, the bowl held or resting: η 0.002–0.005, and a');
console.log('  peak at 2.2–2.3× the lowest in three strikes of five.');
