// PLUMB's model: a square net of string, knotted at every crossing, tied by its four corners to
// four posts, and loaded with lead weights. Nothing about its shape is written here: it hangs.
//
// The solver is position-based dynamics (Müller et al., 2007): each knot is a mass that falls, and
// each string between two knots is a constraint that it be no longer than its length. A string can
// go slack; it cannot stretch. Knots move by Verlet integration with a little air damping, at a
// fixed step, and the constraints are projected many times a step, heavier knots moving less. The
// net comes to rest in the shape its weights and supports give it: the funicular form, the shape
// that carries those loads in pure tension.
//
// Model space: meters, the supports at y = 0, the net below them.

export type NetOptions = {
  knots: number; // per side
  string: number; // m between neighbouring knots
  span: number; // m between neighbouring supports: less than the net's side, so it hangs
  knotMass: number; // kg, a knot and its share of string
};
export const NET_DEFAULTS: NetOptions = { knots: 15, string: 0.04, span: 0.5, knotMass: 0.002 };

const GRAVITY = 9.81;
const STEP = 1 / 240; // s
const ITERATIONS = 40;
const DAMPING = 0.985; // of a knot's velocity, per step: air, and the string's own friction

export type Net = ReturnType<typeof createNet>;

export function createNet(o: NetOptions = NET_DEFAULTS) {
  const n = o.knots, count = n * n;
  const position = new Float64Array(count * 3), previous = new Float64Array(count * 3);
  const load = new Float64Array(count); // kg of lead hung at each knot
  const inverse = new Float64Array(count); // 1 / mass; 0 for a knot tied to a post
  const supports = [0, n - 1, n * (n - 1), n * n - 1];
  const index = (i: number, j: number) => j * n + i;

  // The strings: between each knot and its neighbours along the two directions.
  const pairs: number[] = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    if (i < n - 1) pairs.push(index(i, j), index(i + 1, j));
    if (j < n - 1) pairs.push(index(i, j), index(i, j + 1));
  }
  const strings = new Uint32Array(pairs);

  /** Lay the net out flat within its supports, slack, as it is before it is let hang. */
  function lay(): void {
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = index(i, j);
      const x = (i / (n - 1) - 0.5) * o.span, z = (j / (n - 1) - 0.5) * o.span;
      position.set([x, 0, z], k * 3);
      previous.set([x, 0, z], k * 3);
    }
    weigh();
  }
  function weigh(): void {
    for (let k = 0; k < count; k++) inverse[k] = supports.includes(k) ? 0 : 1 / (o.knotMass + load[k]);
  }

  /** Advance by one fixed step; returns the fastest knot's speed, m/s. */
  function step(): number {
    const g = GRAVITY * STEP * STEP;
    let fastest = 0;
    for (let k = 0; k < count; k++) {
      if (inverse[k] === 0) continue;
      const a = k * 3;
      for (let c = 0; c < 3; c++) {
        const p = position[a + c], v = (p - previous[a + c]) * DAMPING;
        previous[a + c] = p;
        position[a + c] = p + v - (c === 1 ? g : 0);
      }
    }
    for (let it = 0; it < ITERATIONS; it++) {
      for (let s = 0; s < strings.length; s += 2) {
        const a = strings[s], b = strings[s + 1];
        const wa = inverse[a], wb = inverse[b], w = wa + wb;
        if (w === 0) continue;
        const dx = position[b * 3] - position[a * 3], dy = position[b * 3 + 1] - position[a * 3 + 1], dz = position[b * 3 + 2] - position[a * 3 + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d <= o.string) continue; // slack
        const f = (d - o.string) / (d * w);
        position[a * 3] += dx * f * wa; position[a * 3 + 1] += dy * f * wa; position[a * 3 + 2] += dz * f * wa;
        position[b * 3] -= dx * f * wb; position[b * 3 + 1] -= dy * f * wb; position[b * 3 + 2] -= dz * f * wb;
      }
    }
    for (let k = 0; k < count; k++) {
      const a = k * 3;
      const vx = position[a] - previous[a], vy = position[a + 1] - previous[a + 1], vz = position[a + 2] - previous[a + 2];
      fastest = Math.max(fastest, Math.sqrt(vx * vx + vy * vy + vz * vz) / STEP);
    }
    return fastest;
  }

  lay();
  return {
    options: o, knots: n, count, position, load, strings, supports, index,
    step, lay,
    STEP,
    /** Hang lead at a knot, kg; a negative amount takes it off. */
    hang(k: number, kg: number): void { load[k] = Math.max(0, load[k] + kg); weigh(); },
    /** Every weight taken off. */
    unload(): void { load.fill(0); weigh(); },
    /** How far the strings stretch past their length, the worst of them, as a fraction: the solver's error. */
    stretch(): number {
      let worst = 0;
      for (let s = 0; s < strings.length; s += 2) {
        const a = strings[s] * 3, b = strings[s + 1] * 3;
        const d = Math.hypot(position[b] - position[a], position[b + 1] - position[a + 1], position[b + 2] - position[a + 2]);
        worst = Math.max(worst, d / o.string - 1);
      }
      return worst;
    },
    /** The lowest knot's depth below the supports, m. */
    depth(): number { let d = 0; for (let k = 0; k < count; k++) d = Math.max(d, -position[k * 3 + 1]); return d; },
    isSupport(k: number): boolean { return inverse[k] === 0; },
  };
}
