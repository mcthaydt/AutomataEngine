import { describe, expect, it } from 'vitest'
import { canvasDims, createResizeReconciler, type Dims } from '../../src/render/canvasSize'

describe('canvasDims', () => {
  it('floors an unlaid-out (0) element size to 1 so the buffer is never 0-sized', () => {
    // The root cause of the black 3D: resize() runs before layout, clientWidth is 0.
    expect(canvasDims({ clientWidth: 0, clientHeight: 0 }, 'element', { innerWidth: 800, innerHeight: 600 }))
      .toEqual({ w: 1, h: 1 })
  })

  it('uses the on-screen element size once the canvas is laid out', () => {
    expect(canvasDims({ clientWidth: 414, clientHeight: 313 }, 'element', { innerWidth: 800, innerHeight: 600 }))
      .toEqual({ w: 414, h: 313 })
  })

  it('uses the viewport size in window mode', () => {
    expect(canvasDims({ clientWidth: 414, clientHeight: 313 }, 'window', { innerWidth: 800, innerHeight: 600 }))
      .toEqual({ w: 800, h: 600 })
  })
})

describe('createResizeReconciler', () => {
  it('applies on the first observed size', () => {
    const applied: Dims[] = []
    const reconcile = createResizeReconciler((d) => applied.push(d))
    reconcile({ w: 414, h: 313 })
    expect(applied).toEqual([{ w: 414, h: 313 }])
  })

  it('does not re-apply when the size is unchanged', () => {
    const applied: Dims[] = []
    const reconcile = createResizeReconciler((d) => applied.push(d))
    reconcile({ w: 414, h: 313 })
    reconcile({ w: 414, h: 313 })
    expect(applied).toEqual([{ w: 414, h: 313 }])
  })

  it('re-applies when the size drifts, self-correcting a stale 1x1 buffer to the laid-out size', () => {
    const applied: Dims[] = []
    const reconcile = createResizeReconciler((d) => applied.push(d))
    reconcile({ w: 1, h: 1 }) // construction-time, pre-layout
    reconcile({ w: 795, h: 921 }) // first frame after layout
    expect(applied).toEqual([{ w: 1, h: 1 }, { w: 795, h: 921 }])
  })

  it('re-applies when only the height changes', () => {
    const applied: Dims[] = []
    const reconcile = createResizeReconciler((d) => applied.push(d))
    reconcile({ w: 800, h: 600 })
    reconcile({ w: 800, h: 601 })
    expect(applied).toEqual([{ w: 800, h: 600 }, { w: 800, h: 601 }])
  })
})
