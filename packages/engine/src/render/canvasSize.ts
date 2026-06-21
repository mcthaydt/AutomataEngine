export interface Dims { w: number; h: number }

/**
 * On-screen size to give a canvas's drawing buffer. In `element` mode an
 * unlaid-out or hidden canvas reports 0; rendering into a 0-sized buffer blacks
 * out the view, so floor it to 1 (a later frame re-sizes it once laid out).
 */
export function canvasDims(
  canvas: { clientWidth: number; clientHeight: number },
  sizeTo: 'window' | 'element',
  viewport: { innerWidth: number; innerHeight: number }
): Dims {
  return sizeTo === 'element'
    ? { w: canvas.clientWidth || 1, h: canvas.clientHeight || 1 }
    : { w: viewport.innerWidth, h: viewport.innerHeight }
}

/**
 * Wraps a size-applying callback so it only fires when the size actually drifts.
 * Driven every frame, it self-corrects a buffer sized before layout (1×1) or
 * left stale after a hide/show, without re-sizing redundantly.
 */
export function createResizeReconciler(apply: (dims: Dims) => void): (dims: Dims) => void {
  let lastW = Number.NaN
  let lastH = Number.NaN
  return ({ w, h }) => {
    if (w === lastW && h === lastH) return
    lastW = w
    lastH = h
    apply({ w, h })
  }
}
