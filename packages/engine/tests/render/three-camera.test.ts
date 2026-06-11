import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { createThreeRenderer } from '../../src/render/three'

describe('setCamera', () => {
  it('places the camera and aims it at the target', () => {
    const { port, camera } = createThreeRenderer()
    port.setCamera({ x: 0, y: 6, z: 10 }, { x: 0, y: 0, z: 0 })
    expect(camera.position.y).toBeCloseTo(6)

    const direction = new Vector3()
    camera.getWorldDirection(direction)
    const expected = new Vector3(0, -6, -10).normalize()
    expect(direction.x).toBeCloseTo(expected.x)
    expect(direction.y).toBeCloseTo(expected.y)
    expect(direction.z).toBeCloseTo(expected.z)
  })

  it('scene has lights by default (objects are visible)', () => {
    const { scene } = createThreeRenderer()
    const lightTypes = scene.children.map((child) => child.type)
    expect(lightTypes).toContain('AmbientLight')
    expect(lightTypes).toContain('DirectionalLight')
  })
})
