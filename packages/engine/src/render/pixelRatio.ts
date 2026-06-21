export const MAX_PIXEL_RATIO = 2

/** Clamp a device pixel ratio to [1, cap], capping GPU cost on high-DPI displays. */
export function cappedPixelRatio(devicePixelRatio: number, cap: number = MAX_PIXEL_RATIO): number {
  return Math.max(1, Math.min(devicePixelRatio, cap))
}
