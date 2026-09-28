# Sound for Yaobian

**Status, 2026-09-25.** Only KILN has sound, and only its crackle; RULE and PLUMB are silent. Every sound is computed from the simulation that draws the picture; where a model or an assumption is used, the code says so. No audio files.

| Piece | What is heard | Code |
|---|---|---|
| KILN | Each crack a strike on the bowl's computed modes; the cooling heard again (H) and kept as a WAV | `src/kiln/voice.ts`, `ring.ts`, `cues.ts`, `schedule.ts`, `fire.worker.ts` |

The core: `src/core/sound.ts` (context, clock, mute), `voices.worklet.ts` (the processors), `mix.ts` (the one table of levels), `guide.ts` (the mark, M).

## Checks

The numbers live in these tools' output, not in documents.

- `node yaobian/tools/levels.ts`: every cue, as the piece sends it, against `src/core/mix.ts`.
- `node yaobian/tools/fe-check.ts`, `node yaobian/tools/bowl-modes.ts --converge`: the bowl's modes.
- `node yaobian/tools/sound-references.ts`.

## Decisions

- Sound starts with Begin, is on unless turned off, and is remembered. The mark is one hairline that swells with the level.
- A crack strikes the bowl's modes by the work its released tension does on each mode's strain across it. A model.
- At most 4 pings in any 50 ms, the loudest, chosen on the cooling's clock, which the piece then follows; the rule is held again when sending.
- Ping loudness is compressed 3:1 above −14 dBFS: a mix law, not physics.
- The fired bowl's loss is a resting bowl's, as recordings measure, and higher while the glaze is hot (an assumption).
- One sound only: the dip's slip, the set-down, the fire, RULE's fountain and PLUMB's cords were built and removed; a sound on every event reads as a slide show's effects.
- Rejected: pitch from a crack's length.

## Open

- One level check misses by 0.03 dB on the quiet side (the cooling's loudest moment); left for the next review.
- Nothing recorded exists to check crazing against: those stay labeled models.
- Not yet walked through on Safari or an iPhone.

Reviews and the responses to them: in git history (commits d5e4fc0 and before).
