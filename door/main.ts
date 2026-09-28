/**
 * The door: one album of six leaves, played from the kiln out into the day (stage.ts).
 *
 * First the kiln's eye: the view holds on one round lens, in the fire's light, and Yaobian 一–三
 * pass behind it in turn, each brought to rest. Then the sheet runs on, out of the fire and into a
 * shadow where it is burnt open; as the view comes down the burn goes back, as Shen Kuo's burning
 * mirror burnt it but backwards: it draws in to one point in the middle of the view, and the point
 * is daylight, gathered, which opens into a disk and is lost in the day. Then 展, the unfolding:
 * Plate I lies on the page, and II and III are folding plates, unfolded one after the other while
 * the eye draws back to watch them turn and the day goes over them, from morning to evening; last,
 * the eye takes in the whole of it opened out, and comes down to the colophon. Nothing of this is
 * said on the page.
 *
 * There are two editions of the album: the plain sheet, and the sheet taken as a rubbing, inked
 * black on everything that stands up. The light is the same on both.
 *
 * Anime.js writes targets. Damping writes currents. The mount reads currents.
 */

import { animate, cubicBezier, utils } from 'animejs';
import { damp } from './damp.ts';
import { measure, type Layout, type Rect } from './layout.ts';
import { Mount } from './mount.ts';
import { ALBEDO, INK, PAPER, RUBBING, breath, css, daylight, flat, smoothstep, sunAt, type RGB, type Sun } from './light.ts';
import { back, go, lay, lift, pose, type Lifted } from './enter.ts';
import { locate, pageAt, stage, type Stage } from './stage.ts';
import { word } from './word.ts';

/** The door's one curve for whatever is set going rather than scrubbed: away at once, and a long quiet arrival. */
const SETTLE = cubicBezier(0.16, 0.84, 0.24, 1);

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const root = document.documentElement;
const door = document.querySelector<HTMLElement>('.door')!;
const pictures = door.querySelector<HTMLElement>('.pictures')!;
const inks = [...door.querySelectorAll<HTMLElement>('.ink')]; // the running head, and what is printed on the mount
const ink = door.querySelector<HTMLElement>('.ink:not(.head)')!;
const canvas = door.querySelector<HTMLCanvasElement>('.mount')!;
const colophon = door.querySelector<HTMLElement>('.colophon')!;
const length = document.querySelector<HTMLElement>('.length')!;
const leaves = [...pictures.querySelectorAll<HTMLAnchorElement>('.leaf')];
const images = leaves.map((l) => l.querySelector('img')!);
const labels = leaves.map((l) => ink.querySelector<HTMLElement>(`.label[data-for="${l.id}"]`)!);
const running = door.querySelector<HTMLElement>('.running')!; // the running head: the album's name, and its edition
const editions = [...running.querySelectorAll('button')];
const tint = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')!;
const layer = Object.assign(document.createElement('div'), { className: 'lift' });
door.append(layer);

const mount = Mount.create(canvas);
if (!mount) root.classList.add('flat');

history.scrollRestoration = 'manual'; // the door opens at its head, or at the leaf you come back to

// ---------------------------------------------------------------------------------------------
// Where things lie.

let layout!: Layout;
let dpr = 1;
const snap = (v: number) => Math.round(v * dpr) / dpr;
const snapRect = (r: Rect): Rect => {
  const x = snap(r.x), y = snap(r.y);
  return { x, y, w: snap(r.x + r.w) - x, h: snap(r.y + r.h) - y };
};

function place(): void {
  dpr = Math.min(devicePixelRatio || 1, 2);
  const W = door.clientWidth, V = door.clientHeight;
  const m = measure(W, V, colophon.offsetHeight);
  layout = { ...m, windows: m.windows.map(snapRect), labels: m.labels.map((l) => ({ x: snap(l.x), y: snap(l.y) })) };
  root.style.setProperty('--hair', `${1 / dpr}px`);
  root.classList.toggle('portrait', layout.portrait);
  const vars = (el: HTMLElement, o: Record<string, number>) => { for (const k in o) el.style.setProperty(`--${k}`, String(o[k])); };
  leaves.forEach((l, i) => { vars(l, layout.windows[i]); l.classList.toggle('round', layout.round[i]); });
  labels.forEach((l, i) => { vars(l, layout.labels[i]); l.classList.toggle('round', layout.round[i]); });
  vars(colophon, { x: snap(layout.colophon.x), y: snap(layout.colophon.y) });
  vars(running, { x: snap(layout.head.x), w: snap(layout.head.w), y: snap(layout.head.y) });
  length.style.height = `${layout.length}px`;
  mount?.resize(W, V, dpr);
  mount?.setLayout(layout);
  painted.x = painted.y = painted.k = NaN;
  apply();
  measureLetters();
  drawn = NaN;
  root.classList.add('placed');
}

/** A window where it is on the screen now. */
const onScreen = (i: number): Rect => {
  const r = layout.windows[i], { x, y, k } = at.camera;
  return { x: (r.x - x) / k + layout.W / 2, y: (r.y - y) / k + layout.V / 2, w: r.w / k, h: r.h / k };
};
/** Where the view's top left is on the sheet, as it is when the eye is at rest. */
const corner = () => ({ x: at.camera.x - layout.W / 2, y: at.camera.y - layout.V / 2 });

// ---------------------------------------------------------------------------------------------
// The state of the album. Targets are written by events and by Anime.js; the loop damps toward them.

let target = scrollY, current = scrollY, shown = 0, drawn = NaN;
/** Where the page's scroll has put the album: the sheet (on the device pixel grid), the lens's strip, the day. */
let at: Stage = { camera: { x: 0, y: 0, k: 1 }, fold: [Math.PI, Math.PI], strip: 0, settled: 1, plate: 0, still: 0, sun: 0, write: 0 };
let sun: Sun = sunAt(0);
/** Where the pictures and the lettering were last put: the camera as the page has it painted. */
const painted = { x: 0, y: 0, k: 1 };
let locked = false;
/** Per leaf: its picture laid in the window, lifted out of it, the pointer over it (damped, and not), the keyboard on it. */
const leafs = leaves.map(() => ({ laid: 0, lifted: 0, hover: 0, hovering: 0, reached: 0 }));
const revealed = leaves.map(() => false);
const view = { fade: 0 };
let busyUntil = 0;
const busy = (ms: number) => { busyUntil = Math.max(busyUntil, performance.now() + ms); };

const RETURN = 'daykiln:return';
const lum = (c: RGB) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const ADAPTED = lum(ALBEDO) / lum(INK); // how much more light the eye lets through on ink than on paper

// ---------------------------------------------------------------------------------------------
// Pictures laid in, and labels.

function layIn(i: number, o: { delay?: number; duration?: number } = {}): Promise<void> {
  const img = images[i];
  const duration = reduced || !mount ? 0 : (o.duration ?? 900);
  return new Promise((done) => {
    if (duration === 0) { img.style.opacity = '1'; leafs[i].laid = 1; drawn = NaN; done(); return; }
    busy((o.delay ?? 0) + duration + 50);
    animate(img, { opacity: [0, 1], scale: [1.012, 1], delay: o.delay ?? 0, duration, ease: SETTLE });
    animate(leafs[i], { laid: 1, delay: o.delay ?? 0, duration, ease: SETTLE, onComplete: () => done() });
  });
}

/** Print a leaf's label: the numeral, then the name. */
function reveal(i: number, quick = false): void {
  if (revealed[i]) return;
  revealed[i] = true;
  const [n, t] = labels[i].children as unknown as HTMLElement[];
  utils.remove([n, t]);
  if (reduced || quick) {
    for (const e of [n, t]) animate(e, { opacity: 1, duration: quick ? 0 : 200, ease: 'linear' });
    return;
  }
  animate(n, { opacity: 1, duration: 700, ease: SETTLE });
  animate(t, { opacity: 1, delay: 140, duration: 700, ease: SETTLE });
}

/** Lift it again, quicker than it was printed. */
function unprint(i: number): void {
  if (!revealed[i]) return;
  revealed[i] = false;
  const both = [...labels[i].children] as HTMLElement[];
  utils.remove(both);
  for (const e of both) animate(e, { opacity: 0, duration: reduced ? 0 : 220, ease: SETTLE });
}

// A label is its picture's, printed while the picture is at rest before the eye and lifted when it
// goes: behind the lens, as it comes to rest there; on the plates, as each lies flat with the eye
// come in to it. A plate's label is printed on the sheet, and does not turn with its leaf.
function readLabels(): void {
  const lens = at.settled > 0.6 && leafs[0].laid >= 1 ? Math.round(at.strip) : -1;
  const plate = at.still > 0.5 && at.camera.y - layout.V / 2 > layout.focus.y ? 3 + at.plate : -1;
  for (let i = 0; i < 6; i++) {
    if (i === lens || (i === plate && leafs[i].laid >= 1)) reveal(i);
    else if (i < 3 || i !== plate) unprint(i);
  }
}

// ---------------------------------------------------------------------------------------------
// Going in and coming back.

let away: Lifted | null = null;

function lock(on: boolean): void {
  locked = on;
  root.style.overflow = on ? 'hidden' : '';
  if (on) target = current;
}

/** The light a picture lies in, for it to keep as it is lifted. */
function lightOf(i: number): { top: string; bottom: string; shadow: [number, number] } {
  const r = layout.windows[i];
  const light = (y: number) => flat({
    x: r.x + r.w / 2, y, sheet: corner(), W: layout.W, V: layout.V,
    focus: layout.focus, shade: layout.shade, fire: layout.fire, kindled: kindled(), time: performance.now() / 1000, light: sun.light,
  });
  const day = daylight(r.x + r.w / 2, r.y + r.h / 2, layout.focus, layout.shade, layout.fire[0]);
  // Away from the light: away from the sun as the day has it, up under the fire below.
  const len = Math.hypot(sun.dir[0], sun.dir[1]);
  const shadow: [number, number] = [-sun.dir[0] / len * day, -sun.dir[1] / len * day - (1 - day)];
  return { top: css(light(r.y)), bottom: css(light(r.y + r.h)), shadow };
}

/** A leaf asked for while the lens's strip is between rests: it is brought to rest first. */
let asked = -1;

function enter(i: number): void {
  if (away || locked) return;
  const elsewhere = i < 3 ? Math.abs(at.strip - i) > 0.01 : at.still < 1 || at.plate !== i - 3;
  if (!reduced && elsewhere) {
    asked = i;
    scrollTo({ top: layout.rests[i], behavior: 'instant' });
    return;
  }
  asked = -1;
  const href = leaves[i].href;
  sessionStorage.setItem(RETURN, leaves[i].id);
  if (reduced) { location.href = href; return; }
  lock(true);
  away = lift(i, leaves[i], layer, mount ? lightOf(i) : { top: '#fff', bottom: '#fff', shadow: [0.5, 0.8] });
  leafs[i].lifted = 1;
  drawn = NaN;
  busy(1200);
  go(away, () => onScreen(i), layout.W, layout.V, () => { location.href = href; });
}

/** Back from a work: from the whole view into its window. */
function comeBack(l: Lifted): void {
  lock(true);
  busy(1300);
  back(l, () => onScreen(l.index), layout.W, layout.V, () => {
    lay(l);
    leafs[l.index].lifted = 0;
    drawn = NaN;
    away = null;
    lock(false);
    reveal(l.index, true);
  });
}

leaves.forEach((leaf, i) => {
  leaf.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    enter(i);
  });
  leaf.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') leafs[i].hovering = 1; });
  leaf.addEventListener('pointerleave', () => { leafs[i].hovering = 0; });
  // Reached by the keyboard, a leaf is ruled round and brought to rest in the middle of the view.
  leaf.addEventListener('focus', () => {
    if (!leaf.matches(':focus-visible') || locked) return;
    leafs[i].reached = 1;
    drawn = NaN;
    if (Math.abs(scrollY - layout.rests[i]) > 1) scrollTo({ top: layout.rests[i], behavior: 'instant' });
  });
  leaf.addEventListener('blur', () => { leafs[i].reached = 0; drawn = NaN; });
});

addEventListener('pageshow', (e) => {
  if (!e.persisted) return;
  if (away) comeBack(away);
  else lock(false);
});

// ---------------------------------------------------------------------------------------------
// The edition: the plain sheet, or the rubbing. The reader's choice, kept; or else the system's.
// The page was told which before it was painted, in index.html.

type Edition = 'paper' | 'rubbing';
const EDITION = 'daykiln:edition';
const dark = matchMedia('(prefers-color-scheme: dark)');
const system = (): Edition => (dark.matches ? 'rubbing' : 'paper');
let edition: Edition = root.dataset.edition === 'rubbing' ? 'rubbing' : 'paper';
const sheet = { rubbing: edition === 'rubbing' ? 1 : 0 };

function mark(): void {
  editions.forEach((b) => b.setAttribute('aria-pressed', String(b.value === edition)));
  // While the entrance's veil is up, the browser's own chrome is the kiln's wall; it gives it back.
  if (!document.getElementById('entrance')) tint.content = edition === 'rubbing' ? RUBBING : PAPER;
}

/** Take the rubbing, or take the ink up again. The lettering lifts while it is done, and is set again after. */
function publish(next: Edition): void {
  if (next === edition) return;
  edition = next;
  mark();
  const to = next === 'rubbing' ? 1 : 0;
  if (reduced || !mount) { root.dataset.edition = next; sheet.rubbing = to; letter(performance.now() / 1000); drawn = NaN; return; }
  busy(1600);
  animate(sheet, { rubbing: to, duration: 1500, ease: 'inOut(2)' });
  animate(inks, {
    opacity: 0, duration: 280, ease: 'out(2)',
    onComplete: () => {
      root.dataset.edition = next;
      letter(performance.now() / 1000);
      animate(inks, { opacity: 1, delay: 700, duration: 600, ease: 'out(2)' });
    },
  });
}

editions.forEach((b) => b.addEventListener('click', () => {
  const next = b.value as Edition;
  // Chosen as the system has it, the choice is not kept: the album follows the system again.
  try { if (next === system()) localStorage.removeItem(EDITION); else localStorage.setItem(EDITION, next); } catch { /* not kept */ }
  publish(next);
}));
const kept = (): string | null => { try { return localStorage.getItem(EDITION); } catch { return null; } };
dark.addEventListener('change', () => { if (!kept()) publish(system()); });
addEventListener('storage', (e) => { if (e.key === EDITION) publish((e.newValue as Edition | null) ?? system()); });
mark();

// In the rubbing the lettering is cut into the sheet, so it is paper, in whatever light is where it lies.
const lettered = [...door.querySelectorAll<HTMLElement>('.label .n, .label .t, .zh, .quote figcaption p, .works li > span, .set, .imprint, .edition button')];
lettered.forEach((el) => el.classList.add('cut'));
let letters: { el: HTMLElement; x: number; top: number; bottom: number; was: string }[] = [];

function measureLetters(): void {
  letters = lettered.map((el) => {
    const r = el.getBoundingClientRect();
    // Back from the screen to the sheet, through the camera the page was painted with.
    const k = painted.k, x = painted.x - (layout.W / 2) * k, y = painted.y - (layout.V / 2) * k;
    return { el, x: x + (r.left + r.width / 2) * k, top: y + r.top * k, bottom: y + r.bottom * k, was: '' };
  });
}

function letter(time: number): void {
  if (edition !== 'rubbing' || !mount) return;
  const k = kindled();
  const paper = (x: number, y: number) => css(flat({
    x, y, sheet: corner(), W: layout.W, V: layout.V,
    focus: layout.focus, shade: layout.shade, fire: layout.fire, kindled: k, time, light: sun.light,
  }).map((v, i) => v * ALBEDO[i]) as RGB);
  for (const l of letters) {
    const { x: cx, y: cy, k: ck } = at.camera;
    if (l.bottom < cy - (ck * layout.V) / 2 - 40 || l.top > cy + (ck * layout.V) / 2 + 40 || Math.abs(l.x - cx) > ck * layout.W) continue;
    const lit = `linear-gradient(${paper(l.x, l.top)}, ${paper(l.x, l.bottom)})`;
    if (lit === l.was) continue;
    l.was = lit;
    l.el.style.setProperty('--lit', lit);
  }
}

// ---------------------------------------------------------------------------------------------
// The light.

/** The kiln is burning from the start: it is the fire the entrance goes through. */
function kindled(): number {
  return 1;
}

function frame(time: number): void {
  if (!mount) return;
  const L = layout;
  const centre = at.camera.y;
  const F = L.focus.y;

  // The burning mirror's work, run backwards as the view comes down from the kiln: the sheet is burnt
  // open below the fire, and the burn goes back as the view comes on, its line drawing in, the char
  // turning back to paper, until at the middle of the view it is one point; there the point is
  // gathered daylight, which opens into a disk and is lost in the day. It goes with the view, both
  // ways, and is the same each time.
  const above = F - centre;
  const room = F - (L.windows[0].y + L.windows[0].h); // it does not reach the lens
  const reach = 0.8 * room;
  const burnR = above > 0 ? reach * (1 - Math.exp((-1.3 * above) / reach)) : 0;
  const glow = above > 0 ? 0.4 + 0.6 * Math.exp(-above / (0.5 * L.V)) : 0;

  // The gathered daylight is shown as the eye takes it, adapted to the sheet: on paper the disk stays
  // paper, lit very bright, until the last of it, which is white; on ink the eye has more to give,
  // and the disk comes up out of the black as it narrows.
  const gathered = above > 0 ? Math.exp(-above / 12) : smoothstep(F + L.shade.outer, F + 0.5 * L.shade.inner, centre);
  const r = 5 + 0.35 * Math.max(-above, 0);
  const gather = (gathered * 0.05 * L.V * L.V) / (Math.PI * r * r);
  const ceiling = 1.05 * (1 + (ADAPTED - 1) * sheet.rubbing);
  const intensity = ceiling * (1 - Math.exp(-gather / ceiling)) * (1 + 3 * smoothstep(16, 6, r));
  const preheat = smoothstep(70, 8, r) * gathered;

  // The lens is one window for Yaobian's three: laid once KILN is, empty while any of them is lifted
  // out of it, attended to while any of them is. The two windows it stands for are not cut.
  const yaobian = leafs.slice(0, 3);
  const most = (f: (l: typeof leafs[number]) => number) => Math.max(...yaobian.map(f));
  const lens = [leafs[0].laid, most((l) => l.lifted), most((l) => l.hover), most((l) => l.reached)];
  mount.draw({
    camera: at.camera,
    fold: at.fold,
    open: smoothstep(L.sheet.row - 0.5 * L.V, L.sheet.row, at.camera.y - L.V / 2),
    write: at.write,
    strip: at.strip,
    settled: at.settled,
    sun,
    time,
    fade: view.fade,
    states: [lens, [0, 0, 0, 0], [0, 0, 0, 0], ...leafs.slice(3).map((l) => [l.laid, l.lifted, l.hover, l.reached])],
    rubbing: sheet.rubbing,
    kindled: kindled(),
    breath: reduced ? 1 : breath(time),
    disk: { r, intensity, preheat },
    burn: { r: burnR, glow, seed: 0.37 },
  });
  letter(time);
  drawn = shown;
}

// ---------------------------------------------------------------------------------------------
// The loop.

let sunOf = NaN, front = -1, slid = NaN;

/** Play the album to where the page is: the sheet, the lens's strip, the day. */
function apply(): void {
  const s = stage(layout, shown);
  const W = layout.W, V = layout.V;
  // At rest the view's corner falls on the device pixel grid, so the sheet is drawn sharp.
  const cam = s.camera.k === 1 ? { x: snap(s.camera.x - W / 2) + W / 2, y: snap(s.camera.y - V / 2) + V / 2, k: 1 } : s.camera;
  at = { ...s, camera: cam };
  if (at.sun !== sunOf) { sunOf = at.sun; sun = sunAt(at.sun); }
  if (cam.x !== painted.x || cam.y !== painted.y || cam.k !== painted.k) {
    painted.x = cam.x;
    painted.y = cam.y;
    painted.k = cam.k;
    const t = cam.k === 1
      ? `translate3d(${W / 2 - cam.x}px, ${V / 2 - cam.y}px, 0)`
      : `translate3d(${W / 2}px, ${V / 2}px, 0) scale(${1 / cam.k}) translate3d(${-cam.x}px, ${-cam.y}px, 0)`;
    pictures.style.transform = t;
    for (const i of inks) i.style.transform = t;
  }
  // A plate answers the pointer only while it lies flat with the eye at rest on it.
  pictures.classList.toggle('turning', at.still < 1 && at.camera.y - V / 2 > layout.focus.y);
  // The leaf behind the lens is the one the pointer finds there. Until the mount draws the strip
  // (or without it), the pictures themselves slide past in their circle.
  const f = Math.round(at.strip);
  if (f !== front) { front = f; leaves.slice(0, 3).forEach((l, i) => l.classList.toggle('front', i === f)); }
  if (at.strip !== slid) { slid = at.strip; leaves.slice(0, 3).forEach((l, i) => l.style.setProperty('--off', String(i - at.strip))); }
}

let last = performance.now();
function loop(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (!locked) target = scrollY;
  current = reduced ? target : damp(current, target, 0.085, dt);
  if (Math.abs(current - target) < 0.01) current = target;
  const s = snap(current);
  if (s !== shown) {
    shown = s;
    apply();
  }
  if (asked >= 0 && Math.abs(current - target) < 0.5) enter(asked);

  let moving = false;
  for (const l of leafs) {
    const h = reduced ? l.hovering : damp(l.hover, l.hovering, 0.07, dt);
    l.hover = Math.abs(h - l.hovering) < 0.002 ? l.hovering : h;
    if (l.hover !== l.hovering) moving = true;
  }

  readLabels();

  // The fire breathes, and the burn's embers glow and go out, as long as either is in view; so do
  // the embers of the last word's fire while it is being written.
  const alive = (at.camera.y - layout.V / 2 < layout.focus.y || (at.write > 0 && at.write < 1.08)) && !reduced;
  if (mount && (shown !== drawn || moving || now < busyUntil || alive || view.fade < 1)) frame(now / 1000);
  requestAnimationFrame(loop);
}

// ---------------------------------------------------------------------------------------------
// The last word: 照, written into the foot of the album as the reader comes to it (word.ts).

async function impression(): Promise<void> {
  if (!mount) return;
  const size = 512;
  const mask = await word(size);
  if (!mask) return;
  mount.setGlyph(mask, size);
  drawn = NaN;
}

// ---------------------------------------------------------------------------------------------
// Opening.

place();
document.fonts.ready.then(place);
let resizing = 0;
addEventListener('resize', () => {
  cancelAnimationFrame(resizing);
  resizing = requestAnimationFrame(() => {
    const where = locate(layout, current);
    place();
    target = current = pageAt(layout, where);
    scrollTo({ top: target, behavior: 'instant' });
  });
});
impression();

// Once a picture has come, the mount carries it: it draws Yaobian's behind the lens, and the
// plates in their windows as their leaves turn. The picture under the mount is hidden then, and is
// seen as itself only when it is lifted out.
function carry(i: number): void {
  const img = images[i];
  if (!mount || !img.naturalWidth) return;
  mount.carry(i, img);
  leaves[i].classList.add('carried');
  drawn = NaN;
}
const ready = images.map((img, i) => img.decode().catch(() => {}).then(() => carry(i)));
// A wider view may bring a larger picture.
images.forEach((img, i) => img.addEventListener('load', () => { if (leaves[i].classList.contains('carried')) carry(i); }));

const returning = sessionStorage.getItem(RETURN);
sessionStorage.removeItem(RETURN);
const home = leaves.findIndex((l) => l.id === returning);

if (home >= 0) {
  // Back from a work, in a fresh page: open on its leaf, covered by it, and lay it back.
  scrollTo({ top: layout.rests[home], behavior: 'instant' });
  target = current = shown = snap(scrollY);
  apply();
  view.fade = 1;
  images.forEach((img, i) => { img.style.opacity = '1'; leafs[i].laid = 1; });
  away = lift(home, leaves[home], layer, mount ? lightOf(home) : { top: '#fff', bottom: '#fff', shadow: [0.5, 0.8] });
  away.up = away.out = 1;
  leafs[home].lifted = 1;
  pose(away, onScreen(home), layout.W, layout.V);
  ready[home].then(() => comeBack(away!));
} else {
  scrollTo({ top: 0, behavior: 'instant' });
  target = current = 0;
  animate(view, { fade: 1, duration: reduced ? 0 : 350, ease: 'linear' });
  busy(400);
  ready[0].then(() => layIn(0, { delay: 250 })).then(() => {
    setTimeout(() => reveal(0), reduced ? 0 : 350);
  });
  // The rest are laid in as they arrive: out of sight at once, in sight as the first was, quicker.
  ready.slice(1).forEach((picture, k) => {
    const i = k + 1;
    picture.then(() => {
      const r = onScreen(i);
      const seen = r.y < layout.V && r.y + r.h > 0;
      layIn(i, seen ? { duration: 600 } : { duration: 0 });
    });
  });
}

if (!mount) images.forEach((img, i) => { img.style.opacity = '1'; leafs[i].laid = 1; });
requestAnimationFrame(loop);

// The entrance, if index.html put its veil up: drawn over the door as it opens, until the first
// picture is laid in.
const veil = document.getElementById('entrance');
if (veil) import('./entrance.ts').then((m) => m.enter(veil, () => leafs[0].laid >= 1)).catch(() => veil.remove());
