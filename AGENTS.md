# AGENTS.md

## The work

- A work's worth is a picture only its process could draw, one that stops the viewer first and is understood after. The process is never explained in a sentence set beside it.
- Plates are for looking (UNFOLD, WAKE, SAME SKY); Yaobian are for making (KILN, RULE, PLUMB).
- The door is not an exhibition of its own, but it is made with the same care as one.
- The album is 照, in English Daykiln (daykiln.renocrypt.com). On the page the name is set only in the running head. Otherwise public text names only works and people, never movements or styles.
- A seal is carved to the standard of seal carving, pressed blind, or left out. The vermilion 「版」 goes only on finished plates.
- Refused: glow and additive light that nothing emits, decorative blur, titles inside the experience, automatic tours, navy and cyan, and the worn motifs (dragons, jade, lotus, silk, "zen", paper-cut folk art).
- Fonts come from Fontshare, jsDelivr or this repository, never Google Fonts.
- Each series keeps its own `LOOK.md`, and Yaobian its rules for the pieces in [yaobian/AGENTS.md](yaobian/AGENTS.md); the door's rules are in [door/README.md](door/README.md).

## Workspace

- This is the project. Plates and Yaobian were built as projects of their own, at `../plates` and `../yaobian`; those are finished and archived, and nothing is done in them. Their work goes on here, in `plates/` and `yaobian/`.
- Temporary files go in `$TMPDIR/daykiln/`; renders in `$TMPDIR/daykiln/renders/`. Nothing stray enters the project.
- In Chrome, use only your own tabs and close them after use. Mute page audio when testing.
- Test both editions (light and dark colour schemes), a phone in both orientations, a tablet, and a wide desktop.
- Documents state what is true now, briefly, in English.

## Commands

Run from this folder, never from its parent: the parent has no Vite of its own, and `npx` would fetch another.

- Dev server: `npx vite` → http://127.0.0.1:5196. In the sandbox the watcher gets no file events: run `DAYKILN_POLL=1 npx vite` to watch by polling.
- Type-check and build: `npm run check`
- Tools that fetch (`door/tools/wall.ts`) need `NODE_USE_ENV_PROXY=1` in the sandbox, and the host in its allowed domains.

## Publishing

- The repository is `renocrypt/daykiln` on GitHub. A push to `main` runs `.github/workflows/pages.yml`: `npm ci`, `npm run check`, and `dist/` published to GitHub Pages.
- The address is `daykiln.renocrypt.com` (`public/CNAME`): a CNAME in Cloudflare's `renocrypt.com` zone to `renocrypt.github.io`, proxy off, made with armada's `bin/cf` and noted in armada's `edge/cloudflare/renocrypt.com/daykiln.md`. GitHub issues the certificate; HTTPS is enforced. To take the site down, remove the DNS record and the Pages custom domain together.
- Commits carry the GitHub noreply address.

## Map

- `index.html`, `door/`: the door.
- `plates/`, `public/plates/`: the Plates rooms, under `/plates/`.
- `yaobian/`, `public/yaobian/`: the Yaobian rooms, under `/yaobian/`.
- `door/works.ts`: the six works, for every head, the structured data, the sitemap and `llms.txt`.
- `public/door/leaves/`, `public/door/cards/`: the six leaves and their share cards, made by `door/tools/leaves.ts`.
- `public/door/card.jpg`, `icon-*.png`, `public/favicon.ico`: the door's share card and icons, made by `door/tools/card.ts` and `icon.ts`.
- `public/door/wall/`: the entrance's wall, made by `door/tools/wall.ts`.
- `public/door/zhao/`: the strokes of the last word, 照, kept as hanzi-writer-data publishes them, with their licence (`ARPHICPL.TXT`), which must stay beside them.
