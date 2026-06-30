import { describe, expect, it, vi } from 'vitest'
import { paintMap } from '../../src/viewport2d/browser'

describe('project map canvas painter', () => {
  it('draws grid, selected geometry, and translucent gizmos', () => {
    const ctx = {
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      strokeStyle: '',
      fillStyle: '',
      globalAlpha: 1
    }

    paintMap(ctx as never, [
      {
        id: 'box', shape: 'rect', x: 1, y: 2, w: 3, h: 4,
        color: '#f00', selected: true
      },
      {
        id: 'zone', shape: 'circle', x: 5, y: 6, r: 7,
        color: '#0f0', selected: false, gizmo: true
      }
    ], { w: 48, h: 48 })

    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 48, 48)
    expect(ctx.fillRect).toHaveBeenCalledWith(1, 2, 3, 4)
    expect(ctx.strokeRect).toHaveBeenCalledWith(1, 2, 3, 4)
    expect(ctx.arc).toHaveBeenCalledWith(5, 6, 7, 0, Math.PI * 2)
    expect(ctx.fill).toHaveBeenCalled()
    expect(ctx.globalAlpha).toBe(1)
  })
})
