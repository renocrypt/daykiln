/**
 * Frame-rate independent exponential approach toward a target.
 *
 * After `halfLife` seconds, the remaining distance to the target has halved. This is the
 * reference's `current += (target - current) * (1 - exp(-k * dt))` with k = ln 2 / halfLife,
 * written in half-lives because LOOK.md specifies tempo that way.
 */
export function damp(current: number, target: number, halfLife: number, dt: number): number {
  if (halfLife <= 0) return target;
  return target + (current - target) * Math.pow(2, -dt / halfLife);
}
