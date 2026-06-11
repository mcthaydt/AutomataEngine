import { describe, expect, it } from 'vitest'
import { createNullRenderer } from '@automata/engine'
import { createDemoScene } from '../src/demoScene'

describe('createDemoScene', () => {
  it('builds a stage group with floor + ball and ticks without physics', () => {
    const renderer = createNullRenderer()
    const demo = createDemoScene(renderer.port)

    expect(renderer.calls.filter((call) => call.op === 'add')).toHaveLength(2)
    expect(renderer.calls[0]!.op).toBe('createGroup')

    demo.loop.tick(0)
    demo.loop.tick(1000 / 60 + 1)
    const tilts = renderer.calls.filter((call) => call.op === 'setGroupRotation')
    expect(tilts.length).toBeGreaterThan(0)

    const poses = renderer.calls.filter((call) => call.op === 'setPose')
    expect(poses.length).toBeGreaterThan(0)
  })
})
