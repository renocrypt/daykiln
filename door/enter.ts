/**
 * Going in, and coming back.
 *
 * A picture is lifted out of its window, in the light it was lying in, and its shadow falls on
 * the mount away from that light. Then it grows until it is the whole view, and the work it
 * belongs to opens. Coming back is the same, backwards: the view shrinks into the picture, the
 * picture is laid back in its window. A picture from a round window is lifted whole, in its own
 * frame, seen through the circle it lay behind, and the circle opens as it grows; if it was seen
 * through the window's lens, it is lifted as the lens showed it, magnified, and eases to itself.
 */

import { animate } from 'animejs';

export type Rect = { x: number; y: number; w: number; h: number };

export type Lifted = {
  index: number;
  leaf: HTMLAnchorElement;
  img: HTMLImageElement;
  box: HTMLDivElement;
  face: HTMLDivElement; // what is seen of it: clipped to its circle, if it came from a round window
  tint: HTMLDivElement;
  /** From a round window: where the circle's middle is across the picture's own frame, as a share of the circle's diameter. */
  round: number | null;
  /** The picture's own width over its height. */
  aspect: number;
  /** 0 at rest in the window, 1 lifted off it. */
  up: number;
  /** 0 the size of its window, 1 the whole view. */
  out: number;
  shadow: [number, number];
};

const LIFT = 420, SPREAD = 720, OVERLAP = 300;
const LENS = 1 / 0.9; // mount.frag's LENS_MIDDLE

/** Take the picture out of its window and hold it above the mount, where it was. */
export function lift(index: number, leaf: HTMLAnchorElement, layer: HTMLElement, light: { top: string; bottom: string; shadow: [number, number] }): Lifted {
  const img = leaf.querySelector('img')!;
  const box = document.createElement('div');
  box.className = 'lifted';
  const face = document.createElement('div');
  face.className = 'face';
  const tint = document.createElement('div');
  tint.className = 'tint';
  tint.style.background = `linear-gradient(${light.top}, ${light.bottom})`;
  // The round window showed the picture's middle, moved across by its object-position: the picture
  // is `aspect` diameters wide, and the circle's middle lies this far into it.
  const aspect = img.naturalWidth / img.naturalHeight || 1;
  const shift = parseFloat(getComputedStyle(img).objectPosition) / 100;
  const round = leaf.classList.contains('round') ? (Math.max(aspect, 1) - 1) * (Number.isFinite(shift) ? shift : 0.5) + 0.5 : null;
  face.append(img, tint);
  box.append(face);
  layer.append(box);
  return { index, leaf, img, box, face, tint, round, aspect: Math.max(aspect, 1), up: 0, out: 0, shadow: light.shadow };
}

/** Lay it back in its window. */
export function lay(l: Lifted): void {
  l.img.style.transform = l.img.style.transformOrigin = '';
  l.leaf.prepend(l.img);
  l.box.remove();
}

/** Place the lifted picture for where it is between its window and the whole view. */
export function pose(l: Lifted, opening: Rect, W: number, V: number): void {
  // A round window's picture is lifted in its own frame, placed so the circle is where it was.
  const D = opening.h;
  const at = l.round === null ? opening : { x: opening.x + D / 2 - l.round * D, y: opening.y, w: l.aspect * D, h: D };
  const k = Math.max(W / at.w, V / at.h);
  const lifted = { x: at.x - at.w * 0.0125, y: at.y - at.h * 0.0205, s: 1.025 };
  const cover = { x: (W - at.w * k) / 2, y: (V - at.h * k) / 2, s: k };
  const mix = (a: number, b: number, t: number) => a + (b - a) * t;
  const x = mix(mix(at.x, lifted.x, l.up), cover.x, l.out);
  const y = mix(mix(at.y, lifted.y, l.up), cover.y, l.out);
  const s = mix(mix(1, lifted.s, l.up), cover.s, l.out);
  const b = l.box.style;
  b.width = `${at.w}px`;
  b.height = `${at.h}px`;
  b.transform = `translate3d(${x}px, ${y}px, 0) scale(${s})`;
  const shade = l.up * (1 - l.out);
  const [sx, sy] = l.shadow;
  const shadows = [
    `${sx * 9 * shade}px ${sy * 9 * shade}px ${22 * shade}px rgb(24 14 6 / ${0.34 * shade})`,
    `${sx * 2 * shade}px ${sy * 2 * shade}px ${4 * shade}px rgb(24 14 6 / ${0.22 * shade})`,
  ];
  if (l.round === null) b.boxShadow = shade > 0.001 ? shadows.join(', ') : 'none';
  else {
    // The circle opens from the window's until it takes in the whole frame; the shadow is cast by
    // what is seen, so it is a filter, which the clip does not cut.
    const cx = l.round * D;
    const whole = Math.hypot(Math.max(cx, at.w - cx), D / 2);
    const out = l.out * l.out * (3 - 2 * l.out);
    l.face.style.clipPath = `circle(${mix(D / 2, whole, out)}px at ${cx}px 50%)`;
    // Seen through the window's lens, it was magnified: it leaves the window so, and eases to itself.
    if (l.leaf.classList.contains('carried')) {
      l.img.style.transformOrigin = `${cx}px 50%`;
      l.img.style.transform = `scale(${mix(LENS, 1, out)})`;
    }
    b.filter = shade > 0.001 ? shadows.map((d) => `drop-shadow(${d})`).join(' ') : 'none';
  }
  l.tint.style.opacity = String(1 - l.out);
}

/** Lift it and spread it over the view; `arrive` is called when it covers the view. */
export function go(l: Lifted, at: () => Rect, W: number, V: number, arrive: () => void): void {
  const update = () => pose(l, at(), W, V);
  update();
  animate(l, { up: 1, duration: LIFT, ease: 'out(3)', onUpdate: update });
  animate(l, { out: 1, delay: OVERLAP, duration: SPREAD, ease: 'inOut(3)', onUpdate: update, onComplete: arrive });
}

/** From the whole view, back into its window; `landed` is called once it lies there again. */
export function back(l: Lifted, at: () => Rect, W: number, V: number, landed: () => void): void {
  l.up = 1; l.out = 1;
  const update = () => pose(l, at(), W, V);
  update();
  animate(l, { out: 0, duration: SPREAD, ease: 'inOut(3)', onUpdate: update });
  animate(l, { up: 0, delay: SPREAD - 160, duration: LIFT, ease: 'out(3)', onUpdate: update, onComplete: () => { update(); landed(); } });
}
