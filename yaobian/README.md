# Yaobian 窑变

*Glaze, Pattern, Form.* Three interactive pieces about beauty that nobody drew. The fire chose the blue. The rule drew the wall. Gravity drew the arch.

- **Way in:** the album's door, 照 Daykiln, and each piece's way back leads there. The series' own entrance (窑变 fired into Jun glaze, then a screen for each piece) is retired.
- **KILN:** dip a bowl, close the kiln; it glows, cools, and crazes, each crack heard.
- **RULE:** the Hall of the Two Sisters in crystal; set one rule and let go, and fire runs through the hall and leaves it clay.
- **PLUMB:** hang lead on a net, as Gaudí did; turned over and grown, you stand under the vault in a sand sea.
- **Stack:** three.js 0.186 (WebGPU, TSL), Anime.js 4, Vite, TypeScript.
- **Open:** reduced motion walked through; touch-first UI on phones; frame cost on a slower GPU.

| File | What |
|---|---|
| [AGENTS.md](AGENTS.md) | The rules for working here |
| [DIRECTIONS.md](DIRECTIONS.md) | What each piece is |
| [LOOK.md](LOOK.md) | How it looks: faces, motion, light |
| [SCORE.md](SCORE.md) | How Three.js and Anime.js share the motion |
| [references/watchlist.md](references/watchlist.md) | Works to look at |
| [research/](research/) | Sources for the pieces' claims, and the crackle's |

## Performance

GPU timestamps (`?gpu`), 2880 × 1800 px, fastest of twenty frames.

| Piece | Frame, ms |
|---|---|
| KILN | 20 at the table; 16 cooling; 8 firing |
| RULE | 19 under the dome; 14 at the wall |
| PLUMB | 10 hanging; 13 turned over; 15 growing; 7 under the vault |

The resolution adapts while anything moves (to 14 ms a frame) and refines over sixteen samples at rest ([src/core/quality.ts](src/core/quality.ts)).
