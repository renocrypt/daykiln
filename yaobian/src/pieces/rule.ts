// RULE, the piece: the rule drew the wall (DIRECTIONS.md).
//
// The series' ritual, in RULE's terms:
//   prologue  the dome in crystal, seen from below, the camera still; as the visitor scrolls, the
//             rule's angle sweeps and every carved surface is redrawn;
//   turn      at the wall where the rule is set, the visitor turns its angle on a small diagram, or
//             changes the tiling, and the whole hall is redrawn;
//   run       the rule is let go: from that wall a line of fire runs through the hall, and every
//             surface behind it is clay; the camera steps back once, to the whole hall, and holds;
//   keep      three places to stand, the wall, the hall, under the dome; the loupe; the rule sheet.
//
// The camera stands only in those places (rule/views.ts), and moves between them only when the
// visitor or the score asks. Gestures and the score write targets; damping writes currents; the
// frame reads currents.

import * as THREE from 'three/webgpu';
import { createTimeline, type Timeline } from 'animejs';
import { buildHall, GROUNDS, type Rule } from '../rule/hall.ts';
import { hankin, type Pattern } from '../rule/hankin.ts';
import { TILINGS, type TilingName } from '../rule/tiling.ts';
import { ruleSheet } from '../rule/sheet.ts';
import { createLoupe } from '../core/loupe.ts';
import { damped, follow, reducedMotion, tick, unfollow } from '../core/score.ts';
import { showRecord } from '../core/record.ts';
import { guide } from '../core/guide.ts';
import { createQuality } from '../core/quality.ts';
import { VIEWS } from '../rule/views.ts';

type Phase = 'prologue' | 'turn' | 'running' | 'fired' | 'cooling';

const ANGLES = { min: 34, max: 80 };
const TILING_ORDER: TilingName[] = ['4.8.8', '6.6.6', '3.12.12'];
const TILING_NAMES: Record<TilingName, string> = { '4.8.8': 'octagons and squares', '6.6.6': 'hexagons', '3.12.12': 'dodecagons and triangles' };
const TEXEL = { turning: 0.6, rest: 0.25 }; // mm: while the angle moves, and when it stops

export async function mount(root: HTMLElement): Promise<() => void> {
  // ?gpu measures render passes with the GPU's own timestamps, for profiling.
  const renderer = new THREE.WebGPURenderer({ antialias: false, trackTimestamp: new URLSearchParams(location.search).has('gpu') });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(root.clientWidth, root.clientHeight);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  root.append(renderer.domElement);

  const ui = guide(root, {
    name: 'RULE',
    maker: 'Drawn by the rule.',
    poster: '/yaobian/entrance/rule-below.jpg', // the prologue's first frame
    chapters: [
      { kicker: 'The hall', text: [
        'The Hall of the Two Sisters, in the Alhambra at Granada, built for the Nasrid sultan Muhammad V in the fourteenth century.',
        'Its walls are carved plaster. Its dome is muqarnas: thousands of small plaster pieces, set tier on tier.',
      ] },
      { kicker: 'One rule', text: [
        'The carving is not drawn line by line. It is constructed: a tiling of polygons; from the middle of every edge, two lines at one angle, each stopped where it meets another.',
        'One rule carves every wall in the hall. Scroll, and its angle turns.',
      ] },
      { kicker: 'Then you let go', text: [
        'Here the hall is crystal: the rule, not yet made into anything. Set it on one wall and let it go, and it runs through the whole hall; what it reaches is clay.',
      ] },
    ],
    steps: ['Turn the rule', 'Let it run', 'Keep'],
    entrance: 'construct',
  });

  await renderer.init();
  const hall = await buildHall(renderer, { rule: { tiling: '4.8.8', angle: 72.5 }, texel: TEXEL.rest, onStage: ui.loading });
  const { camera } = hall;
  hall.layout(root.clientWidth, root.clientHeight);

  // Presented values: each a target and a current.
  const view = follow(damped({ ...VIEWS.below }, 0.35));
  const angle = follow(damped({ value: hall.rule.angle }, 0.25));
  const front = follow(damped({ value: 0 }, 0.08)); // how far the fire has run from the wall, m

  let phase: Phase = 'prologue';
  let tiling: TilingName = hall.rule.tiling;
  let pattern: Pattern = hankin(TILINGS[tiling](GROUNDS[tiling].across), THREE.MathUtils.degToRad(angle.current.value));
  let turning = false; // a hand on the rule
  let atRest = true; // the walls show the fine bake of the current rule
  let score: Timeline | null = null;
  let noted = 0; // notes told as the fire runs
  let withdraw = 0; // the log's withdrawal, once the hall is fired
  let settle = 0; // the quiet between the fire's end and what is offered next
  let needsRender = true;
  let warmup = 30; // frames drawn regardless, after mounting or a new material
  hall.onRule(() => { needsRender = true; });

  // The prologue: the camera holds under the dome; the rule's angle follows the visitor's scroll,
  // turning down and back through the rule's chapter.
  const BASE = angle.target.value;
  ui.onProgress((p) => {
    if (phase !== 'prologue') return;
    angle.target.value = BASE - 30 * Math.sin(Math.PI * THREE.MathUtils.clamp((p - 0.2) / 0.5, 0, 1));
  });

  // The rule diagram: one repeat of the pattern, redrawn whenever the angle's current moves.
  const diagram = ruleDiagram();
  const drawDiagram = () => {
    pattern = hankin(TILINGS[tiling](GROUNDS[tiling].across), THREE.MathUtils.degToRad(angle.current.value));
    diagram.draw(pattern, tiling, angle.current.value);
  };
  drawDiagram();

  const loupe = createLoupe(hall.scene, camera);
  let lens: { x: number; y: number } | null = null;
  const lean = (x: number | null, y = 0) => {
    lens = x === null ? null : { x, y };
    hall.setLoupe(lens ? loupe : null);
    needsRender = true;
  };

  // The ritual ------------------------------------------------------------------------------------

  const nextTiling = () => TILING_ORDER[(TILING_ORDER.indexOf(tiling) + 1) % TILING_ORDER.length];
  const turnActions = () => ui.actions([
    { label: 'Let the rule run', key: 'Enter', run: letGo, primary: true },
    { label: `Tiling: ${tiling}`, key: 'KeyT', run: () => setRule({ tiling: nextTiling() }) },
  ]);

  const toTurn = () => {
    phase = 'turn';
    Object.assign(view.target, VIEWS.wall);
    ui.step(0);
    ui.say('Take the red line by its end and turn it about the edge, or press ← →. Every carved wall in the hall is redrawn.');
    ui.instrument(diagram.el);
    turnActions();
  };

  const setRule = (next: Partial<Rule>) => {
    if (phase !== 'turn') return;
    if (next.angle !== undefined) angle.target.value = THREE.MathUtils.clamp(next.angle, ANGLES.min, ANGLES.max);
    if (next.tiling) {
      tiling = next.tiling;
      atRest = false;
      angle.current.value = angle.target.value;
      hall.setRule({ tiling, angle: angle.target.value }, TEXEL.turning);
      drawDiagram();
      turnActions();
    }
  };

  // What the log says as the fire runs: each when the front reaches it, m from the wall.
  const NOTES: { at: number; text: string }[] = [
    { at: 0.3, text: 'From the wall where the rule was set, through every carved surface: crystal before it, clay behind.' },
    { at: 4.2, text: 'Every wall carries the same rule, whatever the fire reaches it by.' },
    { at: 7.4, text: `Into the dome: ${hall.dome.pieces.toLocaleString('en-US')} pieces, which keep a rule of their own, as Owen Jones and Jules Goury drew them in 1842.` },
  ];
  const RUN = 13000; // ms for the fire to cross the hall

  const letGo = () => {
    if (phase !== 'turn') return;
    phase = 'running';
    noted = 0;
    ui.instrument(null);
    ui.actions([]);
    ui.step(1);
    ui.clearNotes();
    ui.log(true);
    ui.say('The rule is fixed. It runs from this wall through the whole hall.');
    hall.setRule({ tiling, angle: angle.target.value }, TEXEL.rest);
    hall.origin.set(VIEWS.wall.tx, VIEWS.wall.ty, VIEWS.wall.tz - 0.05); // where the camera looked as the rule was set
    const quick = reducedMotion ? 0.01 : 1;
    score?.pause();
    // One step back, to where the whole hall is seen, and held there while the fire crosses it.
    score = createTimeline({ defaults: { ease: 'inOutSine' }, onComplete: () => { settle = window.setTimeout(fired, 1600 * quick); } })
      .add(view.target, { ...VIEWS.hall, duration: 2400 * quick }, 0)
      .add(front.target, { value: hall.reach, duration: RUN * quick, ease: 'linear' }, 1800 * quick);
  };

  const stand = (where: keyof typeof VIEWS) => () => {
    if (phase !== 'fired') return;
    score?.pause();
    score = createTimeline({ defaults: { ease: 'inOutSine' } }).add(view.target, { ...VIEWS[where], duration: 2400 }, 0);
  };

  const fired = () => {
    phase = 'fired';
    ui.step(2);
    ui.clearNotes();
    ui.note('fired', `Every carved surface in your rule, ${hall.rule.tiling} at ${hall.rule.angle.toFixed(1)}°; above them, the dome in its own.`);
    withdraw = window.setTimeout(() => ui.log(false), 6000); // then the hall is the thing
    ui.say('Stand at the wall, in the hall, or under the dome. Press and hold anywhere to see the carving at four times.');
    ui.actions([
      { label: 'Keep the rule sheet', key: 'KeyK', run: keep, primary: true },
      { label: 'The wall', key: 'Digit1', run: stand('wall') },
      { label: 'The hall', key: 'Digit2', run: stand('hall') },
      { label: 'The dome', key: 'Digit3', run: stand('below') },
      { label: 'Set another rule', key: 'KeyR', run: again },
    ]);
  };

  const again = () => {
    if (phase !== 'fired') return;
    phase = 'cooling';
    lean(null);
    clearTimeout(withdraw);
    ui.clearNotes();
    ui.actions([]);
    ui.log(false);
    ui.say('Back to crystal.');
    const quick = reducedMotion ? 0.01 : 1;
    score?.pause();
    score = createTimeline({ defaults: { ease: 'inOutSine' }, onComplete: toTurn })
      .add(front.target, { value: 0, duration: 1800 * quick }, 0)
      .add(view.target, { ...VIEWS.wall, duration: 2600 * quick }, 0);
  };

  const keep = () => {
    if (phase !== 'fired') return;
    const θ = hall.rule.angle.toFixed(1).replace(/\.0$/, '');
    const date = new Date().toISOString().slice(0, 10);
    const caption = `RULE · ${hall.rule.tiling} · θ ${θ}° · ${date}`;
    showRecord(root, { svg: ruleSheet(hall.pattern, caption), filename: `yaobian-rule-${hall.rule.tiling}-${θ}.svg` });
  };

  // Gestures ------------------------------------------------------------------------------------------

  diagram.onHold((θ) => { turning = true; setRule({ angle: θ }); }, () => { turning = false; });

  const canvas = renderer.domElement;
  let holdTimer = 0;
  canvas.addEventListener('pointerdown', (event) => {
    if (phase !== 'turn' && phase !== 'fired') return;
    const { clientX: x, clientY: y } = event;
    holdTimer = window.setTimeout(() => lean(x, y), 180); // a press held is leaning in
  });
  canvas.addEventListener('pointermove', (event) => { if (lens) lean(event.clientX, event.clientY); });
  const release = () => { clearTimeout(holdTimer); if (lens) lean(null); };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointerleave', release);

  const keys = (event: KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey || phase !== 'turn') return;
    const step = event.shiftKey ? 5 : 0.5;
    if (event.code === 'ArrowLeft') setRule({ angle: angle.target.value - step });
    else if (event.code === 'ArrowRight') setRule({ angle: angle.target.value + step });
    else return;
    event.preventDefault();
  };
  addEventListener('keydown', keys);

  const resize = () => {
    renderer.setSize(root.clientWidth, root.clientHeight);
    hall.layout(root.clientWidth, root.clientHeight);
    needsRender = true;
  };
  addEventListener('resize', resize);

  ui.ready(toTurn);

  const quality = createQuality(renderer, { layout: () => hall.layout(root.clientWidth, root.clientHeight) });

  // One clock -----------------------------------------------------------------------------------------

  let lastAngle = angle.current.value;
  renderer.setAnimationLoop((now) => {
    const moving = tick(now);
    const v = view.current;
    camera.position.set(v.px, v.py, v.pz);
    camera.lookAt(v.tx, v.ty, v.tz);
    if (Math.abs(camera.fov - v.fov) > 1e-3) { camera.fov = v.fov; camera.updateProjectionMatrix(); }
    hall.fire(front.current.value);
    // The rule follows the hand: the diagram every frame, the walls as fast as their bakes allow,
    // then once more, finely, when the hand has stopped and the angle has settled.
    if (angle.current.value !== lastAngle) {
      lastAngle = angle.current.value;
      drawDiagram();
      hall.setRule({ tiling, angle: angle.current.value }, TEXEL.turning);
      atRest = false;
    } else if (!atRest && !turning && !angle.moving() && (phase === 'turn' || phase === 'prologue')) {
      hall.setRule({ tiling, angle: angle.target.value }, TEXEL.rest);
      atRest = true;
    }
    // What the fire has reached.
    if (phase === 'running') {
      while (noted < NOTES.length && front.current.value >= NOTES[noted].at) { ui.note(`${NOTES[noted].at.toFixed(1)} m`, NOTES[noted].text); noted++; }
    }
    if (lens) loupe.aim(lens.x, lens.y, root.clientWidth, root.clientHeight);
    // WebGPU compiles pipelines asynchronously: the first frames after a change can be incomplete.
    if (warmup > 0) { warmup--; needsRender = true; }
    // Anything changed draws afresh; at rest, the still is refined until it has all its samples.
    const fresh = moving || needsRender; // a lens held still is looked through, and refined like the rest
    if (!fresh && hall.refined) return;
    needsRender = false;
    const resized = quality.frame(fresh);
    hall.draw(fresh || resized);
    quality.measure();
  });

  if (import.meta.env.DEV) Object.assign(window, { rulePiece: { renderer, hall, view, front, angle, quality, get phase() { return phase; }, get score() { return score; } } });

  return () => {
    renderer.setAnimationLoop(null);
    clearTimeout(withdraw);
    clearTimeout(settle);
    score?.pause();
    for (const v of [view, angle, front]) unfollow(v as never);
    removeEventListener('keydown', keys);
    removeEventListener('resize', resize);
    ui.dispose();
    hall.dispose();
    renderer.dispose();
    root.replaceChildren();
  };
}

/**
 * The rule diagram: one repeat of the pattern over its tiling. One edge is held: its middle, the line
 * that leaves it at the contact angle, the angle's arc, and a handle at the line's end. Taking the
 * handle and turning it about the edge's middle sets the angle, as a protractor at the edge would.
 */
function ruleDiagram() {
  const el = document.createElement('figure');
  el.className = 'rule-diagram';
  el.innerHTML = `
    <svg viewBox="0 0 100 100" aria-label="The rule: one repeat of the pattern; the red line is the one to turn"></svg>
    <figcaption><span class="angle"></span><span class="tiling"></span></figcaption>`;
  const svg = el.querySelector('svg')!;
  // The held edge, in the diagram's coordinates: its middle, its direction, and the way into its tile.
  let held = { m: [50, 50], e: [1, 0], n: [0, -1] };
  const toSvg = (x: number, y: number) => {
    const p = new DOMPoint(x, y).matrixTransform(svg.getScreenCTM()!.inverse());
    return [p.x, p.y];
  };
  return {
    el,
    /** Taking the line by its end and turning it: the angle it makes with the edge, degrees. */
    onHold(set: (θ: number) => void, end: () => void) {
      let holding = false;
      const turn = (e: PointerEvent) => {
        const [x, y] = toSvg(e.clientX, e.clientY);
        const v = [x - held.m[0], y - held.m[1]];
        const along = v[0] * held.e[0] + v[1] * held.e[1], into = v[0] * held.n[0] + v[1] * held.n[1];
        set(THREE.MathUtils.radToDeg(Math.atan2(into, Math.abs(along))));
      };
      svg.addEventListener('pointerdown', (e) => { holding = true; svg.setPointerCapture(e.pointerId); svg.classList.add('holding'); turn(e); });
      svg.addEventListener('pointermove', (e) => { if (holding) turn(e); });
      const stop = () => { holding = false; svg.classList.remove('holding'); end(); };
      svg.addEventListener('pointerup', stop);
      svg.addEventListener('pointercancel', stop);
    },
    /** One repeat of the pattern, its tiling faint beneath, fitted to the diagram, and the held edge. */
    draw(pattern: Pattern, tiling: TilingName, θ: number) {
      const { width, height, tiles } = pattern.tiling;
      const s = 100 / Math.max(width, height) * 0.92, ox = 50 - (width * s) / 2, oy = 50 + (height * s) / 2;
      const pt = (p: [number, number]) => `${(ox + p[0] * s).toFixed(2)},${(oy - p[1] * s).toFixed(2)}`;
      const clip = `<clipPath id="repeat"><rect x="${ox}" y="${oy - height * s}" width="${width * s}" height="${height * s}"/></clipPath>`;
      // Tiles cross the repeat's edges; their neighbours' copies complete them.
      const shifts = [-1, 0, 1].flatMap((i) => [-1, 0, 1].map((j) => [i * width, j * height] as const));
      const at = (p: [number, number], [dx, dy]: readonly [number, number]) => pt([p[0] + dx, p[1] + dy]);
      const polys = shifts.flatMap((d) => tiles.map((t) => `<polygon points="${t.map((p) => at(p, d)).join(' ')}"/>`)).join('');
      const lines = shifts.flatMap((d) => pattern.segments.map((sg) => `M${at(sg.a, d)}L${at(sg.b, d)}`)).join('');
      // Where the lines leave the edges: every edge's middle.
      const mids = shifts.flatMap((d) => tiles.flatMap((t) => t.map((p, i) => {
        const q = t[(i + 1) % t.length];
        const [x, y] = at([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], d).split(',');
        return `<circle cx="${x}" cy="${y}" r="1.1"/>`;
      }))).join('');
      // The held edge: the one whose middle is nearest a point below the diagram's center, so its line
      // rises into the tile as a construction is drawn, upright.
      let best = Infinity;
      for (const t of tiles) t.forEach((p, i) => {
        const q = t[(i + 1) % t.length];
        const mx = ox + ((p[0] + q[0]) / 2) * s, my = oy - ((p[1] + q[1]) / 2) * s;
        const dist = Math.hypot(mx - 50, my - 64);
        if (dist >= best - 1e-6) return;
        best = dist;
        const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
        const d = [(q[0] - p[0]) / len, (q[1] - p[1]) / len], n = [-d[1], d[0]]; // inward, for a counterclockwise tile
        held = { m: [mx, my], e: [d[0], -d[1]], n: [n[0], -n[1]] }; // the diagram's y runs down
      });
      const r = THREE.MathUtils.degToRad(θ);
      const { m, e, n } = held;
      const dir = [e[0] * Math.cos(r) + n[0] * Math.sin(r), e[1] * Math.cos(r) + n[1] * Math.sin(r)];
      const reach = 24, arc = 8;
      const f = (v: number) => v.toFixed(2);
      const hand = [m[0] + dir[0] * reach, m[1] + dir[1] * reach];
      const a0 = [m[0] + e[0] * arc, m[1] + e[1] * arc], a1 = [m[0] + dir[0] * arc, m[1] + dir[1] * arc];
      const sweep = e[0] * n[1] - e[1] * n[0] > 0 ? 1 : 0;
      const hold = `<g class="held">
        <line class="edge" x1="${f(m[0] - e[0] * 10)}" y1="${f(m[1] - e[1] * 10)}" x2="${f(m[0] + e[0] * 10)}" y2="${f(m[1] + e[1] * 10)}"/>
        <path class="arc" d="M${f(a0[0])} ${f(a0[1])}A${arc} ${arc} 0 0 ${sweep} ${f(a1[0])} ${f(a1[1])}"/>
        <line class="ray" x1="${f(m[0])}" y1="${f(m[1])}" x2="${f(hand[0])}" y2="${f(hand[1])}"/>
        <circle class="hand" cx="${f(hand[0])}" cy="${f(hand[1])}" r="2.6"/>
      </g>`;
      svg.innerHTML = `${clip}<g clip-path="url(#repeat)"><g class="tiles">${polys}</g><path class="lines" d="${lines}"/><g class="mids">${mids}</g></g>${hold}`;
      el.querySelector('.tiling')!.textContent = `${tiling}, ${TILING_NAMES[tiling]}`;
      // What the angle does, in a word or two: the gauge is the figure itself.
      const u = (θ - ANGLES.min) / (ANGLES.max - ANGLES.min);
      const does = u < 0.33 ? 'Low: the stars open wide.' : u < 0.7 ? 'Middle: the stars and the shapes between them in balance.' : 'Steep: the stars\' points sharpen.';
      el.querySelector('.angle')!.innerHTML = `θ ${θ.toFixed(1)}°<span class="does">${does}</span>`;
    },
  };
}
