// PLUMB, the piece: gravity drew the arch (DIRECTIONS.md).
//
// The series' ritual, in PLUMB's terms:
//   prologue  the net hanging from its posts in a dusk workshop; the visitor scrolls through what
//             it is while the camera turns about it, close on the cord and from below, as Gaudí
//             photographed his. It is not turned over here: that is the visitor's to see first;
//   hang      the visitor hangs lead on the net, knot by knot; each weight pulls the whole net into a
//             new shape and it settles, and a log says how far it moved;
//   turn over when the net is at rest, the visitor turns it over: frozen, it turns and stands on the
//             bench, and holds there, the knots that carried lead named where they now rise;
//   stand     when the visitor asks, it grows to the scale of a building, the window become the sky,
//             and the visitor stands under the vault they hung; the loupe; the funicular record.
//
// The net is simulated (plumb/net.ts) at a fixed step in real time. Gestures and the score write
// targets; damping writes currents; the frame reads currents.

import * as THREE from 'three/webgpu';
import { animate, createTimeline, stagger, type Timeline } from 'animejs';
import { createNet } from '../plumb/net.ts';
import { buildPlumb, SCALE, SLUG_HEIGHT, SUN, VIEWS, type View } from '../plumb/scene.ts';
import { funicularRecord, knotName, type Photograph } from '../plumb/record.ts';
import { createLoupe } from '../core/loupe.ts';
import { damped, follow, reducedMotion, tick, unfollow } from '../core/score.ts';
import { showRecord } from '../core/record.ts';
import { guide } from '../core/guide.ts';
import { createQuality } from '../core/quality.ts';

type Phase = 'prologue' | 'hang' | 'turning' | 'turned' | 'growing' | 'standing' | 'returning';

const WEIGHT = 0.02; // kg of lead hung by one gesture
const REST = { speed: 0.002, hold: 0.5 }; // m/s, s: the net is at rest when no knot moves faster, this long

const lerpView = (a: View, b: View, u: number): View => {
  const k = THREE.MathUtils.smootherstep(u, 0, 1);
  const out = { ...a };
  for (const key of Object.keys(a) as (keyof View)[]) out[key] = a[key] + (b[key] - a[key]) * k;
  return out;
};
const grams = (kg: number) => `${Math.round(kg * 1000).toLocaleString('en-US')} g`;

export async function mount(root: HTMLElement): Promise<() => void> {
  // ?gpu measures render passes with the GPU's own timestamps, for profiling.
  const renderer = new THREE.WebGPURenderer({ antialias: true, trackTimestamp: new URLSearchParams(location.search).has('gpu') });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(root.clientWidth, root.clientHeight);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  root.append(renderer.domElement);

  const ui = guide(root, {
    name: 'PLUMB',
    maker: 'Drawn by gravity.',
    chapters: [
      { kicker: 'A chain', text: [
        'Hang a chain from two points and it settles into a curve in which every link pulls on the next: pure tension.',
      ] },
      { kicker: 'A net', text: [
        'For the church of the Colònia Güell, from 1898, Antoni Gaudí hung a model of strings from a board and loaded it with small bags of lead shot. He photographed it, turned the photographs upside down, and drew the church over them.',
        'Here is a net of string, fifteen knots by fifteen, tied by its corners to four posts. Each knot carries 2 g, standing for the vault\'s own weight, and the net hangs under them.',
      ] },
      { kicker: 'Then you let go', text: [
        'You will hang lead on it, knot by knot. Each weight pulls the whole net into a new shape, and it settles.',
        'When it is still, you can turn it over.',
      ] },
    ],
    steps: ['Hang', 'Turn over', 'Stand under', 'Keep'],
    entrance: 'settle',
  });

  await renderer.init();
  ui.loading('knotting the net…');
  const net = createNet();
  // Let it hang before it is seen.
  for (let i = 0; i < 240 * 6; i++) net.step();
  const plumb = await buildPlumb(renderer, net, { unit: WEIGHT });
  plumb.layout(root.clientWidth, root.clientHeight);
  plumb.update();

  // Presented values.
  const view = follow(damped({ ...VIEWS.table, shift: 0.16 }, 0.45));
  const flip = follow(damped({ value: 0 }, 0.35));
  const grow = follow(damped({ value: 0 }, 0.35));
  const look = follow(damped({ yaw: 0, pitch: 0 }, 0.18)); // the visitor's head, under the vault
  const LOOK = { yaw: 70, up: 50, down: -20 }; // degrees: as far as the head turns

  let phase: Phase = 'prologue';
  let cursor: number | null = null;
  let still = 0; // s the net has been at rest
  let resting = true;
  let wantTurn = false; // the visitor asked to turn it over before it was at rest
  let hung: { k: number; kg: number }[] = []; // in order, for taking off again
  let pending: { k: number; kg: number }[] = []; // since the last rest
  let before = net.position.slice(); // the knots at the last rest
  let score: Timeline | null = null;
  let needsRender = true;
  let warmup = 30;
  let withdraw = 0; // the log's withdrawal, once the visitor stands under the vault
  let photo: Promise<Photograph> | null = null; // taken at rest, as the net is turned over

  // The prologue: the camera follows the visitor's scroll. The model is not turned over here.
  const PATH: View[] = [
    { ...VIEWS.table, shift: 0.16 }, // the name
    VIEWS.close, // a chain: the cord, the knots, the curve they hang in
    VIEWS.below, // a net, as Gaudí photographed his
    VIEWS.aside, // then you let go
    VIEWS.aside, // the way in
  ];
  ui.onProgress((p) => {
    if (phase !== 'prologue') return;
    const x = p * (PATH.length - 1), i = Math.min(PATH.length - 2, Math.floor(x));
    Object.assign(view.target, lerpView(PATH[i], PATH[i + 1], x - i));
  });

  const loupe = createLoupe(plumb.scene, plumb.camera);
  let lens: { x: number; y: number } | null = null;
  let looking = false; // the loupe kept on while hanging, following the hand
  const pointer = { x: root.clientWidth / 2, y: root.clientHeight / 2 };
  const lean = (x: number | null, y = 0) => {
    lens = x === null ? null : { x, y };
    plumb.setLoupe(lens ? loupe : null);
    root.classList.toggle('leaning', lens !== null); // the named marks step aside for the lens
    needsRender = true;
  };

  // The knot under the hand, named.
  const tag = document.createElement('p');
  tag.className = 'knot-tag';
  tag.hidden = true;
  root.append(tag);
  const point = (k: number | null) => {
    cursor = k;
    plumb.point(k);
    tag.hidden = k === null;
    needsRender = true;
  };
  const placeTag = () => {
    if (cursor === null) return;
    const at = plumb.onScreen(cursor);
    tag.style.transform = `translate(${at.x + 14}px, ${at.y - 26}px)`;
    tag.textContent = `${knotName(net, cursor)} · ${net.load[cursor] > 0 ? `${grams(net.load[cursor])} of lead` : 'no lead'}`;
  };

  // Where the lead hung, named on the standing model: a dot on the knot, a hairline up from it, the
  // knot's name and its lead, over the dark above the model. The heaviest few, so they stay legible.
  const marks = (() => {
    const box = document.createElement('div');
    box.className = 'marks';
    root.append(box);
    let shown: { k: number; el: HTMLElement }[] = [];
    return {
      show() {
        const loaded = Array.from({ length: net.count }, (_, k) => k).filter((k) => net.load[k] > 0).sort((a, b) => net.load[b] - net.load[a]).slice(0, 6);
        shown = loaded.map((k) => {
          const el = document.createElement('p');
          el.className = 'mark';
          el.innerHTML = `<i></i><span>${knotName(net, k)} · ${grams(net.load[k])}</span>`;
          box.append(el);
          return { k, el };
        });
        this.place();
        animate(shown.map((m) => m.el), { opacity: [0, 1], delay: stagger(120 * (reducedMotion ? 0 : 1), { start: 300 }), duration: 900, ease: 'outQuad' });
      },
      hide() {
        const gone = shown.map((m) => m.el);
        shown = [];
        if (gone.length) animate(gone, { opacity: 0, duration: 400, ease: 'inQuad', onComplete: () => gone.forEach((el) => el.remove()) });
      },
      /**
       * As a drawing's callouts: each leader rises from its knot to a line above the vault's top, so
       * the names are read over the dark, not the plaster; one that would cover another takes the
       * row above.
       */
      place() {
        // Each from the top of its lead, the stack it presses on the vault with.
        const at = shown.map((m) => ({ m, p: plumb.onScreen(m.k, Math.round(net.load[m.k] / WEIGHT) * SLUG_HEIGHT + 0.001), width: m.el.querySelector('span')!.offsetWidth + 14 })).sort((a, b) => a.p.x - b.p.x);
        const line = Math.min(...at.map((a) => a.p.y)) - 34;
        const rows: number[] = []; // each row's rightmost end
        for (const { m, p, width } of at) {
          // Near the right edge the name reads leftward from its leader.
          const leftward = p.x + width > root.clientWidth - 12;
          const x0 = leftward ? p.x - width : p.x;
          let row = 0;
          while (rows[row] !== undefined && rows[row] > x0) row++;
          rows[row] = x0 + width;
          m.el.classList.toggle('leftward', leftward);
          m.el.style.setProperty('--leader', `${(p.y - (line - row * 22)).toFixed(1)}px`);
          m.el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
        }
      },
      get any() { return shown.length > 0; },
    };
  })();

  // The sun, out of doors: from the afternoon to dusk, the hour named as it goes.
  const dial = sunDial((e) => { plumb.setSun(e); needsRender = true; });
  dial.set(plumb.sun);

  // The ritual ------------------------------------------------------------------------------------

  const total = () => net.load.reduce((s, kg) => s + kg, 0);
  const hangActions = () => ui.actions([
    { label: 'Turn it over', key: 'Enter', run: turnOver, primary: true },
    ...(hung.length ? [{ label: 'Take one off', key: 'Backspace', run: takeOff }] : []),
    { label: 'Look closer', key: 'KeyL', run: () => { looking = !looking; lean(looking ? pointer.x : null, pointer.y); } },
  ]);
  const hint = 'Click a knot to hang 20 g of lead on it; or choose one with the arrow keys, and press space.';

  const toHang = () => {
    phase = 'hang';
    Object.assign(view.target, VIEWS.table);
    flip.target.value = 0;
    ui.step(0);
    ui.say(hint);
    ui.log(true);
    hangActions();
    if (!hung.length) ui.note('0 g', `The net hangs under its knots' 2 g, ${grams(net.count * net.options.knotMass)} in all, standing for the vault's own weight: its lowest knot ${Math.round(net.depth() * 1000)} mm below the posts.`);
  };

  const hang = (k: number | null, kg: number) => {
    if (phase !== 'hang' || k === null) return;
    net.hang(k, kg);
    if (kg > 0) hung.push({ k, kg }); else { const i = hung.map((h) => h.k).lastIndexOf(k); if (i >= 0) hung.splice(i, 1); }
    pending.push({ k, kg });
    resting = false; still = 0;
    hangActions();
    needsRender = true;
  };
  const takeOff = () => { const last = hung[hung.length - 1]; if (last) hang(last.k, -last.kg); };

  /** At rest: say what the last weights did. */
  const settled = () => {
    if (!pending.length) return;
    const P = net.position;
    let moved = 0, free = 0;
    for (let k = 0; k < net.count; k++) {
      if (net.isSupport(k)) continue;
      free++;
      if (Math.hypot(P[k * 3] - before[k * 3], P[k * 3 + 1] - before[k * 3 + 1], P[k * 3 + 2] - before[k * 3 + 2]) > 0.0005) moved++;
    }
    const added = pending.reduce((s, p) => s + p.kg, 0);
    const at = [...new Set(pending.map((p) => p.k))];
    const change = (i: number) => (P[i * 3 + 1] - before[i * 3 + 1]) * 1000;
    const k = at.reduce((m, i) => (Math.abs(change(i)) > Math.abs(change(m)) ? i : m)); // the one that moved most
    const dy = change(k);
    const names = at.slice(0, 4).map((i) => knotName(net, i)).join(', ') + (at.length > 4 ? '…' : '');
    ui.note(grams(total()), `${added >= 0 ? '+' : '−'}${grams(Math.abs(added))} at ${names}. ${knotName(net, k)} ${dy < 0 ? 'dropped' : 'rose'} ${Math.abs(dy).toFixed(0)} mm; ${moved} of ${free} knots moved.`);
    pending = [];
  };

  const turnOver = () => {
    if (phase !== 'hang') return;
    if (!resting) { wantTurn = true; ui.say('Waiting for the net to come to rest: only a still net can be turned over.'); return; }
    wantTurn = false;
    phase = 'turning';
    point(null);
    looking = false;
    lean(null);
    ui.actions([]);
    ui.step(1);
    ui.say('Frozen at rest, and turned over. Nothing you do changes it now.');
    ui.note('frozen', 'At rest, every string is in tension, pulling its knots toward each other.');
    photo = plumb.photograph(VIEWS.below); // as Gaudí photographed his, from below, for the record
    const quick = reducedMotion ? 0.01 : 1;
    score?.pause();
    score = createTimeline({ defaults: { ease: 'inOutSine' }, onComplete: turned })
      .add(flip.target, { value: 1, duration: 3200 * quick }, 0)
      .add(view.target, { ...VIEWS.stands, duration: 3200 * quick }, 0);
  };

  /** Turned over and standing on the bench: held, so it can be recognized. */
  const turned = () => {
    phase = 'turned';
    const rise = Math.round(net.depth() * 1000);
    ui.note('turned', `Standing, ${rise} mm high. The lead still pulls down, now pressing on the vault; every string that pulled now pushes, and the same shape carries the same loads.`);
    ui.note('Hooke', 'As hangs the flexible line, so, inverted, stands the rigid arch: his anagram of the 1670s, solved only after his death.');
    marks.show();
    withdraw = window.setTimeout(() => ui.log(false), 9000); // then the model is the thing
    ui.say(hung.length ? 'Where the lead hung, it now presses down, and the vault rises to a point to carry it. Press and hold to see it at four times.' : 'Under its knots\' weight alone, it stands as an even vault.');
    ui.actions([
      { label: 'Stand under it', key: 'Enter', run: standUnder, primary: true },
      { label: 'Look closer', key: 'KeyL', run: () => lean(lens ? null : root.clientWidth / 2, root.clientHeight * 0.4) },
      { label: 'Back to the net', key: 'KeyR', run: back },
    ]);
  };

  const standUnder = () => {
    if (phase !== 'turned') return;
    phase = 'growing';
    clearTimeout(withdraw);
    lean(null);
    marks.hide();
    ui.log(true);
    ui.actions([]);
    ui.say(`Grown ${SCALE} times.`);
    const quick = reducedMotion ? 0.01 : 1;
    score?.pause();
    score = createTimeline({ defaults: { ease: 'inOutSine' }, onComplete: stand })
      .add(grow.target, { value: 1, duration: 5200 * quick }, 0)
      .add(view.target, { ...VIEWS.under, duration: 5200 * quick }, 0)
      .call(() => ui.note(`× ${SCALE}`, `A vault ${(net.options.span * SCALE).toFixed(0)} m between its feet and ${(net.depth() * SCALE).toFixed(1)} m high. Its weight grows ${(SCALE ** 3).toLocaleString('en-US')} times, and so must the loads for the shape to hold: each 20 g of lead is now ${Math.round(WEIGHT * SCALE ** 3).toLocaleString('en-US')} kg pressing on it.`), 5400 * quick);
  };

  const stand = () => {
    phase = 'standing';
    ui.step(2);
    withdraw = window.setTimeout(() => ui.log(false), 6000); // then the vault is the thing
    ui.say('You are standing under the net you hung. Drag, or press the arrows, to look around; move the sun with [ and ].');
    ui.instrument(dial.el);
    ui.actions([
      { label: 'Keep the record', key: 'KeyK', run: keep, primary: true },
      { label: 'Look closer', key: 'KeyL', run: () => lean(lens ? null : root.clientWidth / 2, root.clientHeight / 2) },
      { label: 'Back to the net', key: 'KeyR', run: back },
    ]);
  };

  const back = () => {
    if (phase !== 'standing' && phase !== 'turned') return;
    const from = phase;
    phase = 'returning';
    ui.instrument(null);
    clearTimeout(withdraw);
    lean(null);
    marks.hide();
    ui.actions([]);
    ui.say('Back to the net.');
    const quick = reducedMotion ? 0.01 : 1;
    const down = from === 'standing' ? 3800 * quick : 0; // shrunk to the bench first
    Object.assign(look.target, { yaw: 0, pitch: 0 });
    score?.pause();
    score = createTimeline({ defaults: { ease: 'inOutSine' }, onComplete: () => { toHang(); ui.say('The net hangs again, its lead still on it. Hang more, or take some off.'); } });
    if (from === 'standing') score.add(grow.target, { value: 0, duration: 3600 * quick }, 0).add(view.target, { ...VIEWS.stands, duration: 3600 * quick }, 0);
    score.add(flip.target, { value: 0, duration: 2800 * quick }, down).add(view.target, { ...VIEWS.table, duration: 2800 * quick }, down);
  };

  const keep = async () => {
    if (phase !== 'standing' || !photo) return;
    ui.step(3);
    const count = net.load.filter((kg) => kg > 0).length;
    const date = new Date().toISOString().slice(0, 10);
    const rise = Math.round(net.depth() * 1000);
    showRecord(root, {
      filename: `yaobian-plumb-${Math.round(total() * 1000)}g-${rise}mm.svg`,
      svg: funicularRecord(net, {
        caption: `PLUMB · ${hung.length} weights on ${count} knots, ${grams(total())} · rise ${rise} mm · ${date}`,
        note: `Four supports, ${Math.round(net.options.span * 1000)} mm apart · ${net.knots} × ${net.knots} knots · strings stretched at most ${(net.stretch() * 100).toFixed(2)} %`,
        photo: await photo,
      }),
    });
  };

  // Gestures ------------------------------------------------------------------------------------------

  const canvas = renderer.domElement;
  let holdTimer = 0;
  let down: { x: number; y: number } | null = null;
  let dragging = false; // a press moved: the head turns, the loupe waits
  canvas.addEventListener('pointermove', (e) => {
    const dx = e.clientX - pointer.x, dy = e.clientY - pointer.y;
    pointer.x = e.clientX; pointer.y = e.clientY;
    if (phase === 'standing' && down && !lens && (dragging || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6)) {
      dragging = true;
      clearTimeout(holdTimer);
      turnHead(dx * 0.12, dy * 0.12);
      return;
    }
    if (lens) lean(e.clientX, e.clientY);
    if (phase === 'hang') point(plumb.pick(e.clientX, e.clientY));
  });
  /** Turn the head, degrees: dragging moves the view the way the hand goes. */
  const turnHead = (yaw: number, pitch: number) => {
    look.target.yaw = THREE.MathUtils.clamp(look.target.yaw + yaw, -LOOK.yaw, LOOK.yaw);
    look.target.pitch = THREE.MathUtils.clamp(look.target.pitch + pitch, LOOK.down, LOOK.up);
  };
  canvas.addEventListener('pointerdown', (e) => {
    down = { x: e.clientX, y: e.clientY };
    dragging = false;
    pointer.x = e.clientX; pointer.y = e.clientY;
    // On the bench, a press held is leaning in; under the vault a press is the head turning, and the
    // lens is taken up by its key.
    if (phase === 'turned') holdTimer = window.setTimeout(() => lean(e.clientX, e.clientY), 160);
  });
  canvas.addEventListener('pointerup', (e) => {
    clearTimeout(holdTimer);
    if (lens && !looking) lean(null);
    if (down && phase === 'hang' && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6) hang(plumb.pick(e.clientX, e.clientY), WEIGHT);
    down = null;
  });
  canvas.addEventListener('pointerleave', () => { clearTimeout(holdTimer); if (lens && !looking) lean(null); if (phase === 'hang') point(null); });
  const keys = (event: KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (phase === 'standing') {
      if (event.code === 'BracketLeft' || event.code === 'BracketRight') { dial.set(plumb.sun + (event.code === 'BracketLeft' ? 1 : -1) * (event.shiftKey ? 4 : 1)); event.preventDefault(); return; }
      const turn: Record<string, [number, number]> = { ArrowLeft: [8, 0], ArrowRight: [-8, 0], ArrowUp: [0, 6], ArrowDown: [0, -6] };
      if (!turn[event.code]) return;
      turnHead(...turn[event.code]);
      event.preventDefault();
      return;
    }
    if (phase !== 'hang') return;
    const n = net.knots;
    const move: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (move[event.code]) {
      const k = cursor ?? net.index(n >> 1, n >> 1);
      let i = (k % n) + move[event.code][0], j = Math.floor(k / n) + move[event.code][1];
      i = THREE.MathUtils.clamp(i, 0, n - 1); j = THREE.MathUtils.clamp(j, 0, n - 1);
      let next = net.index(i, j);
      if (net.isSupport(next)) next = k;
      point(cursor === null ? k : next);
    } else if (event.code === 'Space') hang(cursor ?? net.index(n >> 1, n >> 1), WEIGHT);
    else return;
    event.preventDefault();
  };
  addEventListener('keydown', keys);
  const resize = () => {
    renderer.setSize(root.clientWidth, root.clientHeight);
    plumb.layout(root.clientWidth, root.clientHeight);
    needsRender = true;
  };
  addEventListener('resize', resize);

  ui.ready(toHang);

  const quality = createQuality(renderer, { layout: () => plumb.layout(root.clientWidth, root.clientHeight) });

  // One clock -----------------------------------------------------------------------------------------

  let last = performance.now(), owed = 0;
  renderer.setAnimationLoop((now) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    let moving = tick(now);
    if (plumb.advance(dt)) moving = true; // out of doors the cloud drifts

    // The net hangs, in real time, at its fixed step, until it is at rest.
    if ((phase === 'hang' || phase === 'prologue') && !resting) {
      owed += dt;
      let fastest = 0, steps = 0;
      while (owed >= net.STEP && steps < 48) { fastest = net.step(); owed -= net.STEP; steps++; }
      if (steps) plumb.update();
      still = fastest < REST.speed ? still + dt : 0;
      if (phase === 'hang') ui.say(`Settling: the fastest knot is moving ${(fastest * 1000).toFixed(0)} mm/s.`, true);
      if (still >= REST.hold) {
        resting = true;
        owed = 0;
        settled();
        before = net.position.slice();
        if (wantTurn) turnOver();
        else if (phase === 'hang') ui.say(`At rest under ${grams(total())} of lead. Hang more, or turn it over.`);
      }
      moving = true;
    }

    plumb.stage(flip.current.value, grow.current.value, view.current as View, look.current);
    if (cursor !== null) placeTag();
    if (marks.any) marks.place();
    if (lens) loupe.aim(lens.x, lens.y, root.clientWidth, root.clientHeight);
    if (warmup > 0) { warmup--; needsRender = true; }
    // Anything changed draws afresh; at rest, the still is refined until it has all its samples.
    const fresh = moving || needsRender; // a lens held still is looked through, and refined like the rest
    if (!fresh && plumb.refined) return;
    needsRender = false;
    const resized = quality.frame(fresh);
    plumb.draw(fresh || resized);
    quality.measure();
  });

  if (import.meta.env.DEV) Object.assign(window, { plumbPiece: { renderer, plumb, net, flip, grow, view, quality, hang: (k: number) => hang(k, WEIGHT), get phase() { return phase; }, get resting() { return resting; } } });

  return () => {
    renderer.setAnimationLoop(null);
    clearTimeout(withdraw);
    score?.pause();
    for (const v of [view, flip, grow, look]) unfollow(v as never);
    removeEventListener('keydown', keys);
    removeEventListener('resize', resize);
    ui.dispose();
    renderer.dispose();
    root.replaceChildren();
  };
}

/** A slider for the sun's elevation, the hour named beside it. Left is the afternoon, right the dusk. */
function sunDial(set: (elevation: number) => void) {
  const el = document.createElement('figure');
  el.className = 'sun-dial';
  el.innerHTML = `<input type="range" min="${-SUN.highest}" max="${-SUN.lowest}" step="0.25" aria-label="The sun's height"><figcaption><span class="hour"></span><span class="deg"></span></figcaption>`;
  const input = el.querySelector('input')!, hour = el.querySelector('.hour')!, deg = el.querySelector('.deg')!;
  const HOURS: [number, string][] = [[18, 'Afternoon'], [8, 'Late afternoon'], [3, 'Golden hour'], [0.75, 'Sunset'], [-0.5, 'Sundown'], [-1.75, 'Afterglow'], [-Infinity, 'Dusk']];
  const show = (e: number) => {
    input.value = String(-e);
    hour.textContent = HOURS.find(([above]) => e >= above)![1];
    deg.textContent = `sun ${e >= 0 ? '' : '−'}${Math.abs(e).toFixed(1)}°`;
  };
  input.addEventListener('input', () => { const e = -Number(input.value); show(e); set(e); });
  return { el, set(e: number): void { const c = Math.min(SUN.highest, Math.max(SUN.lowest, e)); show(c); set(c); } };
}
