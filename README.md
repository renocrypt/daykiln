# 照 Daykiln

One door to two series of works: Yaobian 一–三 (KILN, RULE, PLUMB) and Plates I–III (UNFOLD, WAKE, SAME SKY). The door is an album read from the top down, from the kiln out into the day, entered once a session through the kiln's eye. Yaobian lie in the kiln's fire; below them, in the dark, the sheet is burnt open, and the burn runs back as the view comes down, as Shen Kuo's burning mirror burnt it, to one point of gathered daylight; past it the day opens, and Plates lie under it. Nothing of this is said on the page. See [door/README.md](door/README.md).

In English the album is Daykiln, at https://daykiln.renocrypt.com (`ORIGIN` in `vite.config.ts`). On the page the name is set only in the running head.

## Structure

| Path | What it is |
|---|---|
| `index.html`, [door/](door/README.md) | The door |
| `plates/`, `public/plates/` | The Plates rooms, served under `/plates/` |
| `yaobian/`, `public/yaobian/` | The Yaobian rooms, served under `/yaobian/` |
| `door/works.ts` | The six works: names, rooms and what each comes from, for everything the build writes about them |
| `public/door/leaves/` | One still of each work, made by `door/tools/leaves.ts` |
| `public/door/cards/`, `public/door/card.jpg` | Share cards: one per work, by `leaves.ts`, and the door's, by `door/tools/card.ts` |
| `public/door/icon-*.png`, `public/favicon.ico` | The icon, the kiln's eye, at each size, by `door/tools/icon.ts` |
| `public/door/wall/` | The entrance's wall, Poly Haven's "Castle Brick 02 Red" (CC0), by `door/tools/wall.ts` |
| `vite.config.ts` | One build for all three; Yaobian's own routes (`/yaobian/kiln/`, `/rule/`, `/plumb/`); every page's head; `robots.txt`, `sitemap.xml`, `llms.txt` |

`plates/` and `yaobian/` are the two series. They were built as projects of their own, at `../plates` and `../yaobian`, which are archived; they are worked on only here, rooted under `/plates/` and `/yaobian/`. They have no pages of their own: they are entered from the door, and `/plates/` and `/yaobian/` lead back to it. Their heads are written by the build, not in their files. Each keeps its own look, documents and `LOOK.md`.

The door links to these rooms:

| Leaf | Room |
|---|---|
| 一, KILN | `/yaobian/kiln/` |
| 二, RULE | `/yaobian/rule/` |
| 三, PLUMB | `/yaobian/plumb/` |
| I, UNFOLD | `/plates/lab/unfold-lookdev/` |
| II, WAKE | `/plates/lab/wake-still/` |
| III, SAME SKY | `/plates/lab/same-sky-room/` |

## Search and sharing

Everything a crawler needs is in the static HTML, since most do not run scripts. The door's head is in `index.html`; the `site()` plugin in `vite.config.ts` writes the rooms' heads, in development and in the build: a title, a description naming the work and what it comes from, a canonical URL, Open Graph and Twitter cards with the work's card, and JSON-LD. The door's JSON-LD holds the album as a collection of six works in two series, each based on its source and that source's maker. Lab studies the door does not link to are `noindex`.

Yaobian routes in the browser, so the build writes a copy of its page for each room (`/yaobian/kiln/index.html` and so on), each with its own head. `robots.txt`, `sitemap.xml` and `llms.txt` are made from `door/works.ts`.

## Commands

Run everything from this folder.

- Dev server: `npx vite` → http://127.0.0.1:5196
- Type-check and build: `npm run check`
- Preview the build: `npx vite preview` → http://127.0.0.1:5197
- Remake the leaves and the works' cards: `node door/tools/leaves.ts`
- Remake the door's card: capture the door as `door/tools/card.ts` describes, then `node door/tools/card.ts`
- Remake the icons: `node door/tools/icon.ts`
- Remake the entrance's wall: `node door/tools/wall.ts` (it fetches from Poly Haven; in a sandbox that proxies the network, prefix `NODE_USE_ENV_PROXY=1`)

The door and both series must be served from one origin, `ORIGIN`: the door keeps state in `sessionStorage` across the rooms. The host must serve a folder's `index.html` at its path with a trailing slash (`/yaobian/kiln/`).
