// KILN, the piece: the fire chose the blue; the cooling drew the cracks (DIRECTIONS.md).
//
// The series' ritual, in KILN's terms:
//   prologue  the bowl on its table, unglazed; the visitor scrolls through what it is while the
//             camera turns around it;
//   dip       the bowl is carried to the glaze tub and turned rim down; the visitor presses and
//             holds to lower it into the slip, held by its foot. Any dip leaves the film that clings;
//             then the dry clay draws the glaze on as the square root of the time under, within the
//             range a Ru-type glaze was laid on, and the gauge says what the thickness will do.
//             Lifted, it drips back into the tub, whose slip ripples, and the wet sheen dries off;
//   fire      the visitor closes the kiln and lets go. The room goes dark and leaves the bowl alone;
//             then the bowl's light goes; then in the dark it glows with its own heat, as the kiln
//             runs its schedule: the ramp, a hold in reduction, the cooling. A log says what the fire
//             is doing to it;
//   cool      the kiln opens with the bowl still hot, and the crackle runs across the glaze, each
//             crack lit gold for the moment it opens, at the tension the fracture model gives it;
//   keep      the light returns to the bowl, and the crackle stays, stained as Ge ware's was, the
//             first cracks iron-dark and the later gold; then the table returns under it. The loupe;
//             the bowl's record, its crackle drawn crack by crack in the order the cooling made them.
//
// The firing is the score: its schedule and the stage's cues are data, below, in real time.
// Presented values are damped: the camera, the room's presence, the bowl's light.

import * as THREE from 'three/webgpu';
import { createTimeline, type Timeline } from 'animejs';
import { buildKiln, VIEWS, type Fired, type View } from '../kiln/scene.ts';
import { TUB } from '../kiln/tub.ts';
import { glaze } from '../kiln/glaze.ts';
import { bowlRecord, type Curve } from '../kiln/record.ts';
import { createLoupe } from '../core/loupe.ts';
import { damped, follow, reducedMotion, tick, unfollow } from '../core/score.ts';
import { showRecord } from '../core/record.ts';
import { guide } from '../core/guide.ts';
import { createQuality } from '../core/quality.ts';
import { sound, wav } from '../core/sound.ts';
import { kilnVoice } from '../kiln/voice.ts';
import { chosen, type Ping } from '../kiln/ring.ts';
import { coolingClock, OPENS, pace, SCHEDULE, seenAt, temperatureAt, tensionAt, TOTAL, type CoolingClock } from '../kiln/schedule.ts';

type Phase = 'prologue' | 'carrying' | 'dip' | 'firing' | 'fired';

// The firing's schedule, its pace once the kiln is open, and when a crack is seen: src/kiln/schedule.ts.

/** The stage's cues, in seconds after the kiln is closed. */
const CUE = {
  dark: 1.6, // the room has gone; now the bowl's light goes
  fire: 2.6, // the schedule begins
  settle: 2.6 + TOTAL, // the crackle's light fades to its stain, the bowl's light returns
  room: 2.6 + TOTAL + 2.2, // the table returns under it
  done: 2.6 + TOTAL + 6.2, // the log withdraws: the bowl alone
  offer: 2.6 + TOTAL + 7.8, // then what can be done with it
};

// The dip, as a multiple of the lab's bowl. Any dip leaves the film of slip that clings to a wetted
// surface, the least; then the dry clay draws water from the slip and the glaze builds on it, as
// the square root of the time it is under, as a cast does, to the most.
const WELL = 1.45; // mm of glaze in the well at a dip of 1
const DIP = { least: 0.55, most: 1.45, draws: 0.45 }; // `draws`: per root second under
const dipped = (under: number) => (under > 0 ? Math.min(DIP.most, DIP.least + DIP.draws * Math.sqrt(under)) : 0);

// The bowl carried to the tub, turned rim down: where its middle is, hovering and under. Under, only
// its foot is above the slip, where the potter holds it.
// `lift` carries the bowl clear of the tub's rim at any turn: its middle above the rim by more than its own radius.
const HOLD = { hover: TUB.liquid + 0.075, under: TUB.liquid + 0.006 - 0.0275, lift: TUB.height + 0.12 };
const RIM = { radius: 0.0841, height: 0.02665 }; // m: the lip's apex, from the bowl's middle

/** What the fire is doing, as the log tells it: when, and what. */
const NOTES: { rising?: number; falling?: number; text: string }[] = [
  { rising: 100, text: 'Water left in the clay boils away.' },
  { rising: 573, text: 'Quartz in the body changes its crystal form, and the body swells a little.' },
  { rising: 900, text: 'The glaze begins to soften.' },
  { rising: 1050, text: 'Reduction: the kiln is starved of air. The iron in the glaze gives up oxygen and turns it blue-green.' },
  { rising: 1250, text: 'The glaze has melted to a layer of glass over the clay.' },
  { falling: 1000, text: 'Cooling. The glaze stiffens.' },
  { falling: 600, text: 'The glaze has set. From here it shrinks more than the clay beneath it, and is pulled tight.' },
];

const lerpView = (a: View, b: View, u: number): View => {
  const k = THREE.MathUtils.smootherstep(u, 0, 1);
  const out = { ...a };
  for (const key of Object.keys(a) as (keyof View)[]) out[key] = a[key] + (b[key] - a[key]) * k;
  return out;
};
const celsius = (c: number) => `${Math.round(c).toLocaleString('en-US')} °C`;

export async function mount(root: HTMLElement): Promise<() => void> {
  // ?gpu measures render passes with the GPU's own timestamps, for profiling.
  const renderer = new THREE.WebGPURenderer({ antialias: false, trackTimestamp: new URLSearchParams(location.search).has('gpu') });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(root.clientWidth, root.clientHeight);
  renderer.toneMapping = THREE.NeutralToneMapping; // hue-preserving: the blue must not drift
  renderer.shadowMap.enabled = true;
  root.append(renderer.domElement);

  const ui = guide(root, {
    name: 'KILN',
    maker: 'Drawn by the fire.',
    poster: '/yaobian/entrance/kiln.jpg',
    sound: true,
    chapters: [
      { kicker: 'The bowl', text: [
        'A bowl in the manner of Ru ware, the celadon made for the Northern Song court early in the twelfth century.',
        'Its glaze is a soft blue-green, often crackled. No two pieces crackled alike: the potters set the conditions, and the kiln did the rest.',
      ] },
      { kicker: 'Not yet glazed', text: [
        'This one is thrown and dried: grey stoneware, the ring of its foot, nothing more.',
        'You will dip it in glaze. How long you hold it under decides how thick the glaze lies: the one thing the fire will act on.',
      ] },
      { kicker: 'Then you let go', text: [
        'Once the kiln is closed, nothing you do changes what happens to the bowl.',
        'The fire turns the glaze to glass, and blue. The cooling pulls it tight, and it cracks, in a network no one draws.',
      ] },
    ],
    steps: ['Dip', 'Fire', 'Cool', 'Keep'],
    entrance: 'cool',
  });

  const voice = kilnVoice(); // silent until the visitor begins, and sound has begun
  await renderer.init();
  const kiln = await buildKiln(renderer, { onStage: ui.loading });
  kiln.layout(root.clientWidth, root.clientHeight);

  // The bowl before anything: no glaze. The piece shows its crackle at full size.
  const unglazed = () => { glaze.thicknessScale.value = 0; glaze.fired.value = 0; glaze.tension.value = 0; glaze.glow.value = 0; glaze.stain.value = 0; };
  unglazed();
  glaze.legible.value = 1;

  // Presented values.
  const view = follow(damped({ ...VIEWS.table }, 0.5));
  const room = follow(damped({ value: 1 }, 0.35));
  const light = follow(damped({ value: 1 }, 0.3));
  const glow = follow(damped({ value: 0 }, 0.25));
  const stain = follow(damped({ value: 0 }, 0.6));
  const carry = follow(damped({ x: 0, y: kiln.MIDDLE, z: 0, flip: 0 }, 0.2)); // the bowl's middle, and how far turned over
  // How far the hand tips the bowl, radians. Lowered rim down it would trap its air and the glaze
  // would never reach inside; so it goes in at a slant, the air leaving by the high side, and is
  // leveled once the air is out. Lifted, it tips again, and the slip inside runs out.
  const tip = follow(damped({ value: 0 }, 0.3));
  const TIP = { entering: 0.55, under: 0.04, draining: 0.35 };

  let phase: Phase = 'prologue';
  let dipping = false;
  let since = 0; // s since the kiln closed
  let peak = 20;
  let curve: Curve = [];
  let fired: Fired[] | null = null;
  let seed = 1;
  let noted = 0; // notes told
  let cracked = 0; // cracks seen, of the inside
  let seen: Float32Array = new Float32Array(); // the tension at which each is seen, ascending
  let firstAt = 0; // when the first crack opened, s since the kiln closed
  let under = 0; // s the bowl has been in the slip, all dips together
  let inSlip = false, out = 0, drips = 0; // in the slip now; s since it came out; drops owed
  let thisDip = 0, bubbles = 0; // s in the slip this dip; bubbles owed
  const rimPoint = new THREE.Vector3(), rimWorld = new THREE.Vector3(), highest = new THREE.Vector3();
  let lastY = kiln.MIDDLE;
  let pings: Ping[] = [], heardTo = 0, lastTension = 0; // the crackle's pings, in order of tension, and how far heard
  let clock: CoolingClock | null = null, shown = 0; // the open kiln's time map, and how far along it the piece is, s
  let settingDown = false; // carried back to the table: listening for the foot to touch
  let score: Timeline | null = null;
  const pose = new THREE.Vector3();
  let needsRender = true;
  let warmup = 30; // frames drawn regardless, after mounting or a new material

  // The prologue turns the camera with the visitor's scroll.
  const PATH: View[] = [VIEWS.table, VIEWS.aside, VIEWS.body, VIEWS.aside, VIEWS.table];
  ui.onProgress((p) => {
    if (phase !== 'prologue') return;
    const x = p * (PATH.length - 1), i = Math.min(PATH.length - 2, Math.floor(x));
    Object.assign(view.target, lerpView(PATH[i], PATH[i + 1], x - i));
  });

  const loupe = createLoupe(kiln.scene, kiln.camera);
  let lens: { x: number; y: number } | null = null;
  const lean = (x: number | null, y = 0) => {
    lens = x === null ? null : { x, y };
    kiln.setLoupe(lens ? loupe : null);
    needsRender = true;
  };

  // The ritual ------------------------------------------------------------------------------------

  const dipGauge = () => {
    const s = glaze.thicknessScale.value;
    const mm = WELL * s;
    const u = (s - DIP.least) / (DIP.most - DIP.least);
    const text = u < 0.33 ? `${mm.toFixed(2)} mm in the well · thin: a paler glaze, and a fine, close crackle`
      : u < 0.7 ? `${mm.toFixed(2)} mm in the well · even: a clear blue-green, and a crackle of middling size`
        : `${mm.toFixed(2)} mm in the well · thick: a deeper blue, and a wide crackle`;
    ui.meter(mm, { max: WELL * DIP.most, marks: [{ at: WELL * DIP.least, label: 'thin' }, { at: WELL, label: 'even' }, { at: WELL * DIP.most, label: 'thick' }], text });
  };

  // The bowl lifted from the table, turned rim down in the air, and held over the tub.
  const toDip = () => {
    phase = 'carrying';
    under = 0; out = 0; drips = 0;
    ui.step(0);
    ui.say('The bowl is taken to the glaze.');
    ui.actions([]);
    ui.meter(null);
    const quick = reducedMotion ? 0.01 : 1;
    score?.pause();
    score = createTimeline({ defaults: { ease: 'inOutSine' }, onComplete: () => {
      phase = 'dip';
      ui.say('Press and hold to lower it into the glaze. The dry clay drinks the water from the slip and draws the glaze onto itself: the longer under, the thicker.');
      tip.target.value = 0;
    } })
      // Up clear of the tub's rim first, turned over and carried across up there, and only lowered once over the tub.
      .add(carry.target, { y: HOLD.lift, duration: 900 * quick }, 0)
      .add(carry.target, { flip: 1, duration: 1100 * quick }, 500 * quick)
      .add(carry.target, { x: TUB.x, z: TUB.z, duration: 1300 * quick }, 700 * quick)
      .add(carry.target, { y: HOLD.hover, duration: 900 * quick }, 2000 * quick)
      // The camera stands back as it turns to the tub, then comes in: it never passes close by it.
      .add(view.target, { distance: VIEWS.tub.distance, duration: 1000 * quick }, 0)
      .add(view.target, { ...VIEWS.tub, duration: 2200 * quick }, 400 * quick);
  };

  // Back to its place on the table, turned upright, and into the kiln.
  const closeKiln = () => {
    if (phase !== 'dip' || dipping || glaze.thicknessScale.value < DIP.least) return;
    phase = 'carrying';
    tip.target.value = 0;
    ui.actions([]);
    ui.meter(null);
    ui.say('The bowl is set down, and the kiln is closed around it.');
    settingDown = true;
    const quick = reducedMotion ? 0.01 : 1;
    score?.pause();
    score = createTimeline({ defaults: { ease: 'inOutSine' }, onComplete: startFiring })
      // Up out of the tub and clear of its rim before it moves across or turns.
      .add(carry.target, { y: HOLD.lift, duration: 800 * quick }, 0)
      .add(carry.target, { x: 0, z: 0, duration: 1300 * quick }, 700 * quick)
      .add(carry.target, { flip: 0, duration: 1100 * quick }, 900 * quick)
      .add(carry.target, { y: kiln.MIDDLE, duration: 800 * quick }, 1900 * quick)
      // The camera keeps the whole bowl in frame while it is high and turning, then comes in on it.
      .add(view.target, { ...VIEWS.table, ty: 0.11, distance: VIEWS.tub.distance, duration: 1600 * quick }, 0)
      .add(view.target, { ty: VIEWS.table.ty, distance: VIEWS.table.distance, duration: 1200 * quick }, 1500 * quick);
  };

  const startFiring = () => {
    glaze.wet.value = 0;
    phase = 'firing';
    since = 0; peak = 20; curve = []; fired = null; noted = 0; cracked = 0; firstAt = 0;
    seed = Math.floor(Math.random() * 1e6);
    ui.step(1);
    ui.meter(null);
    ui.actions([]);
    ui.clearNotes();
    ui.say('The kiln is closed. From here, nothing you do changes the bowl.');
    const dip = glaze.thicknessScale.value;
    const modes = voice.firing(dip, seed); // the bowl's modes at this dip, as the fire workers strike them
    pings = []; heardTo = 0; lastTension = 0; clock = null; shown = 0;
    void kiln.fire(dip, seed, modes).then((f) => {
      fired = f;
      seen = Float32Array.from(f[0].cracks.map(seenAt)).sort();
      const inside = f.find((s) => s.side === 'inside')!, outside = f.find((s) => s.side === 'outside')!;
      clock = coolingClock(inside.cracks);
      pings = chosen(inside.pings, outside.pings, clock); // struck on the bowl's modes in the workers; chosen here, on the clock the cooling is shown by
      warmup = 30;
    });
  };

  const again = () => {
    if (phase !== 'fired') return;
    unglazed();
    glaze.wet.value = 0;
    ui.clearNotes();
    ui.log(true);
    toDip();
    needsRender = true;
  };

  const keep = () => {
    if (phase !== 'fired' || !fired) return;
    const inside = fired.find((f) => f.side === 'inside')!;
    const well = (WELL * glaze.thicknessScale.value).toFixed(2);
    const date = new Date().toISOString().slice(0, 10);
    showRecord(root, {
      filename: `yaobian-kiln-${well}mm-${seed}.svg`,
      svg: bowlRecord({
        cracks: inside.cracks, radius: kiln.profiles.inside.length, curve, opened: CUE.fire + OPENS,
        caption: `KILN · Ru-type glaze · ${well} mm in the well · ${celsius(peak)}, reduction · ${date}`,
        note: `${inside.stats.cracks.toLocaleString('en-US')} cracks inside · spacing ${inside.stats.spacing.toFixed(1)} mm · seed ${seed}`,
      }),
      // The sound of its cooling, a reconstruction: rendered again from the strikes sent while sound was on, on the same modes.
      extras: voice.recorded ? [{ label: 'Keep its sound  ↓', run: async () => {
        const buffer = await voice.render();
        if (!buffer) return;
        const url = URL.createObjectURL(wav(buffer));
        Object.assign(document.createElement('a'), { href: url, download: `yaobian-kiln-${well}mm-${seed}-cooling.wav` }).click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } }] : [],
    });
  };

  const firedActions = () => ui.actions([
    { label: 'Keep the record', key: 'KeyK', run: keep, primary: true },
    { label: 'Look closer', key: 'KeyL', run: () => lean(lens ? null : root.clientWidth / 2, root.clientHeight * 0.42) },
    ...(voice.recorded && sound.on ? [{ label: 'Hear it cool', key: 'KeyH', run: () => voice.replay() }] : []),
    { label: 'Fire another', key: 'KeyR', run: again },
  ]);

  // Gestures: press and hold to dip, before the firing; to lean in, after it.
  const canvas = renderer.domElement;
  let holdTimer = 0;
  const press = (x: number, y: number) => {
    if (phase === 'dip') {
      dipping = true;
      carry.target.y = HOLD.under;
      tip.target.value = TIP.entering;
      ui.say('In at a slant, so the air inside can leave and the glaze reach in. Hold it under: the glaze builds up on the clay.');
      return;
    }
    if (phase === 'fired') holdTimer = window.setTimeout(() => lean(x, y), 160);
  };
  const release = () => {
    clearTimeout(holdTimer);
    if (lens) lean(null);
    if (!dipping) return;
    dipping = false;
    carry.target.y = HOLD.hover;
    tip.target.value = TIP.draining;
    ui.say('Dip it again to lay on more, or set it in the kiln and let go.');
    ui.actions([{ label: 'Close the kiln', key: 'Enter', run: closeKiln, primary: true }]);
  };
  canvas.addEventListener('pointerdown', (e) => press(e.clientX, e.clientY));
  canvas.addEventListener('pointermove', (e) => { if (lens) lean(e.clientX, e.clientY); });
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointerleave', release);
  const keys = (event: KeyboardEvent) => {
    if (event.code === 'Space' && !event.repeat && phase === 'dip') { press(0, 0); event.preventDefault(); }
  };
  const keysUp = (event: KeyboardEvent) => { if (event.code === 'Space') release(); };
  addEventListener('keydown', keys);
  addEventListener('keyup', keysUp);
  const resize = () => {
    renderer.setSize(root.clientWidth, root.clientHeight);
    kiln.layout(root.clientWidth, root.clientHeight);
    needsRender = true;
  };
  addEventListener('resize', resize);

  ui.ready(toDip);

  const quality = createQuality(renderer, { layout: () => kiln.layout(root.clientWidth, root.clientHeight) });

  // One clock ---------------------------------------------------------------------------------------

  let last = performance.now();
  renderer.setAnimationLoop((now) => {
    // The firing is a schedule in real time, whatever the frame rate; a long gap (a hidden tab) is
    // capped so nothing jumps.
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    let moving = tick(now);
    ui.tick(now); // the sound's clock, and its mark
    let heat = 20;

    // The bowl, carried: the hand tips it a little as it lowers and lifts it.
    {
      const c = carry.current;
      const vy = dt > 0 ? (c.y - lastY) / dt : 0;
      // Set back on the table: its foot touches the wood.
      if (settingDown && c.flip < 0.05 && c.y - kiln.MIDDLE < 0.0004 && lastY - kiln.MIDDLE >= 0.0004) settingDown = false;
      lastY = c.y;
      pose.set(c.x, c.y, c.z);
      const tilt = tip.current.value + THREE.MathUtils.clamp(vy * 1.4, -0.14, 0.14);
      kiln.carry(pose, c.flip, tilt);
      const rimY = c.y + RIM.height * Math.cos(Math.PI * c.flip) - RIM.radius * Math.abs(Math.sin(tilt)); // its lowest point
      const over = Math.hypot(c.x - TUB.x, c.z - TUB.z) < 0.05;
      const nowIn = over && c.flip > 0.9 && rimY < TUB.liquid;
      if (nowIn !== inSlip) {
        kiln.tub.ring(c.x, c.z, RIM.radius, nowIn ? 0.0018 : -0.0009); // the slip parted by the rim, and let go
        inSlip = nowIn;
        out = 0;
        thisDip = 0;
      }
      if (inSlip) {
        under += dt;
        thisDip += dt;
        // The air goes out by the high side of the rim, in bubbles, while the bowl is tipped; then it is leveled.
        if (thisDip < 0.9) {
          bubbles += dt * 16;
          for (; bubbles >= 1; bubbles--) {
            let top = -Infinity;
            for (let k = 0; k < 12; k++) {
              const a = (k / 12) * Math.PI * 2;
              kiln.onBowl(rimPoint.set(Math.cos(a) * RIM.radius, RIM.height, Math.sin(a) * RIM.radius), rimWorld);
              if (rimWorld.y > top) { top = rimWorld.y; highest.copy(rimWorld); }
            }
            // A bubble of the bowl's air, 5 to 12 mm across its radius: its bump in the slip.
            const radius = 0.0085 * (0.6 + Math.random() * 0.8);
            kiln.tub.pop(highest.x + (Math.random() - 0.5) * 0.03, highest.z + (Math.random() - 0.5) * 0.03, radius);
          }
        } else if (dipping) tip.target.value = TIP.under;
        glaze.thicknessScale.value = dipped(under);
        glaze.wet.value = 1;
        dipGauge();
      } else {
        out += dt;
        if (out > 0.9 && !dipping && phase === 'dip') tip.target.value = 0; // drained: held level again
        glaze.wet.value = Math.max(0, glaze.wet.value - dt / 5); // the body drinks the water, thin coat first
        // Drops gather on the rim and fall back, many at first, then fewer.
        if (under > 0 && over && c.flip > 0.9 && out < 3) {
          drips += dt * 10 * Math.exp(-out / 0.7);
          for (; drips >= 1; drips--) {
            const a = Math.random() * Math.PI * 2;
            kiln.tub.drip(new THREE.Vector3(Math.cos(a) * RIM.radius, RIM.height, Math.sin(a) * RIM.radius));
          }
        }
      }
      if (kiln.tub.step(dt, inSlip ? { x: c.x, z: c.z, radius: 0.08 } : null, (a, into) => kiln.onBowl(a, into))) moving = true;
      if (glaze.wet.value > 0.004 && !inSlip) moving = true;
    }

    if (phase === 'firing') {
      // Once the kiln is open its time is read from the cooling's clock, the one the pings were chosen
      // on, so a ping sounds when the picture reaches its tension. Without the clock yet, or before and
      // after, the schedule runs at the score's pace.
      const open = CUE.fire + OPENS, from = shown;
      if (reducedMotion) since += CUE.offer;
      else if (clock && since >= open && since < CUE.settle) { shown += dt; since = CUE.fire + clock.kiln(shown); }
      else {
        const was = since;
        since += dt * (since >= open && since < CUE.settle ? pace(cracked) : 1);
        if (clock && was < open && since >= open) { shown = (since - open) / pace(0); since = CUE.fire + clock.kiln(shown); }
      }
      const t = since - CUE.fire; // s into the schedule
      const T = t > 0 ? temperatureAt(t) : { celsius: 20, step: 'closed' };
      heat = T.celsius;
      peak = Math.max(peak, heat);
      if (t > 0 && (!curve.length || since - curve[curve.length - 1].t > 0.1)) curve.push({ t: since, celsius: heat });
      glaze.fired.value = THREE.MathUtils.smoothstep(peak, 900, 1230);
      // Until the fired crackle is in the glaze, the tension waits.
      glaze.tension.value = fired ? tensionAt(heat, peak > 1200) : 0;

      // The crackle: each ping as the tension crosses its own, placed within the frame. Where reduced
      // motion cuts the firing to its end, nothing is sounded: no avalanche of pings.
      const tension = glaze.tension.value;
      if (since >= CUE.fire + OPENS) voice.cool(heat); // the glaze's loss follows its temperature once the kiln is open
      if (tension > lastTension) {
        const heard: { ping: Ping; u: number }[] = [];
        while (heardTo < pings.length && pings[heardTo].load <= tension) {
          const p = pings[heardTo++];
          // Its place in the frame: by the clock it was chosen on, or else by tension.
          const u = clock && shown > from ? (p.at - from) / (shown - from) : (p.load - lastTension) / (tension - lastTension);
          if (!reducedMotion) heard.push({ ping: p, u: Math.min(1, Math.max(0, u)) });
        }
        if (lastTension === 0) voice.open();
        voice.pings(heard);
        lastTension = tension;
      }

      // The stage, cue by cue.
      const opened = since >= CUE.fire + OPENS;
      room.target.value = since < CUE.room ? 0 : 1;
      light.target.value = since < CUE.dark ? 1 : !opened ? 0 : since < CUE.settle ? 0.18 : 1;
      glow.target.value = opened && since < CUE.settle ? 1 : 0;
      stain.target.value = since > CUE.settle - 1 ? 1 : 0;
      // The bowl is its own light: once the room has gone the camera stands over its well, where the
      // crackle will run, and does not move again until the table returns.
      Object.assign(view.target, since < CUE.dark || since >= CUE.room ? VIEWS.table : VIEWS.well);

      // What the fire is doing.
      const rising = t < SCHEDULE[0].seconds + SCHEDULE[1].seconds;
      while (noted < NOTES.length) {
        const n = NOTES[noted];
        const due = n.rising !== undefined ? rising && heat >= n.rising : !rising && heat <= (n.falling ?? -1);
        if (!due) break;
        ui.note(celsius(n.rising ?? n.falling!), n.text);
        noted++;
      }
      if (t > 0 && !opened) ui.say(`The kiln is firing: ${celsius(heat)}, ${T.step}. Nothing you do changes it now.`, t > 0.3);
      if (fired && opened) {
        let open = 0;
        while (open < seen.length && seen[open] <= glaze.tension.value) open++;
        if (cracked === 0 && open === 0) ui.say(`The kiln is open: ${celsius(heat)}. The glaze cools to where it sets, and tightens.`, heat < 610);
        if (cracked === 0 && open > 0) { ui.step(2); firstAt = since; }
        // The first cracks are seen before they are told.
        if (firstAt && since - firstAt > 0.3 && noted === NOTES.length) {
          noted++;
          ui.note(celsius(heat), 'The first cracks run: the glaze is now tight enough to split. Each runs until it meets the rim or an older crack, and stops there.');
        }
        cracked = open;
        if (open > 0 && since < CUE.settle) ui.say(`${celsius(heat)} · ${open.toLocaleString('en-US')} ${open === 1 ? 'crack' : 'cracks'}`, open > 1);
      }
      if (since >= CUE.settle && noted === NOTES.length + 1 && fired && cracked > 0) {
        noted++;
        const inside = fired[0];
        ui.say('');
        ui.note('cold', `${inside.stats.cracks.toLocaleString('en-US')} cracks, ${inside.stats.spacing.toFixed(1)} mm apart on average, stained as Ge ware stained its crackle: the first cracks dark, the later gold.`);
      }
      if (since >= CUE.done && noted === NOTES.length + 2) {
        noted++;
        ui.log(false); // the bowl is the thing now; the log is in the record
      }
      if (since >= CUE.offer && fired) {
        phase = 'fired';
        glaze.tension.value = 1;
        ui.step(3);
        ui.say('Press and hold anywhere to see the glaze at four times.');
        firedActions();
      }
      moving = true;
    }

    // Read the presented values.
    kiln.place(view.current as View);
    kiln.stage(room.current.value, light.current.value, heat);
    glaze.glow.value = glow.current.value * 1.5;
    glaze.stain.value = stain.current.value;
    if (lens) loupe.aim(lens.x, lens.y, root.clientWidth, root.clientHeight);
    // WebGPU compiles pipelines asynchronously: the first frames after a change can be incomplete.
    if (warmup > 0) { warmup--; needsRender = true; }
    // Anything changed draws afresh; at rest, the still is refined until it has all its samples.
    const fresh = moving || needsRender; // a lens held still is looked through, and refined like the rest
    if (!fresh && kiln.refined) return;
    needsRender = false;
    const resized = quality.frame(fresh);
    kiln.draw(fresh || resized);
    quality.measure();
  });

  if (import.meta.env.DEV) Object.assign(window, { kilnPiece: { renderer, kiln, glaze, CUE, OPENS, quality, carry, sound, voice, get under() { return under; }, get dipping() { return dipping; }, seek: (s: number) => { since = s; }, get since() { return since; }, get cracked() { return cracked; }, get phase() { return phase; } } });

  return () => {
    renderer.setAnimationLoop(null);
    score?.pause();
    for (const v of [view, room, light, glow, stain, carry, tip]) unfollow(v as never);
    removeEventListener('keydown', keys);
    removeEventListener('keyup', keysUp);
    removeEventListener('resize', resize);
    voice.dispose();
    ui.dispose();
    // Leave the shared glaze as the lab expects it.
    glaze.thicknessScale.value = 1; glaze.fired.value = 1; glaze.tension.value = 1; glaze.legible.value = 0; glaze.glow.value = 0; glaze.stain.value = 0; glaze.wet.value = 0;
    renderer.dispose();
    root.replaceChildren();
  };
}
