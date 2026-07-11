import { describe, expect, it } from 'vitest'
import { MONKEY_BALL_TYPE_IDS } from '../../src/project/types'
import { createMonkeyBallTemplate } from '../../src/project/template'

describe('createMonkeyBallTemplate', () => {
  it('produces a stable canonical snapshot', () => {
    expect(createMonkeyBallTemplate()).toMatchSnapshot()
  })

  it('exposes the physics/worlds default resource data definition.ts derives', () => {
    const template = createMonkeyBallTemplate()
    expect(template.resources.physics!.data).toEqual({
      maxTiltRad: (12 * Math.PI) / 180,
      tiltSmooth: 0.15,
      gravity: 9.81,
      ball: { radius: 0.5, friction: 0.6 }
    })
    expect(template.resources.worlds!.data).toEqual({
      worlds: [{ id: 'w1', name: 'Grassland', levels: ['w1-l1'] }]
    })
    expect(template.resources.physics!.typeId).toBe(MONKEY_BALL_TYPE_IDS.physics)
    expect(template.resources.worlds!.typeId).toBe(MONKEY_BALL_TYPE_IDS.worlds)
  })
})
