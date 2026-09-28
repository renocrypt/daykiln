// The glaze tub: a stoneware basin on the table, glazed dark iron-brown and crusted where slip has
// dried on it, full of raw glaze slip. The visitor carries the bowl to it and dips it.
//
// The slip's surface is a height field, the damped wave equation on a 128 × 128 grid over the tub,
// stepped at a fixed 240 Hz: the bowl's rim going in and coming out, and each drop falling back
// from it, push it; the bowl, while under, is a wall the ripples break on. Slip is viscous, so they
// die in about a second. The drops are simulated too: they gather on the rim of the lifted bowl,
// grow, let go, and fall under gravity into the tub.

import * as THREE from 'three/webgpu';
import { float, length, mix, mx_noise_float, positionLocal, smoothstep, vec2, vec3, atan } from 'three/tsl';

export const TUB = { x: 0.38, z: 0.02, radius: 0.2, height: 0.13, liquid: 0.1 }; // m; the liquid's level above the table
const N = 128; // grid
const STEP = 1 / 240;
const WAVE = 0.22; // m/s
const KEEP = 0.992; // of the surface's motion kept each step: the slip's viscosity

/** The slip, as the bowl's raw glaze is when wet: pale grey, a little warm. Linear. */
export const SLIP = new THREE.Color().setRGB(0.44, 0.43, 0.39);

export type Tub = ReturnType<typeof buildTub>;

export function buildTub() {
  const group = new THREE.Group();
  group.position.set(TUB.x, 0, TUB.z);

  // The basin, lathed: foot, outer wall, a rolled rim, the inner wall, the floor.
  const inner = (y: number) => 0.13 + ((0.19 - 0.13) * (y - 0.012)) / (0.12 - 0.012); // m: the inner wall's radius at a height
  const profile: THREE.Vector2[] = [];
  const add = (r: number, y: number) => profile.push(new THREE.Vector2(r, y));
  add(0.0005, 0.012); add(0.1, 0.012); add(0.128, 0.014);
  for (let i = 0; i <= 12; i++) { const y = 0.014 + (i / 12) * (0.12 - 0.014); add(inner(y), y); }
  for (let i = 0; i <= 10; i++) { const a = Math.PI * (i / 10); add(0.195 - 0.005 * Math.cos(a), 0.12 + 0.008 * Math.sin(a) + 0.002); }
  for (let i = 0; i <= 12; i++) { const y = 0.12 - (i / 12) * 0.116; add(0.2 - 0.055 * (1 - y / 0.12) ** 1.4, y); }
  add(0.14, 0.002); add(0.136, 0); add(0.0005, 0);
  const basinMaterial = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, roughness: 0.42 });
  {
    const p = positionLocal.mul(1000); // mm
    const angle = atan(p.z, p.x);
    const around = vec2(angle.mul(1 / (Math.PI * 2)).mul(64), 0); // 64 cells around: the noise tiles
    const iron = vec3(0.075, 0.05, 0.034).mul(mx_noise_float(p.mul(1 / 22)).mul(0.15).add(1));
    // Dried slip, where slip has been: a thin, uneven film over the rim, and a tide line inside at
    // the slip's level. Pale, and never more than half over the iron.
    const band = smoothstep(116, 121, p.y.add(mx_noise_float(around.mul(0.12).add(vec2(0, 3.1))).mul(3)));
    const film = mx_noise_float(around.mul(0.5).add(vec2(0, 5.3))).mul(0.5).add(0.5).mul(mx_noise_float(p.mul(1 / 6)).mul(0.3).add(0.7));
    const y = p.y.div(1000).clamp(0, 0.12);
    const innerAt = y.sub(0.012).mul((0.19 - 0.13) / 0.108).add(0.13);
    const outerAt = float(0.2).sub(float(1).sub(y.div(0.12)).pow(1.4).mul(0.055));
    const outside = smoothstep(innerAt.add(outerAt).mul(0.5).sub(0.002), innerAt.add(outerAt).mul(0.5).add(0.002), length(p.xz).div(1000));
    const tide = smoothstep(TUB.liquid * 1000 - 1, TUB.liquid * 1000 + 1, p.y).mul(smoothstep(TUB.liquid * 1000 + 6, TUB.liquid * 1000 + 1.5, p.y)).mul(float(1).sub(outside));
    const crust = band.mul(film).mul(0.5).max(tide.mul(0.45));
    basinMaterial.colorNode = mix(iron, vec3(0.52, 0.5, 0.46), crust.mul(mx_noise_float(p.mul(1 / 5)).mul(0.1).add(0.9)));
    basinMaterial.roughnessNode = mix(float(0.55), float(0.9), crust); // an iron glaze's satin, not a metal's shine
  }
  const basin = new THREE.Mesh(new THREE.LatheGeometry(profile, 160), basinMaterial);
  basin.castShadow = basin.receiveShadow = true;
  group.add(basin);

  // The slip's surface: a grid, displaced and its normals drawn from the height field each step.
  const R = inner(TUB.liquid);
  const surface = new THREE.PlaneGeometry(2 * R, 2 * R, N - 1, N - 1).rotateX(-Math.PI / 2);
  const slipMaterial = new THREE.MeshStandardNodeMaterial({ roughness: 0.09, color: SLIP }); // wet: it mirrors the room, softly
  slipMaterial.maskNode = length(positionLocal.xz).lessThan(R); // round, within the tub's wall
  const slip = new THREE.Mesh(surface, slipMaterial);
  slip.position.y = TUB.liquid;
  slip.receiveShadow = true;
  group.add(slip);

  let h = new Float32Array(N * N), last = new Float32Array(N * N), next = new Float32Array(N * N);
  const wall = new Uint8Array(N * N); // 1 where no slip moves: beyond the tub, or under the bowl
  const dx = (2 * R) / (N - 1);
  const cell = (x: number, z: number) => [Math.round((x + R) / dx), Math.round((z + R) / dx)] as const; // local m → grid
  const r2 = (WAVE * STEP / dx) ** 2;
  let awake = 0; // s the surface still moves
  let owed = 0;

  // The drops: gathered on the rim, then falling.
  type Drop = { anchor: THREE.Vector3; grow: number; size: number; falling: boolean; position: THREE.Vector3; velocity: number };
  const drops: Drop[] = [];
  const MOST = 24;
  const dropMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.0023, 12, 8), new THREE.MeshStandardNodeMaterial({ roughness: 0.18, color: SLIP }), MOST);
  dropMesh.count = 0;
  dropMesh.frustumCulled = false;
  dropMesh.castShadow = true;
  const world = new THREE.Group(); // the drops live in the world, not in the tub
  world.add(dropMesh);

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), local = new THREE.Vector3();

  /** Push the surface down by `amount` m in a disc of `radius` about a point in the tub's space. */
  function push(x: number, z: number, radius: number, amount: number): void {
    const [ci, cj] = cell(x, z), reach = Math.ceil(radius / dx) + 1;
    for (let j = cj - reach; j <= cj + reach; j++) for (let i = ci - reach; i <= ci + reach; i++) {
      if (i < 1 || j < 1 || i >= N - 1 || j >= N - 1) continue;
      const d = Math.hypot(i - ci, j - cj) * dx;
      if (d > radius) continue;
      h[j * N + i] -= amount * 0.5 * (1 + Math.cos((Math.PI * d) / radius));
    }
    awake = 2.5;
  }

  return {
    group, drops: world, R,
    get level(): number { return TUB.liquid; },
    /** The surface disturbed along a circle, as a rim entering or leaving it: `amount` m, down if positive. */
    ring(x: number, z: number, radius: number, amount: number): void {
      const steps = Math.ceil((2 * Math.PI * radius) / dx);
      for (let k = 0; k < steps; k++) {
        const a = (k / steps) * Math.PI * 2;
        push(x - TUB.x + Math.cos(a) * radius, z - TUB.z + Math.sin(a) * radius, dx * 1.5, amount / 2);
      }
    },
    /** A bubble of `radius` m breaking the surface at a point in the world: the slip lifts over its width where it comes up. */
    pop(x: number, z: number, radius: number): void {
      const lx = x - TUB.x, lz = z - TUB.z;
      if (lx * lx + lz * lz < (R - 0.01) ** 2) push(lx, lz, radius, -0.1 * radius);
    },
    /** A drop gathering at a point that moves with the bowl; it lets go when grown. */
    drip(anchor: THREE.Vector3): void {
      if (drops.length >= MOST) return;
      drops.push({ anchor, grow: 0, size: 0.8 + Math.random() * 0.5, falling: false, position: new THREE.Vector3(), velocity: 0 });
    },
    /**
     * Advance by `dt` s. `under` is the circle where the bowl meets the surface, in the world, or
     * null; `rim` places a drop's anchor, a point on the rim in the bowl's space, in the world.
     */
    step(dt: number, under: { x: number; z: number; radius: number } | null, rim: (anchor: THREE.Vector3, out: THREE.Vector3) => THREE.Vector3): boolean {
      // The walls: beyond the tub, and the bowl while it is in the slip.
      wall.fill(0);
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const x = -R + i * dx, z = -R + j * dx;
        if (x * x + z * z > (R - dx) ** 2) wall[j * N + i] = 1;
        else if (under && (x + TUB.x - under.x) ** 2 + (z + TUB.z - under.z) ** 2 < under.radius ** 2) wall[j * N + i] = 1;
      }
      // Drops: gathering, then falling; one that reaches the slip pushes it.
      for (let k = drops.length - 1; k >= 0; k--) {
        const d = drops[k];
        if (!d.falling) {
          rim(d.anchor, d.position);
          d.grow = Math.min(1, d.grow + dt / (0.35 * d.size));
          if (d.grow >= 1) d.falling = true;
        } else {
          d.velocity += 9.81 * dt;
          d.position.y -= d.velocity * dt;
          if (d.position.y <= TUB.liquid) {
            local.set(d.position.x - TUB.x, 0, d.position.z - TUB.z);
            if (local.x * local.x + local.z * local.z < R * R) push(local.x, local.z, 0.006, 0.0012 * d.size);
            drops.splice(k, 1);
          }
        }
      }
      drops.forEach((d, k) => {
        const g = d.falling ? 1 : d.grow;
        const stretch = d.falling ? 1 + Math.min(0.6, d.velocity * 0.6) : 1 + 0.4 * g;
        m.compose(d.position, q.identity(), s.set(g * d.size, g * d.size * stretch, g * d.size).multiplyScalar(0.9 + 0.1 * g));
        dropMesh.setMatrixAt(k, m);
      });
      dropMesh.count = drops.length;
      dropMesh.instanceMatrix.needsUpdate = true;

      // The surface, at its fixed step, while it moves.
      if (awake <= 0) return drops.length > 0;
      owed += Math.min(dt, 0.1);
      while (owed >= STEP) {
        owed -= STEP;
        for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
          const c = j * N + i;
          if (wall[c]) { next[c] = 0; continue; }
          const lap = h[c - 1] + h[c + 1] + h[c - N] + h[c + N] - 4 * h[c];
          next[c] = h[c] + (h[c] - last[c]) * KEEP + r2 * lap;
        }
        [last, h, next] = [h, next, last];
      }
      awake -= dt;
      const position = surface.attributes.position as THREE.BufferAttribute, normal = surface.attributes.normal as THREE.BufferAttribute;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        // Turned flat, PlaneGeometry's rows run from −z, as the grid's do.
        const v = j * N + i, c = v;
        position.setY(v, h[c]);
        const gx = (h[j * N + Math.min(N - 1, i + 1)] - h[j * N + Math.max(0, i - 1)]) / (2 * dx);
        const gz = (h[Math.min(N - 1, j + 1) * N + i] - h[Math.max(0, j - 1) * N + i]) / (2 * dx);
        const l = Math.hypot(gx, 1, gz);
        normal.setXYZ(v, -gx / l, 1 / l, -gz / l);
      }
      position.needsUpdate = normal.needsUpdate = true;
      return true;
    },
  };
}
