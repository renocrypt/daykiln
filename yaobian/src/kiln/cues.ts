// KILN's crackle as the modal processor hears it: each ping's strike at a time, at its level. Pure,
// so what the piece's voice (voice.ts) sends is what tools/levels.ts renders and measures against
// the mix (src/core/mix.ts).

import type { Ping } from './ring.ts';

/**
 * The strike of the reference crack, 5 mm in the well (ring.ts, `referenceOf`), set so the pings meet
 * their targets in the mix, src/core/mix.ts; `node yaobian/tools/levels.ts` measures them against it.
 */
export const LEVEL = { ping: 0.056 };
/**
 * The pings' loudness, compressed above a knee: a law of the mix, not of the glaze. A crack's strike
 * ranges over 40 dB, from a tip edging on to the first long crack across a thick glaze, and the first
 * cracks of different firings differ by 26 dB (tools/levels.ts). A room carries that range; a
 * laptop's speakers, in a mix with a ceiling, cannot. So above `knee`, a ping's level alone, each dB
 * of it becomes 1/`ratio` dB: the loudest cracks stay the loudest, and every quieter one is as struck.
 * A ping's level alone is estimated from its strike: its peak stands `over` dB above the strike's
 * norm, the root-sum-square of its modes' amplitudes as heard (a norm, not an RMS: a lone sine's RMS is
 * 3 dB under it). In nine pings of ten 1.5–6.4 dB, median 4.1 (tools/levels.ts prints it): a typical
 * estimate, not a ceiling.
 */
export const PING = { knee: -14, ratio: 3, over: 4 };

/** A ping as heard, at a time: its strike at the level `scale` sets (LEVEL.ping over the reference crack's strike), compressed above the knee. */
export function ping(time: number, p: Ping, scale: number): { time: number; amplitudes: number[] } {
  const level = 20 * Math.log10(Math.max(p.loud * scale, 1e-12)) + PING.over;
  const gain = level <= PING.knee ? 1 : 10 ** ((-(level - PING.knee) * (1 - 1 / PING.ratio)) / 20);
  return { time, amplitudes: p.amplitudes.map((a) => a * scale * gain) };
}
