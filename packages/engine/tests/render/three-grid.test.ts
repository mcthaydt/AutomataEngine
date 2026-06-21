import { describe, expect, it } from 'vitest'
import { createThreeRenderer, PERSPECTIVE_FOV_DEG } from '../../src/render/three'

describe('render grid + highlight', () => {
  it('builds the camera from the shared FOV constant', () => {
    const { camera } = createThreeRenderer()
    expect(camera.fov).toBe(PERSPECTIVE_FOV_DEG)
  })

  it('adds and removes a grid as a scene child', () => {
    const { port, scene } = createThreeRenderer()
    const before = scene.children.length
    const grid = port.setGrid({ size: 20, divisions: 20, color: '#334' })
    expect(scene.children.length).toBe(before + 1)
    port.removeGrid(grid)
    expect(scene.children.length).toBe(before)
  })

  it('removeGrid on an unknown id is a no-op', () => {
    const { port } = createThreeRenderer()
    expect(() => port.removeGrid(999)).not.toThrow()
  })

  it('disposes outstanding grids when the renderer is disposed', () => {
    const { port } = createThreeRenderer()
    port.setGrid({ size: 10, divisions: 10, color: '#222' })
    expect(() => port.dispose()).not.toThrow()
  })

  it('setHighlight toggles emissive on the entity mesh without throwing', () => {
    const { port } = createThreeRenderer()
    const entity = {}
    port.add(entity, { primitive: 'box', size: { x: 1, y: 1, z: 1 }, color: '#fff' })
    expect(() => port.setHighlight(entity, true)).not.toThrow()
    expect(() => port.setHighlight(entity, false)).not.toThrow()
    expect(() => port.setHighlight({}, true)).not.toThrow()
  })
})
