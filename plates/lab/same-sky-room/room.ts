// The Skyspace: a room of lime plaster, dark below and white above, with a felt bench round its
// walls and a long-pile carpet between; a flat ceiling that floats above the walls on a slot of
// hidden light; and an aperture cut in the ceiling to a knife edge. It comes in two plans: a square
// room with a square aperture, and a round room with a round one.
//
// Both plans are one construction. Every curve in plan is the set of points at a distance from a
// spine square; a spine of no size gives a circle. The walls stand at a distance from the spine,
// the slot and the ceiling's edge outside them; the bench's front and the aperture are curves of
// their own. A parameter σ runs round every curve alike, so the ceiling is a ring between
// the aperture and its own edge, and the aperture's edge is exact in either plan.
//
// Light is solved once, for a unit of each source: the strip of light in the slot, the sky through
// the aperture, and the sun through the aperture from each of several elevations, as it sets.
// Direct light from the strip and the sky is integrated at every vertex. Light between the surfaces
// is a radiosity solution on a coarse grid of the same surfaces, each with its own reflectance,
// interpolated to the fine walls and ceiling and gathered afresh at every fine vertex of the bench
// and the carpet, where the bench's shadow varies fastest. The bench and the wall's top are the
// only obstructions, and light is tested against both. Every surface is neutral in the solve, so
// the room under any wash, sky, and sun is the sum of the solutions, scaled. The sun's direct light
// is left to the renderer, which draws its patch sharp; the solve takes only its bounce.
//
// Pure arithmetic, no three.js: it runs in a worker.

export type Shape = 'square' | 'circle';

export const ROOM = {
  half: 3.6, // m, the wall's half-width, or its radius
  corner: 0.12, // m, the square room's corners: a plastered arris, eased
  top: 3.8, // m, where the walls stop: the slot's floor
  ceiling: 4.4, // m
  reach: 0.3, // m, how far the ceiling runs past the walls, over the slot
  dado: 2.2, // m, the top of the dark lower wall
  aperture: { square: 0.9, circle: 1.0 }, // m, half the square's side, or the circle's radius
  // The strip in the slot, behind the wall's face and just above its top. A wash lens throws most
  // of its light far across the ceiling, as a narrow lobe aimed near the horizontal; the rest
  // spills round the slot and lights the ceiling's edge.
  strip: { inset: 0.1, lift: 0.03, height: 0.03, aim: (76 * Math.PI) / 180, lobe: 6, spill: 0.2 },
};
export const BENCH = { depth: 0.62, seat: 0.45, round: 0.04 };
export const REFLECTANCE = { plaster: 0.85, dado: 0.13, felt: 0.11, carpet: 0.16 };

/**
 * A plan: its spine's half-width, the wall's distance from the spine, and σ's straight share of each
 * side; the bench's front and the aperture, each a curve with its own spine and radius.
 */
export type Curve = { spine: number; radius: number };
export type Plan = { spine: number; wall: number; straight: number; front: Curve; aperture: Curve };
export function planOf(shape: Shape): Plan {
  const inside = ROOM.half - BENCH.depth;
  return shape === 'square'
    ? { spine: ROOM.half - ROOM.corner, wall: ROOM.corner, straight: 0.9, front: { spine: inside - 0.06, radius: 0.06 }, aperture: { spine: ROOM.aperture.square, radius: 0 } }
    : { spine: 0, wall: ROOM.half, straight: 0, front: { spine: 0, radius: inside }, aperture: { spine: 0, radius: ROOM.aperture.circle } };
}
/** Whether a point in plan lies inside the bench's front. */
const insideFront = (plan: Plan, x: number, z: number) => offsetFrom(plan.front.spine, x, z) <= plan.front.radius;

const SIDES = [[1, 0], [0, 1], [-1, 0], [0, -1]];

/**
 * The point at σ ∈ [0, 4) round a spine of half-width `spine`, at distance r from it, with its
 * outward normal in plan. Each unit of σ is one side: its first `straight` share runs along the
 * side, the rest round the corner that follows.
 */
function around(spine: number, straight: number, sigma: number, r: number): { x: number; z: number; nx: number; nz: number } {
  const s = ((sigma % 4) + 4) % 4, k = Math.floor(s) % 4, f = s - Math.floor(s);
  const [nx, nz] = SIDES[k], tx = -nz, tz = nx;
  if (f < straight) {
    const along = -spine + (2 * spine * f) / straight;
    return { x: nx * (spine + r) + tx * along, z: nz * (spine + r) + tz * along, nx, nz };
  }
  const phi = Math.atan2(nz, nx) + ((Math.PI / 2) * (f - straight)) / (1 - straight);
  const cx = Math.cos(phi), cz = Math.sin(phi);
  return { x: (nx + tx) * spine + cx * r, z: (nz + tz) * spine + cz * r, nx: cx, nz: cz };
}

/** Distance in plan from a spine square of half-width `spine`. */
// In the solve's inner loops: Math.hypot is several times slower than the square root.
const offsetFrom = (spine: number, x: number, z: number) => { const dx = Math.max(Math.abs(x) - spine, 0), dz = Math.max(Math.abs(z) - spine, 0); return Math.sqrt(dx * dx + dz * dz); };

/** Signed distance in plan to the aperture's edge: negative inside. */
export function apertureDistance(plan: Plan, x: number, z: number): number {
  const dx = Math.abs(x) - plan.aperture.spine, dz = Math.abs(z) - plan.aperture.spine;
  const ox = Math.max(dx, 0), oz = Math.max(dz, 0);
  return Math.sqrt(ox * ox + oz * oz) + Math.min(Math.max(dx, dz), 0) - plan.aperture.radius;
}

/** The outward normal in plan at a point outside the spine square. */
function normalFrom(spine: number, x: number, z: number): [number, number] {
  const dx = Math.sign(x) * Math.max(Math.abs(x) - spine, 0), dz = Math.sign(z) * Math.max(Math.abs(z) - spine, 0);
  const l = Math.hypot(dx, dz) || 1;
  return [dx / l, dz / l];
}

// Obstructions ---------------------------------------------------------------------------------------

const NUDGE = 0.01; // m off a surface before testing

/**
 * Whether the segment between two points, each nudged off its surface, is clear of the bench and
 * of the wall below the slot.
 * - The bench fills the plan outside its front, below the seat. The front is convex, so the part of
 *   the segment below the seat lies inside it if both ends of that part do.
 * - A point in the slot sees into the room only over the wall's top: where the segment crosses the
 *   wall's face, taken as flat there, it must be above the top.
 */
function clears(plan: Plan, a: number[], b: number[]): boolean {
  const seat = BENCH.seat;
  if (a[1] < seat || b[1] < seat) {
    const t0 = a[1] >= seat ? (a[1] - seat) / (a[1] - b[1]) : 0;
    const t1 = b[1] >= seat ? (a[1] - seat) / (a[1] - b[1]) : 1;
    for (const t of [t0, t1]) {
      if (!insideFront(plan, a[0] + (b[0] - a[0]) * t, a[2] + (b[2] - a[2]) * t)) return false;
    }
  }
  const oa = offsetFrom(plan.spine, a[0], a[2]), ob = offsetFrom(plan.spine, b[0], b[2]);
  const inSlot = (o: number) => o > plan.wall + 1e-4;
  if (inSlot(oa) !== inSlot(ob)) {
    const [q, p, oq] = inSlot(oa) ? [a, b, oa] : [b, a, ob];
    const n = normalFrom(plan.spine, q[0], q[2]);
    const inward = (q[0] - p[0]) * n[0] + (q[2] - p[2]) * n[1];
    if (inward <= 0) return false;
    const t = (oq - plan.wall) / inward;
    if (t <= 1 && q[1] + (p[1] - q[1]) * t < ROOM.top) return false;
  }
  return true;
}

/**
 * How much of the strip, seen from a point in the room, shows over the wall's top. The strip has a
 * height, so the edge of its shadow is a penumbra, not a line; where the segment crosses the wall's
 * face, taken as flat there, its height is linear in the source's.
 */
function stripShows(plan: Plan, s: { p: number[]; n: number[] }, q: number[]): number {
  if (offsetFrom(plan.spine, q[0], q[2]) > plan.wall + 1e-4) return 1; // in the slot itself
  const inward = (s.p[0] - q[0]) * s.n[0] + (s.p[2] - q[2]) * s.n[1];
  if (inward <= 0) return 0;
  const t = ROOM.strip.inset / inward;
  if (t >= 1) return 0;
  const low = s.p[1] - ROOM.strip.height / 2, high = s.p[1] + ROOM.strip.height / 2;
  const least = (ROOM.top - t * q[1]) / (1 - t); // the lowest source height seen over the top
  return Math.min(Math.max((high - least) / (high - low), 0), 1);
}

// Surfaces -------------------------------------------------------------------------------------------

type Point = { q: number[]; n: number[] };
/** A surface swept round the plan: a point at σ ∈ [0, 4) and t ∈ [0, 1]. */
type Sweep = (sigma: number, t: number) => Point;
/** A sweep sampled on a grid, closed round σ; each vertex carries its dual cell's area. */
type Sheet = { rounds: number; rows: number; q: Float64Array; n: Float64Array; area: Float64Array };

function sample(sweep: Sweep, rounds: number, rows: number): Sheet {
  const count = rounds * (rows + 1);
  const q = new Float64Array(count * 3), n = new Float64Array(count * 3), area = new Float64Array(count);
  const ds = 4 / rounds, dt = 1 / rows, e = 1e-5;
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i < rounds; i++) {
      const k = j * rounds + i, s = i * ds, t = j * dt;
      const p = sweep(s, t);
      q.set(p.q, k * 3);
      n.set(p.n, k * 3);
      const t2 = t + e <= 1 ? t + e : t - e;
      const ps = sweep(s + e, t).q.map((x, d) => (x - p.q[d]) / e), pt = sweep(s, t2).q.map((x, d) => (x - p.q[d]) / (t2 - t));
      const cross = [ps[1] * pt[2] - ps[2] * pt[1], ps[2] * pt[0] - ps[0] * pt[2], ps[0] * pt[1] - ps[1] * pt[0]];
      area[k] = Math.hypot(cross[0], cross[1], cross[2]) * ds * dt * (j === 0 || j === rows ? 0.5 : 1);
    }
  }
  return { rounds, rows, q, n, area };
}

/** The room's shell as sweeps, each with its material and its extent across, m. */
function sweeps(plan: Plan): { sweep: Sweep; rho: number; dark: boolean; across: number }[] {
  const { spine, wall, straight, aperture } = plan;
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const face = (r: number, y0: number, y1: number): Sweep => (s, t) => {
    const p = around(spine, straight, s, r);
    return { q: [p.x, lerp(y0, y1, t), p.z], n: [-p.nx, 0, -p.nz] };
  };
  return [
    // The dark lower wall; below the seat it is inside the bench, so it starts a little under the cushion.
    { sweep: face(wall, BENCH.seat - 0.05, ROOM.dado), rho: REFLECTANCE.dado, dark: true, across: ROOM.dado - BENCH.seat },
    { sweep: face(wall, ROOM.dado, ROOM.top), rho: REFLECTANCE.plaster, dark: false, across: ROOM.top - ROOM.dado },
    // The wall's top, the slot's floor, where the strip lies.
    {
      sweep: (s, t) => { const p = around(spine, straight, s, lerp(wall, wall + ROOM.reach, t)); return { q: [p.x, ROOM.top, p.z], n: [0, 1, 0] }; },
      rho: REFLECTANCE.plaster, dark: false, across: ROOM.reach,
    },
    // The slot's back, up to the ceiling.
    { sweep: face(wall + ROOM.reach, ROOM.top, ROOM.ceiling), rho: REFLECTANCE.plaster, dark: false, across: ROOM.ceiling - ROOM.top },
    // The ceiling: a ring from the aperture's knife edge out past the walls.
    {
      sweep: (s, t) => {
        const inner = around(aperture.spine, straight, s, aperture.radius), outer = around(spine, straight, s, wall + ROOM.reach);
        return { q: [lerp(inner.x, outer.x, t), ROOM.ceiling, lerp(inner.z, outer.z, t)], n: [0, -1, 0] };
      },
      rho: REFLECTANCE.plaster, dark: false, across: spine + wall + ROOM.reach - aperture.spine - aperture.radius,
    },
  ];
}

/** The bench's section, from the floor up its front, over its rounded edge, back to the wall. */
function section(step: number, bend: number): { r: number; y: number; nr: number; ny: number; length: number }[] {
  const out: { r: number; y: number; nr: number; ny: number; length: number }[] = [];
  const edge = BENCH.seat - BENCH.round;
  const push = (r: number, y: number, nr: number, ny: number) => out.push({ r, y, nr, ny, length: 0 });
  const front = Math.max(2, Math.round(edge / step));
  for (let i = 0; i <= front; i++) push(0, (edge * i) / front, -1, 0);
  for (let i = 1; i <= bend; i++) {
    const phi = ((Math.PI / 2) * i) / bend;
    push(BENCH.round * (1 - Math.cos(phi)), edge + BENCH.round * Math.sin(phi), -Math.cos(phi), Math.sin(phi));
  }
  const top = Math.max(2, Math.round((BENCH.depth - BENCH.round) / step));
  for (let i = 1; i <= top; i++) push(BENCH.round + ((BENCH.depth - BENCH.round) * i) / top, BENCH.seat, 0, 1);
  for (let i = 0; i < out.length; i++) {
    const prev = out[Math.max(i - 1, 0)], next = out[Math.min(i + 1, out.length - 1)];
    out[i].length = (Math.hypot(out[i].r - prev.r, out[i].y - prev.y) + Math.hypot(next.r - out[i].r, next.y - out[i].y)) / 2;
  }
  return out;
}

/**
 * The bench: stations round the room by samples up its section. Its front and its back, where it
 * meets the wall, are curves of their own; across the seat, each station runs from one to the other.
 */
function bench(plan: Plan, rounds: number, step: number, bend: number): Sheet {
  const cut = section(step, bend);
  const count = rounds * cut.length;
  const q = new Float64Array(count * 3), n = new Float64Array(count * 3), area = new Float64Array(count);
  const ds = 4 / rounds, e = 1e-5;
  /** The point at σ, a share w of the way from the front's curve to the wall's, with the front's normal. */
  const across = (sigma: number, w: number) => {
    const f = around(plan.front.spine, plan.straight, sigma, plan.front.radius), b = around(plan.spine, plan.straight, sigma, plan.wall);
    return { x: f.x + (b.x - f.x) * w, z: f.z + (b.z - f.z) * w, nx: f.nx, nz: f.nz };
  };
  for (let j = 0; j < cut.length; j++) {
    for (let i = 0; i < rounds; i++) {
      const k = j * rounds + i, c = cut[j], w = c.r / BENCH.depth;
      const p = across(i * ds, w), p2 = across(i * ds + e, w);
      q.set([p.x, c.y, p.z], k * 3);
      n.set([p.nx * c.nr, c.ny, p.nz * c.nr], k * 3);
      area[k] = (Math.hypot(p2.x - p.x, p2.z - p.z) / e) * ds * c.length;
    }
  }
  return { rounds, rows: cut.length - 1, q, n, area };
}

/** The carpet: the floor inside the bench, a little beyond its front so the joint is covered. */
function carpet(plan: Plan, step: number, margin: number): { size: number; q: Float64Array; area: Float64Array; drawn: Uint8Array } {
  const half = plan.front.spine + plan.front.radius + margin;
  const size = Math.round((2 * half) / step), d = (2 * half) / size;
  const count = (size + 1) ** 2;
  const q = new Float64Array(count * 3), area = new Float64Array(count), drawn = new Uint8Array(count);
  for (let j = 0; j <= size; j++) {
    for (let i = 0; i <= size; i++) {
      const k = j * (size + 1) + i, x = -half + i * d, z = -half + j * d, o = offsetFrom(plan.front.spine, x, z);
      q.set([x, 0, z], k * 3);
      drawn[k] = o <= plan.front.radius + margin ? 1 : 0;
      area[k] = o <= plan.front.radius ? d * d : 0; // only what the room sees takes part in the light
    }
  }
  return { size, q, area, drawn };
}

// Sources ------------------------------------------------------------------------------------------

/** The strip: points round the slot, each with its outward normal in plan, its lens's axis, and its length. */
function stripOf(plan: Plan, count: number): { p: number[]; n: number[]; axis: number[]; dl: number }[] {
  const out = [];
  const r = plan.wall + ROOM.strip.inset, ds = 4 / count, e = 1e-5, a = ROOM.strip.aim;
  for (let i = 0; i < count; i++) {
    const s = (i + 0.5) * ds, p = around(plan.spine, plan.straight, s, r), p2 = around(plan.spine, plan.straight, s + e, r);
    out.push({
      p: [p.x, ROOM.top + ROOM.strip.lift, p.z], n: [p.nx, p.nz],
      axis: [-p.nx * Math.sin(a), Math.cos(a), -p.nz * Math.sin(a)], dl: (Math.hypot(p2.x - p.x, p2.z - p.z) / e) * ds,
    });
  }
  return out;
}
/**
 * The strip's intensity in a direction, per unit of emitted flux: a cosᵏ lobe about the lens's
 * axis, (k + 1) / 2π at its peak, and the spill, Lambertian about the vertical, 1 / π at its peak.
 */
function emission(axisCos: number, upCos: number): number {
  const { lobe, spill } = ROOM.strip;
  // The lobe's integer power by multiplication: in the solve's inner loop, ** costs several times more.
  const c = Math.max(axisCos, 0);
  let power = 1;
  for (let k = 0; k < lobe; k++) power *= c;
  return (1 - spill) * ((lobe + 1) / (2 * Math.PI)) * power + (spill / Math.PI) * Math.max(upCos, 0);
}

/** Points over the aperture, each with its share of area. */
function apertureOf(plan: Plan, n: number): { x: number; z: number; dA: number }[] {
  const extent = plan.aperture.spine + plan.aperture.radius, d = (2 * extent) / n, out = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = -extent + (i + 0.5) * d, z = -extent + (j + 0.5) * d;
    if (apertureDistance(plan, x, z) < 0) out.push({ x, z, dA: d * d });
  }
  return out;
}

// Solve --------------------------------------------------------------------------------------------
//
// In three steps, so the work can be shared among workers (room-worker.ts): the coarse radiosity,
// in one; the fine vertices, in runs, in all of them; and the room put together, in one. solveRoom
// does all three in turn.

/**
 * A drawn part of the room: triangles with, at every vertex, its irradiance from a unit of each
 * source; from the suns by bounce alone, one value for each sun in turn.
 */
export type Part = { positions: Float32Array; normals: Float32Array; strip: Float32Array; sky: Float32Array; sun: Float32Array; index: Uint32Array };
/**
 * The solved room. `edge` is the ceiling's irradiance at the aperture's edge from a unit strip.
 * `seen` is the mean irradiance over the white surfaces in view, the upper walls and the ceiling,
 * from a unit of each source: the strip, the sky, and each sun, by bounce alone; it is what the eye
 * adapts to, which takes the sun's own patch as a highlight, not as the room's light.
 */
export type RoomLight = { shape: Shape; suns: number; white: Part; dado: Part; felt: Part; carpet: Part; edge: number; seen: number[]; seconds: number };

const SUBSAMPLES = 8; // a side: the sun's patch is sharp, so a patch's share of it is found over the patch's area
const CONVERGED = 1e-5; // the largest change in a sweep, relative to each source's brightest direct light
const KERNEL = 0.3; // m: the width of the Gaussian that carries the coarse indirect light to the fine walls and ceiling
const FINE = 0.05, COARSE = 0.4; // m: the drawn surfaces' step, and the radiosity's

/** The surfaces the room is drawn in: the shell's five, in the order of `sweeps`, then the bench and the carpet. */
export const SURFACES = ['dado', 'upper', 'top', 'cove', 'ceiling', 'bench', 'carpet'] as const;
export type Surface = (typeof SURFACES)[number];

/** What every step of the solve shares for a plan: its surfaces, its strip and aperture, and the direct light from them. Made once for each plan. */
const grounds = new Map<Shape, ReturnType<typeof makeGround>>();
function groundOf(shape: Shape) {
  if (!grounds.has(shape)) grounds.set(shape, makeGround(shape));
  return grounds.get(shape)!;
}
function makeGround(shape: Shape) {
  const plan = planOf(shape);
  const strip = stripOf(plan, 240), sky = apertureOf(plan, 18).map((a) => ({ ...a, p: [a.x, ROOM.ceiling, a.z] }));
  const perimeter = (r: number) => 8 * plan.spine + 2 * Math.PI * r;
  const roundsAt = (r: number, step: number) => Math.max(24, Math.round(perimeter(r) / step / 4) * 4);

  /** Whether a unit of sun from `sun` reaches a point with a normal through the aperture, times its cosine there. */
  const sunOn = (q: ArrayLike<number>, n: ArrayLike<number>, o: number, sun: number[]): number => {
    if (sun[1] <= 0) return 0;
    const cos = n[o] * sun[0] + n[o + 1] * sun[1] + n[o + 2] * sun[2];
    if (cos <= 0) return 0;
    const p = [q[o] + n[o] * NUDGE, q[o + 1] + n[o + 1] * NUDGE, q[o + 2] + n[o + 2] * NUDGE];
    const t = (ROOM.ceiling - p[1]) / sun[1], hit = [p[0] + sun[0] * t, ROOM.ceiling, p[2] + sun[2] * t];
    return apertureDistance(plan, hit[0], hit[2]) < 0 && clears(plan, p, hit) ? cos : 0;
  };
  /** Direct irradiance at a point with a normal from a unit strip and a unit sky. */
  const direct = (q: ArrayLike<number>, n: ArrayLike<number>, o: number): [number, number] => {
    const p = [q[o] + n[o] * NUDGE, q[o + 1] + n[o + 1] * NUDGE, q[o + 2] + n[o + 2] * NUDGE];
    let fromStrip = 0, fromSky = 0;
    for (const s of strip) {
      const dx = q[o] - s.p[0], dy = q[o + 1] - s.p[1], dz = q[o + 2] - s.p[2];
      const r2 = dx * dx + dy * dy + dz * dz, r = Math.sqrt(r2);
      const intensity = emission((dx * s.axis[0] + dy * s.axis[1] + dz * s.axis[2]) / r, dy / r), receive = -(dx * n[o] + dy * n[o + 1] + dz * n[o + 2]) / r;
      if (intensity <= 0 || receive <= 0) continue;
      const shows = stripShows(plan, s, p);
      if (shows <= 0 || (p[1] < BENCH.seat && !clears(plan, p, s.p))) continue;
      fromStrip += (shows * intensity * receive * s.dl) / (r2 + 0.0025);
    }
    // Only a point below the seat or in the slot can have its view of the aperture blocked.
    const blockable = p[1] < BENCH.seat || offsetFrom(plan.spine, p[0], p[2]) > plan.wall + 1e-4;
    for (const a of sky) {
      const dx = a.x - q[o], dy = ROOM.ceiling - q[o + 1], dz = a.z - q[o + 2];
      if (dy <= 1e-6) continue;
      const r2 = dx * dx + dy * dy + dz * dz, r = Math.sqrt(r2);
      const receive = (dx * n[o] + dy * n[o + 1] + dz * n[o + 2]) / r;
      if (receive <= 0 || (blockable && !clears(plan, p, a.p))) continue;
      fromSky += (receive * (dy / r) * a.dA) / r2;
    }
    return [fromStrip, fromSky];
  };
  return { plan, shell: sweeps(plan), roundsAt, sunOn, direct, fines: new Map<Surface, Fine>() };
}
type Ground = ReturnType<typeof makeGround>;

/**
 * The coarse solution for a plan: every patch's place, normal, area, and reflectance; from a unit
 * of each source, its direct light and its total; where each of the shell's surfaces begins among the
 * patches and how many it has; and what the eye adapts to.
 */
export type Coarse = {
  S: number; P: number; pq: Float64Array; pn: Float64Array; area: Float64Array; rho: Float64Array;
  direct: Float64Array; total: Float64Array; surfaces: [number, number][]; seen: number[];
};

/** The coarse radiosity: every vertex of every coarse surface is a patch. */
export function solveCoarse(shape: Shape, suns: number[][]): Coarse {
  const g = groundOf(shape), { plan, shell, roundsAt } = g;
  const S = 2 + suns.length; // sources: the strip, the sky, each sun
  const coarseRounds = roundsAt(plan.wall, COARSE);
  const coarse = shell.map((s) => sample(s.sweep, coarseRounds, Math.max(1, Math.round(s.across / COARSE))));
  const coarseBench = bench(plan, roundsAt(plan.front.radius, COARSE), 0.19, 2);
  const coarseCarpet = carpet(plan, 0.35, 0);
  const list: { q: number[]; n: number[]; area: number; rho: number }[] = [];
  const surfaces: [number, number][] = [];
  coarse.forEach((surface, si) => {
    surfaces.push([list.length, surface.area.length]);
    for (let k = 0; k < surface.area.length; k++) list.push({ q: [...surface.q.subarray(k * 3, k * 3 + 3)], n: [...surface.n.subarray(k * 3, k * 3 + 3)], area: surface.area[k], rho: shell[si].rho });
  });
  for (let k = 0; k < coarseBench.area.length; k++) list.push({ q: [...coarseBench.q.subarray(k * 3, k * 3 + 3)], n: [...coarseBench.n.subarray(k * 3, k * 3 + 3)], area: coarseBench.area[k], rho: REFLECTANCE.felt });
  for (let k = 0; k < coarseCarpet.area.length; k++) {
    if (coarseCarpet.area[k] > 0) list.push({ q: [...coarseCarpet.q.subarray(k * 3, k * 3 + 3)], n: [0, 1, 0], area: coarseCarpet.area[k], rho: REFLECTANCE.carpet });
  }
  const P = list.length;
  const pq = new Float64Array(P * 3), pn = new Float64Array(P * 3), area = new Float64Array(P), rho = new Float64Array(P);
  list.forEach((p, i) => { pq.set(p.q, i * 3); pn.set(p.n, i * 3); area[i] = p.area; rho[i] = p.rho; });
  const at = nudgedOf(pq, pn);
  const tested = (i: number) => pq[i * 3 + 1] < BENCH.seat + 0.5 || offsetFrom(plan.spine, pq[i * 3], pq[i * 3 + 2]) > plan.wall + 1e-4;

  // Form factors, point to patch, regularized for near neighbours, with the patch's reflectance:
  // the share of its irradiance each patch passes on. Kept as sparse rows: a patch sees about half
  // the room.
  const F = new Float32Array(P * P);
  for (let i = 0; i < P; i++) {
    const ai = at(i), ti = tested(i);
    for (let j = 0; j < P; j++) {
      if (i === j) continue;
      const dx = pq[j * 3] - pq[i * 3], dy = pq[j * 3 + 1] - pq[i * 3 + 1], dz = pq[j * 3 + 2] - pq[i * 3 + 2];
      const r2 = dx * dx + dy * dy + dz * dz;
      if (r2 < 1e-10) continue; // a surface's closing row meets its neighbour's: the same point twice
      const r = Math.sqrt(r2);
      const ci = (dx * pn[i * 3] + dy * pn[i * 3 + 1] + dz * pn[i * 3 + 2]) / r, cj = -(dx * pn[j * 3] + dy * pn[j * 3 + 1] + dz * pn[j * 3 + 2]) / r;
      if (ci <= 0 || cj <= 0) continue;
      if ((ti || tested(j)) && !clears(plan, ai, at(j))) continue;
      F[i * P + j] = ((ci * cj * area[j]) / (Math.PI * r2 + area[j])) * rho[j];
    }
  }
  const rowStart = new Int32Array(P + 1);
  for (let i = 0; i < P; i++) { let c = 0; for (let j = 0; j < P; j++) if (F[i * P + j] > 0) c++; rowStart[i + 1] = rowStart[i] + c; }
  const cols = new Int32Array(rowStart[P]), factors = new Float32Array(rowStart[P]);
  for (let i = 0, k = 0; i < P; i++) for (let j = 0; j < P; j++) if (F[i * P + j] > 0) { cols[k] = j; factors[k++] = F[i * P + j]; }

  // Direct light on the patches, S values each. The sun's patch is sharp, so each patch's share of
  // it is found over the patch's own area, not at its middle, or it would flicker from patch to
  // patch as the sun sets. The bench and the carpet lie below every sun the room is solved for.
  const direct0 = new Float64Array(P * S);
  for (let i = 0; i < P; i++) {
    const d = g.direct(pq, pn, i * 3);
    direct0[i * S] = d[0]; direct0[i * S + 1] = d[1];
    suns.forEach((sun, m) => { direct0[i * S + 2 + m] = g.sunOn(pq, pn, i * 3, sun); });
  }
  coarse.forEach((surface, si) => {
    const sweep = shell[si].sweep, ds = 4 / surface.rounds, dt = 1 / surface.rows, N = SUBSAMPLES;
    for (let j = 0; j <= surface.rows; j++) {
      const t0 = Math.max(j * dt - dt / 2, 0), t1 = Math.min(j * dt + dt / 2, 1);
      for (let i = 0; i < surface.rounds; i++) {
        const k = surfaces[si][0] + j * surface.rounds + i, sums = new Float64Array(suns.length);
        for (let b = 0; b < N; b++) for (let a = 0; a < N; a++) {
          const p = sweep((i + (a + 0.5) / N - 0.5) * ds, t0 + ((b + 0.5) / N) * (t1 - t0));
          suns.forEach((sun, m) => { sums[m] += g.sunOn(p.q, p.n, 0, sun); });
        }
        suns.forEach((_, m) => { direct0[k * S + 2 + m] = sums[m] / (N * N); });
      }
    }
  });

  // Gauss–Seidel, every source in one pass over the form factors, until no source changes.
  const total = Float64Array.from(direct0);
  const brightest = new Float64Array(S);
  for (let i = 0; i < P; i++) for (let s = 0; s < S; s++) brightest[s] = Math.max(brightest[s], direct0[i * S + s]);
  const acc = new Float64Array(S);
  let passes = 0;
  for (let change = Infinity; change > CONVERGED && passes < 60; passes++) {
    change = 0;
    for (let i = 0; i < P; i++) {
      // The sources five at a time, each summed in a local: the inner loop is the solve's hottest.
      for (let s0 = 0; s0 < S; s0 += 5) {
        let a0 = 0, a1 = 0, a2 = 0, a3 = 0, a4 = 0;
        const n = Math.min(S - s0, 5);
        for (let k = rowStart[i]; k < rowStart[i + 1]; k++) {
          const f = factors[k], o = cols[k] * S + s0;
          a0 += f * total[o];
          if (n > 1) a1 += f * total[o + 1];
          if (n > 2) a2 += f * total[o + 2];
          if (n > 3) a3 += f * total[o + 3];
          if (n > 4) a4 += f * total[o + 4];
        }
        acc[s0] = a0;
        if (n > 1) acc[s0 + 1] = a1;
        if (n > 2) acc[s0 + 2] = a2;
        if (n > 3) acc[s0 + 3] = a3;
        if (n > 4) acc[s0 + 4] = a4;
      }
      for (let s = 0; s < S; s++) {
        const v = direct0[i * S + s] + acc[s];
        change = Math.max(change, Math.abs(v - total[i * S + s]) / (brightest[s] || 1));
        total[i * S + s] = v;
      }
    }
  }

  // What the eye adapts to: the mean light on the upper walls and the ceiling, the sun's patch aside.
  const seen = new Array<number>(S).fill(0);
  let seenArea = 0;
  for (const si of [1, 4]) {
    const [first, count] = surfaces[si];
    for (let i = first; i < first + count; i++) {
      for (let s = 0; s < S; s++) seen[s] += (total[i * S + s] - (s >= 2 ? direct0[i * S + s] : 0)) * area[i];
      seenArea += area[i];
    }
  }
  return { S, P, pq, pn, area, rho, direct: direct0, total, surfaces, seen: seen.map((x) => x / seenArea) };
}

/** The patches' places, each nudged off its surface. */
function nudgedOf(pq: Float64Array, pn: Float64Array): (i: number) => number[] {
  const nudged = Array.from({ length: pq.length / 3 }, (_, i) => [pq[i * 3] + pn[i * 3] * NUDGE, pq[i * 3 + 1] + pn[i * 3 + 1] * NUDGE, pq[i * 3 + 2] + pn[i * 3 + 2] * NUDGE]);
  return (i) => nudged[i];
}

/** A surface's fine grid: `rounds` vertices a row, and its rows; the shell's and the bench's close round the plan. */
type Grid = { rounds: number; rows: number; count: number };
const CARPET = { step: FINE * 1.5, margin: 0.05 };
function gridOf(g: Ground, surface: Surface): Grid {
  const { plan, shell, roundsAt } = g;
  const si = SURFACES.indexOf(surface);
  if (si < shell.length) {
    // The slot's surfaces, small and close to the strip, take a finer row.
    const rounds = roundsAt(plan.wall + ROOM.reach, FINE), rows = Math.max(2, Math.round(shell[si].across / (surface === 'top' || surface === 'cove' ? FINE / 2 : FINE)));
    return { rounds, rows, count: rounds * (rows + 1) };
  }
  if (surface === 'bench') {
    const rounds = roundsAt(plan.wall, FINE), rows = section(FINE, 6).length - 1;
    return { rounds, rows, count: rounds * (rows + 1) };
  }
  const size = Math.round((2 * (plan.front.spine + plan.front.radius + CARPET.margin)) / CARPET.step);
  return { rounds: size + 1, rows: size, count: (size + 1) ** 2 };
}
/** A surface's fine vertices as drawn: places and normals on its grid. The carpet's also marks the vertices drawn. Made once in each worker. */
type Fine = Grid & { q: Float64Array; n: Float64Array; drawn?: Uint8Array };
function fineOf(g: Ground, surface: Surface): Fine {
  if (!g.fines.has(surface)) g.fines.set(surface, makeFine(g, surface));
  return g.fines.get(surface)!;
}
function makeFine(g: Ground, surface: Surface): Fine {
  const { plan, shell } = g, grid = gridOf(g, surface);
  const si = SURFACES.indexOf(surface);
  if (si < shell.length) {
    const f = sample(shell[si].sweep, grid.rounds, grid.rows);
    return { ...grid, q: f.q, n: f.n };
  }
  if (surface === 'bench') {
    const b = bench(plan, grid.rounds, FINE, 6);
    return { ...grid, q: b.q, n: b.n };
  }
  const c = carpet(plan, CARPET.step, CARPET.margin), n = new Float64Array(c.q.length);
  for (let k = 0; k < n.length / 3; k++) n[k * 3 + 1] = 1;
  return { ...grid, q: c.q, n, drawn: c.drawn };
}

/** How many fine vertices each surface has, in the order of SURFACES: to share the work out. */
export function fineCounts(shape: Shape): number[] {
  const g = groundOf(shape);
  return SURFACES.map((surface) => gridOf(g, surface).count);
}

/**
 * A run of a surface's fine vertices, `from` up to `to`, with at each its irradiance from a unit of
 * each source, S values: the strip, the sky, then each sun, by bounce alone. A run of the ceiling
 * that includes its first row, at the aperture's edge, adds up the strip's light along it.
 */
export type Run = { surface: Surface; from: number; to: number; light: Float32Array; edge: [number, number] };

/**
 * The direct light at a run's fine vertices from a unit strip and a unit sky, two values each. It
 * needs no coarse solution, so it is found while the coarse radiosity is solved.
 */
export function directRun(shape: Shape, surface: Surface, from: number, to: number): Float64Array {
  const g = groundOf(shape), fine = fineOf(g, surface), out = new Float64Array((to - from) * 2);
  for (let k = from; k < to; k++) out.set(g.direct(fine.q, fine.n, k * 3), (k - from) * 2);
  return out;
}

/**
 * A run's light: its direct light, and the indirect under the coarse solution. On walls, slot, and
 * ceiling, the coarse indirect is carried over by a Gaussian weighting of the same surface's patches
 * round each vertex, smooth whatever the mesh's layout. On the bench and the carpet it is gathered
 * afresh and tested, since the bench's shadow varies fastest there.
 */
export function solveRun(shape: Shape, coarse: Coarse, surface: Surface, from: number, to: number, direct = directRun(shape, surface, from, to)): Run {
  const g = groundOf(shape), { plan } = g, fine = fineOf(g, surface);
  const { S, P, pq, pn, area, rho, direct: direct0, total } = coarse;
  const light = new Float32Array((to - from) * S), vertex = new Float64Array(S);
  const edge: [number, number] = [0, 0];
  const si = SURFACES.indexOf(surface);
  if (si < coarse.surfaces.length) {
    const [first, count] = coarse.surfaces[si];
    for (let k = from; k < to; k++) {
      const o = k * 3, d = (k - from) * 2;
      vertex.fill(0);
      let weight = 0;
      for (let m = 0; m < count; m++) {
        const pm = (first + m) * 3;
        const dx = pq[pm] - fine.q[o], dy = pq[pm + 1] - fine.q[o + 1], dz = pq[pm + 2] - fine.q[o + 2], r2 = dx * dx + dy * dy + dz * dz;
        if (r2 > 9 * KERNEL * KERNEL) continue;
        const w = Math.exp(-r2 / (2 * KERNEL * KERNEL)), row = (first + m) * S;
        for (let src = 0; src < S; src++) vertex[src] += w * (total[row + src] - direct0[row + src]);
        weight += w;
      }
      for (let src = 0; src < S; src++) vertex[src] = (src < 2 ? direct[d + src] : 0) + (weight > 0 ? vertex[src] / weight : 0);
      light.set(vertex, (k - from) * S);
      if (surface === 'ceiling' && k < fine.rounds) {
        // The aperture's edge: weight each vertex by the edge's length there.
        const next = ((k + 1) % fine.rounds) * 3, length = Math.hypot(fine.q[next] - fine.q[o], fine.q[next + 2] - fine.q[o + 2]);
        edge[0] += vertex[0] * length; edge[1] += length;
      }
    }
    return { surface, from, to, light, edge };
  }
  const radiosity = total.map((x, k) => x * rho[Math.floor(k / S)]);
  const at = nudgedOf(pq, pn);
  for (let k = from; k < to; k++) {
    const q = fine.q, n = fine.n, o = k * 3, d = (k - from) * 2;
    const p = [q[o] + n[o] * NUDGE, q[o + 1] + n[o + 1] * NUDGE, q[o + 2] + n[o + 2] * NUDGE];
    vertex.fill(0);
    for (let j = 0; j < P; j++) {
      const dx = pq[j * 3] - q[o], dy = pq[j * 3 + 1] - q[o + 1], dz = pq[j * 3 + 2] - q[o + 2];
      const r2 = dx * dx + dy * dy + dz * dz;
      if (r2 < 1e-10) continue;
      const r = Math.sqrt(r2);
      const ci = (dx * n[o] + dy * n[o + 1] + dz * n[o + 2]) / r, cj = -(dx * pn[j * 3] + dy * pn[j * 3 + 1] + dz * pn[j * 3 + 2]) / r;
      if (ci <= 0 || cj <= 0 || !clears(plan, p, at(j))) continue;
      const f = (ci * cj * area[j]) / (Math.PI * r2 + area[j]);
      for (let s = 0; s < S; s++) vertex[s] += f * radiosity[j * S + s];
    }
    vertex[0] += direct[d]; vertex[1] += direct[d + 1];
    light.set(vertex, (k - from) * S);
  }
  return { surface, from, to, light, edge };
}

/** The room put together from runs that cover every surface: its parts, their triangles, and the edge's light. */
export function assemble(shape: Shape, coarse: Coarse, runs: Run[], seconds: number): RoomLight {
  const g = groundOf(shape), { S } = coarse;
  const partOf = (surface: Surface) => (surface === 'dado' ? 'dado' : surface === 'bench' ? 'felt' : surface === 'carpet' ? 'carpet' : 'white');
  const drawn = { white: [] as Surface[], dado: [] as Surface[], felt: [] as Surface[], carpet: [] as Surface[] };
  for (const surface of SURFACES) drawn[partOf(surface)].push(surface);
  let edge = 0, edgeLength = 0;
  for (const run of runs) { edge += run.edge[0]; edgeLength += run.edge[1]; }
  const build = (surfaces: Surface[]): Part => {
    const fines = surfaces.map((surface) => fineOf(g, surface));
    const count = fines.reduce((c, f) => c + f.count, 0);
    const positions = new Float32Array(count * 3), normals = new Float32Array(count * 3), strip = new Float32Array(count), sky = new Float32Array(count), sun = new Float32Array(count * (S - 2));
    const index: number[] = [];
    let base = 0;
    surfaces.forEach((surface, n) => {
      const fine = fines[n];
      positions.set(fine.q, base * 3);
      normals.set(fine.n, base * 3);
      for (const run of runs.filter((r) => r.surface === surface)) {
        for (let k = run.from; k < run.to; k++) {
          const at = (k - run.from) * S, v = base + k;
          strip[v] = run.light[at]; sky[v] = run.light[at + 1];
          for (let m = 2; m < S; m++) sun[v * (S - 2) + m - 2] = run.light[at + m];
        }
      }
      if (fine.drawn) {
        const d = fine.drawn, s1 = fine.rounds;
        for (let j = 0; j < fine.rows; j++) for (let i = 0; i < fine.rows; i++) {
          const a = j * s1 + i, b = a + 1, c = a + s1, e = c + 1;
          if (d[a] || d[b] || d[c] || d[e]) index.push(base + a, base + c, base + b, base + b, base + c, base + e);
        }
      } else {
        for (let j = 0; j < fine.rows; j++) for (let i = 0; i < fine.rounds; i++) {
          const a = base + j * fine.rounds + i, c = base + j * fine.rounds + ((i + 1) % fine.rounds), d = a + fine.rounds, e = c + fine.rounds;
          index.push(a, c, d, c, e, d);
        }
      }
      base += fine.count;
    });
    return { positions, normals, strip, sky, sun, index: Uint32Array.from(index) };
  };
  return {
    shape, suns: S - 2, white: build(drawn.white), dado: build(drawn.dado), felt: build(drawn.felt), carpet: build(drawn.carpet),
    edge: edge / edgeLength, seen: coarse.seen, seconds,
  };
}

/**
 * The room's surfaces with, at every vertex, its irradiance from a unit strip, a unit sky, and, by
 * bounce alone, a unit of sun from each of the directions `suns` (toward it): the three steps in turn.
 */
export function solveRoom(shape: Shape, suns: number[][]): RoomLight {
  const started = performance.now();
  const coarse = solveCoarse(shape, suns);
  const counts = fineCounts(shape);
  const runs = SURFACES.map((surface, n) => solveRun(shape, coarse, surface, 0, counts[n]));
  return assemble(shape, coarse, runs, (performance.now() - started) / 1000);
}
