# AGENTS.md

## The work

- The theme: many styles, each at the highest aesthetic value. Effects dazzle; faces are well paired; every piece is unique.
- Aesthetics first: the effect before the words. No Google Fonts or other worn-out faces; each piece has its own face, type scale, and moving type.
- Any font or reference that can be downloaded may be used as a model. Never pay for anything.
- Sound: KILN only, and only its crackle.
- The camera stands in a few fixed places and never tours or orbits. Nothing flies without meaning, passes through another object, or vanishes and returns.

## Finding and fixing

- Read the code first: find the cause in positions, sizes, timings, and thresholds. Look at frames only for what the code cannot answer.
- Before handing over, walk each flow as a viewer would: what the camera sees and what is in its way, what passes through what, what disappears, and what text lies over what.
- Once the owner confirms something works, stop testing it.

## Workspace

Yaobian is a series in 照 Daykiln. Its workspace, commands and dev server are the project's: see [AGENTS.md](../AGENTS.md). Its pieces are served under `/yaobian/`.

## Map

- `src/app/`: the page: each piece at its own address; any other address goes to the door.
- `src/pieces/`: one file per piece.
- `src/kiln/`, `src/rule/`, `src/plumb/`: each piece's scene and simulation.
- `src/core/`: the shared parts.
- `public/yaobian/entrance/`: KILN's and RULE's posters, which are also their leaves' sources on the door.
- `tools/`: offline checks.
