/**
 * Bit-deterministic sine approximation for audio sample math. JavaScript
 * transcendentals are implementation-defined, so this path uses only IEEE
 * 754 arithmetic plus exact sign/integer operations. Maximum error is about
 * 0.001 over a period.
 *
 * @param phase Position in cycles; any real value is accepted.
 */
export function detSin(phase: number): number {
  let t = phase - Math.floor(phase)
  t = t * 2 - 1
  const raw = 4 * (Math.abs(t) - t * t) * (t < 0 ? -1 : 1) * -1
  return 0.225 * (raw * Math.abs(raw) - raw) + raw
}
