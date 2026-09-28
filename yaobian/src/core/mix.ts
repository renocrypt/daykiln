// The mix: every sound's target level, dBFS at the master, before its compressor and soft clip (the
// sound plan, .agents/plans/sound.md, §5.3). This is the one table of levels. KILN sets its
// strikes to meet it (in src/kiln/cues.ts), and `node yaobian/tools/levels.ts` renders
// each cue as the piece sends it, through the processors themselves, and measures it against its
// target here.
//
// A `peak` or `rms` is a target, met within `TOLERANCE`; a pair is a range the measure must fall in.
// Primary cues must be heard on laptop speakers at an ordinary volume; the rest may sink under them.
//
// Frozen as they are: KILN's were set by measuring the cues against them (calibration), and seeds no
// level was set on are checked against them since. A target moves only for a reason other than a
// measurement falling outside it.

export type Target = { what: string; peak?: number | [number, number]; rms?: number | [number, number]; primary?: boolean };

export const TOLERANCE = 1.5; // dB

export const MIX = {
  kiln: {
    cooling: { what: 'the whole cooling as heard, the pings overlapping, the bowl at its loss at 300 °C: the loudest of three firings at each of the thin, even and thick dips', peak: -4 },
    pings: { what: 'the pings heard, each alone, at the even dip: the 90th percentile of three firings', peak: [-26, -16] },
    firstPing: { what: 'the first ping heard, alone, whichever crack runs first: the quietest and loudest of the nine firings', peak: [-32, -4], primary: true },
  },
} satisfies Record<string, Record<string, Target>>;
