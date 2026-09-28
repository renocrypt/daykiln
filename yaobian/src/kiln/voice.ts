// KILN's sound, live (the sound plan, .agents/plans/sound.md): the glaze crazing as the bowl cools,
// each crack a strike on the bowl's own modes (ring.ts). Nothing else in the piece sounds. This is
// what sends the strikes, on the piece's clock (src/pieces/kiln.ts).
//
// Nothing here draws a sound from a file: the bowl's modes are computed from its profile by finite
// elements.
//
// The voice is built once sound has begun, and until then every call is silently dropped: sound
// comes late to a piece already running, and a late sound is worse than none.

import { sound } from '../core/sound.ts';
import * as cue from './cues.ts';
import { LEVEL } from './cues.ts';
import { admit, bank, bowlModes, lossAt, referenceOf, type Mode, type Ping } from './ring.ts';

export type KilnVoice = ReturnType<typeof kilnVoice>;

export function kilnVoice() {
  let bowl: AudioWorkletNode | null = null;
  let building = false, gone = false;
  let fired: Mode[] | null = null; // the bowl's modes once it is glazed and fired
  let scale = 1; // the ping level over the reference crack's strike
  let loss = lossAt(560);
  let recording: { at: number; amplitudes: number[] }[] = [];
  let opened = 0; // audio time the kiln opened, for the recording
  let sent: number[] = [], refused = 0; // the times the latest pings were sent for, ascending; how many were refused

  const build = async () => {
    building = true;
    const n = await sound.processor('modal');
    building = false;
    if (!n) return;
    if (gone) { sound.release(n); return; }
    n.connect(sound.input!);
    if (fired) sound.set(n, bank(fired, loss));
    bowl = n;
  };
  const ensure = () => { if (!bowl && !building && !gone && sound.input) void build(); };
  const unlisten = sound.onChange(ensure);
  ensure();

  return {
    get ready() { return bowl !== null; },
    /** The bowl is glazed at a dip and fired: its modes from here on, and a fresh recording of its cooling. */
    firing(dip: number, seed: number): Mode[] {
      fired = bowlModes(dip, seed);
      scale = LEVEL.ping / referenceOf(fired);
      loss = lossAt(560);
      recording = []; sent = []; refused = 0;
      if (bowl) sound.set(bowl, bank(fired, loss));
      return fired;
    },
    /** The glaze cools: the bowl's loss follows its temperature, glided, without silencing what rings. */
    cool(celsius: number): void {
      const next = lossAt(celsius);
      if (!bowl || !fired || Math.abs(next / loss - 1) < 0.02) return;
      loss = next;
      sound.set(bowl, { type: 'damp', dampings: fired.flatMap(() => [loss / 2, loss / 2]) });
    },
    /** The kiln opens: the recording of the cooling is timed from here. */
    open(): void { opened = sound.context?.currentTime ?? 0; },
    /**
     * The pings whose tension was crossed this frame, each with its place in the frame's stretch (0…1);
     * those chosen are heard, the loudest first, if the times they are actually sent at still keep the
     * rule they were chosen by: never more than four in any 50 ms.
     */
    pings(heard: { ping: Ping; u: number }[]): void {
      if (!fired || !bowl || !sound.running) return;
      const events: { time: number; amplitudes: number[] }[] = [];
      for (const { ping, u } of heard.filter((h) => h.ping.heard).sort((a, b) => b.ping.loud - a.ping.loud)) {
        const time = sound.at(u);
        if (admit(sent, time)) events.push(cue.ping(time, ping, scale)); else refused++;
      }
      if (sent.length > 16) sent.splice(0, sent.length - 16);
      if (!events.length) return;
      events.sort((a, b) => a.time - b.time);
      for (const e of events) recording.push({ at: e.time - opened, amplitudes: e.amplitudes });
      sound.send(bowl, events);
    },
    /** Pings chosen but refused at the moment of sending, their actual times too close: how often the clock and the frames disagreed. */
    get refused(): number { return refused; },
    /** How long the recording of the cooling runs, s; 0 if there is none. */
    get recorded(): number { return recording.length ? recording[recording.length - 1].at + 2 : 0; },
    /** Hear the cooling again, from the strikes sent while sound was on, the bowl cold. */
    replay(): void {
      if (!bowl || !fired || !recording.length) return;
      const t0 = sound.at(0) + 0.1;
      sound.send(bowl, recording.map((e) => ({ time: t0 + e.at, amplitudes: e.amplitudes })));
    },
    /**
     * The cooling rendered again offline from the strikes sent while sound was on, for keeping as a
     * file: a reconstruction, at the glaze's loss midway through its cooling, 300 °C, and without what
     * muting cut short.
     */
    async render(): Promise<AudioBuffer | null> {
      if (!fired || !recording.length) return null;
      const modes = fired, events = recording;
      return sound.render(events[events.length - 1].at + 2.8, (make, out, ctx) => {
        const node = make('modal', { processorOptions: { messages: [bank(modes, lossAt(300)), { type: 'events', events: events.map((e) => ({ time: 0.3 + e.at, amplitudes: e.amplitudes })) }] } });
        const compressor = ctx.createDynamicsCompressor();
        compressor.threshold.value = -6; compressor.knee.value = 6; compressor.ratio.value = 12; compressor.attack.value = 0.003; compressor.release.value = 0.15;
        node.connect(compressor).connect(make('meter')).connect(out);
      });
    },
    dispose(): void {
      gone = true;
      unlisten();
      if (bowl) sound.release(bowl);
      bowl = null;
    },
  };
}
