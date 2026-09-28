# The door

One album of six leaves, played by the scroll in three acts, from the kiln out into the day.

1. **The kiln's eye.** The view holds on one round window, glazed with a lens, the spy-hole the album is entered by, in the light of the kiln's fire. Yaobian 一–三 lie behind it on one strip, and as the page is scrolled the strip slides behind the glass, each picture coming to rest in turn. Moving, the single glass bows straight edges and fringes them red and blue; at rest it is corrected, as an achromat is.
2. **The burn.** The sheet runs on down out of the fire into a shadow, where it is burnt open. As the view comes down, the burn runs backwards, as Shen Kuo's burning mirror burnt it: its line of embers draws in and the char goes back to paper, until in the middle of the view it is one point. The point is daylight, gathered; it opens into a disk and is lost as the shadow opens round.
3. **展, the unfolding.** Plate I lies on the page. Plates II and III are folding plates, as a large plate is bound into a book: tipped in and folded back behind the page. II is unfolded out to the right, on its fold at the page's edge; III down, on its fold at II's foot. As each leaf turns the eye draws back to watch it, sees it in perspective and from behind as it comes round, and comes in again as it lies flat. The day goes over them: low morning light from the left, noon from high up, low warm evening from the right; a turning leaf is lit as it faces, the page shades what lies behind it, and the board beyond takes the album's shadow. Last the eye draws right back to see the whole of it opened out, the three plates and the colophon beside the last, and comes down to the colophon.

Then the sheet runs on down, in evening light, through the colophon to its foot, and there the eye holds for the last word. 照 is 日 over 召 over 灬, the sun and fire: day and kiln. It is written into the sheet as the page is scrolled, stroke by stroke in the order a brush writes it: 日 and 召 pressed blind, and the four dots of 灬 burnt in, each along its stroke, an ember where the burning has got to, and scorch left when it goes out. Everything goes with the scroll, both ways, the same each time. Nothing of this is said on the page: the page names only the works and the people they come from.

## The entrance

Once a session, the door is entered through the kiln's eye (`entrance.ts`, `kiln.frag`). An inline script at the head of `<body>` puts a veil over the door before it is painted: the kiln's bricked door at night, dark. On it the fire comes up in the spy-hole, and a meiping on its shelf shows in the fire, while the door opens underneath. Once the first picture is laid in (or after 3.5 s), the view goes up to the eye and through it, into the fire, until it is white. Then the veil stops covering the door and brightens it, by `mix-blend-mode: color-dodge`, and the door comes up out of the glare as an exposure does, its darks first: KILN, in the kiln's light. It lasts about 3.3 s, and any wheel, key, click or touch hurries what is left into 0.35 s.

- **Nothing waits for it.** The door, its text and its first picture load and open under the veil, which is `aria-hidden`; the first picture is still the page's largest paint.
- **It is skipped** coming back from a work, under reduced motion, and without WebGL2. It is marked in `sessionStorage` (`daykiln:entered`) when the veil goes up. If its script never comes to draw, the veil goes by itself after 7 s (`door.css`).
- **The wall** is photographed brick, Poly Haven's "Castle Brick 02 Red" (CC0), cut round the brick the eye goes through (`tools/wall.ts`, `public/door/wall/`, 380 kB). It is fetched at low priority after everything the door needs; until it arrives the fire burns on a bare dark wall. The fire's light rakes the brick from the hole, so near it the bricks' tops catch and the joints are in shadow.
- **In development**, `?t=1.4` holds it at 1.4 s and `?slow=4` plays it at a quarter the pace.

## How it is drawn

The pictures lie behind the mount. The mount is a WebGL2 canvas, multiplied onto them: where it is light, the pictures show through, so its windows are simply where it is white, and the light on the mount is the light on the pictures. The labels and the colophon lie above it.

- **The sheet** is made once into a tile of handmade paper (`paper.frag`), then turned into the slopes the light sees (`grain.frag`).
- **Every frame**, `mount.frag` draws the windows with their bevels, the laid and chain lines, the daylight and its shadow, the disk, the burn, the fire and the last word over the tile.
- **The last word** (`word.ts`): the strokes of 照 are Make Me a Hanzi's, after Arphic's regular script, as hanzi-writer-data publishes them; they are kept as published, with their licence, in `public/door/zhao/` (`ARPHICPL.TXT` must stay beside `zhao.json`). `word.ts` draws them once into a half-float texture: where the character lies, blurred into a pressed shoulder; when the brush reaches each point, strokes in order and each along its median, the brush lifted a moment between them and the fire's dots given longer; and which parts are fire. The mount writes it to `write`, which the score runs from 0 to a little past 1 over 1.9 views, in a hold of 2.3 at the foot.
- **The light** is physical (`light.ts`): black bodies at their colour temperatures (fire 1850 K, embers 2700 K; the day 4700 K in the morning, 5600 K at noon, 3300 K in the evening), each adapted to by the eye only in part. The paper's albedo is fixed so that under noon's light it reads `#e9e3d6`. Nothing glows that does not emit.
- **Motion:** the page scrolls natively; the album follows the scroll, damped (`damp.ts`), and `stage.ts` turns the page's scroll into the play: where the sheet is, where the lens's strip is, and the time of day. Anything scrubbed is linear in the scroll, its moves only rounded at their ends. A label printed or a picture laid in runs on the door's curve, `cubic-bezier(.16, .84, .24, 1)`: away at once, and a long quiet arrival. Anime.js writes targets, damping writes currents, the mount reads currents.

## The two editions

The album comes in two editions of one sheet, chosen in the running head over the first window.

- **素 Paper:** the plain sheet.
- **拓 Rubbing:** the sheet taken as a rubbing, inked black on everything that stands up. The lettering and 照 are cut into the sheet, so they stay paper, in whatever light lies there. The light is the same on both.

The edition follows the system's colour scheme until the reader chooses; the choice is kept in `localStorage` (`daykiln:edition`) only while it differs from the system's. An inline script in `index.html` sets `data-edition` on `<html>` and the theme colour before the page is painted. Changing edition inks the sheet from its fibres up, or takes the ink up again; the lettering lifts while it is done.

On ink the eye opens: the disk's perceptual ceiling is raised by the ratio of paper to ink luminance, so the gathered daylight still reads as the brightest thing on the sheet.

## Layout

`layout.ts` places everything on the sheet, in CSS pixels from its top left, and measures the page that plays it. It is one function of the view's width and height; `main.ts` calls it again on resize and keeps the reader at the same place in the same act. Until it has first placed the album, `.door` is hidden (`.placed` on `<html>`), so the first paint is bare paper and nothing moves after it.

- **The score** (`stage.ts`): the lens's act is 3.2 views of scroll: a rest of 0.35, a move of 1, a rest of 0.5, a move of 1, a rest of 0.35. The unfolding is 5.75: a rest of 0.35 on I, 1.4 to unfold II, a rest of 0.5, 1.4 to unfold III, a rest of 0.4, and 1.7 to see the whole and come to the colophon. While a leaf turns, the eye draws back to 1.55 times its distance, and for the whole to 2.35. Between the holds the sheet runs down at the scroll's pace, leaving one hold and coming to the next over 0.3 of a view. Every work's rest is a place on the page (`rests`), which the keyboard, the way back from a work and resizing go to.
- **The lens:** one circle, as tall as the plates' windows, cut with the same bevel, which is a cone. Behind it the three Yaobian leaves lie on a strip, square, each composed for the circle (`tools/leaves.ts`), with a little of the board showing between them. The mount draws them through the glass (`mount.frag`, `throughLens`): the middle magnified 1.11×, the picture's edge gathered into the rim, red and blue bent apart the further out. At rest, or under the pointer or the keyboard, the lens is corrected as an achromat is: the fringes close, and only the faint green and purple of the secondary spectrum is left. The glass gives back small sharp images of the lights, and its ground edge shows dark just inside the bevel. The three leaves' links lie on the circle; the one behind the glass is on top (`.front`), and a label is printed for the picture at rest and lifted as it goes. Once the mount has a picture, the one under the mount is hidden (`.lensed`); without WebGL2 the pictures themselves slide past in the circle.
- **The plates:** Plate I on the page; II and III each on a leaf a view in size, placed as they lie unfolded, II to the right of I and III under II (`flaps`). On wide views (width at least 0.9 × height) a window is 16:10, the pictures' own shape, at most 60 % of the view's height and 62 % of its width, and its label runs down the margin beside it, as a title slip does. On tall views it takes nearly the whole width, cut 5:4 (at most 46 % of the height), and the label is set under it, numeral then name, as a print's title is pencilled under the plate. A label is printed while its plate lies flat with the eye at rest on it, and lifted when the eye leaves; the mount draws the plates' pictures itself (`.carried`), so they turn with their leaves. A plate answers the pointer only at rest.
- **The eye** (`mount.frag`): at rest a pixel is a point of the flat sheet. While a leaf turns or the eye draws back, each pixel is a ray from an eye set back 1.4 views before the sheet, met by the page, a turning leaf (front or back), or the board beyond; each face is shaded in its own frame, with the sun turned into it. The DOM layers are carried by the same camera, a CSS scale about the view's middle.
- **The colophon** lies under Plate I, beside III, its head level with III's window.
- **Every window** comes to rest with more paper above it than below (54 : 46).
- **The running head** sits over the plates' measure, above the lens: 照 Daykiln flush with its left edge, the edition with its right, clear of the top safe area. On a row narrower than 300 px the Latin name is hidden from sight and kept for assistive technology.

The colophon sets the two sentences 照 comes from vertically in Song type, with their translations beside them, or under them below 720 px.

## Going in and coming back

A leaf is a link to its work. Clicked, its picture is lifted out of the window in the light it lay in, casts a shadow away from that light, and grows to cover the view; then the work opens (`enter.ts`). A picture from the lens is lifted in its own frame, seen through the circle, which opens as it grows; it leaves magnified, as the lens showed it, and eases to its own size. Clicked while the strip is moving, the nearer picture is first brought to rest. The door records the leaf in `sessionStorage` (`daykiln:return`); a Yaobian piece's way back, "← 照 Daykiln", records it too. Coming back, the door opens on that leaf and lays the picture back into its window. The series have no pages of their own: `/plates/` and `/yaobian/` lead to the door.

## Access

- **Keyboard:** Tab reaches the edition first, then the leaves in order. A leaf reached by the keyboard is brought to its rest and ruled round by the mount; `.door` is clipped, so focus never scrolls it.
- **Reduced motion:** no entrance, and every state at once: no damping, no lifting, no flicker in the fire or the burn. The play still follows the scroll.
- **Without WebGL2:** a plain mount in either edition, the same album and links, without the light.
- The labels are hidden from assistive technology; each link carries its work's name.

## Files

| File | What it does |
|---|---|
| `main.ts` | State, events, the loop, the editions, going in and coming back |
| `layout.ts` | Where everything lies on the sheet, for wide and tall views, and how long the page is |
| `stage.ts` | The score: from the page's scroll, the camera, the lens's strip, the folding plates, and the time of day |
| `mount.ts` | The WebGL2 mount: the paper tile, the round windows' pictures, uniforms, drawing |
| `paper.frag`, `grain.frag` | The sheet, made once |
| `mount.frag` | The mount, every frame |
| `light.ts` | The lights and materials, in linear RGB |
| `works.ts` | The six works and what they come from, for the heads, structured data, sitemap and `llms.txt` |
| `enter.ts` | Lifting a picture out and laying it back |
| `entrance.ts`, `kiln.frag` | The entrance: the kiln's eye, drawn on the veil `index.html` puts up |
| `word.ts` | The last word, 照: its strokes, drawn into the texture the mount writes it from |
| `damp.ts` | Frame-rate independent damping |
| `door.css` | Type, labels, colophon, the running head, both editions, the plain fallback |
| `tools/leaves.ts` | Cuts the six leaves (the round windows' square), and each work's share card, from its stills |
| `tools/card.ts` | Makes the door's share card from a capture of the door |
| `tools/icon.ts` | Renders the icon, the kiln's eye, at each size, and `/favicon.ico` |
| `tools/wall.ts` | Cuts the entrance's wall from Poly Haven's brick |

## Working on it

In the sandbox the dev server's file watcher gets no file events. Start it from the project's folder as `DAYKILN_POLL=1 npx vite`, and it watches by polling; otherwise restart it after each edit.
