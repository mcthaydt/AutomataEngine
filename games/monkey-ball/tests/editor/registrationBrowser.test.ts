import { describe, expect, it, vi } from 'vitest'
import {
  archetypeLibraryKind,
  createNullRenderer,
  parseData,
  type PhysicsPort
} from '@automata/engine'
import { physicsTuningKind, toPhysicsTuning } from '../../src/data/config'
import { levelKind } from '../../src/data/level'
import { createMonkeyBallDefinition } from '../../src/editor/registration'
import { readDataFile } from '../helpers/data'

const lib = parseData(
  archetypeLibraryKind,
  readDataFile('archetypes/standard.yaml'),
  'standard.yaml'
)
const tuning = toPhysicsTuning(parseData(
  physicsTuningKind,
  readDataFile('config/physics.toml'),
  'physics.toml'
))
const level = parseData(levelKind, readDataFile('levels/w1-l1.json'), 'w1-l1.json')

describe('browser Monkey Ball registration', () => {
  it('creates, updates, renders, and disposes keyboard-backed gameplay', () => {
    const removeBody = vi.fn()
    const physics = {
      addBody() {},
      removeBody,
      setGravity() {},
      step: () => [],
      readPose: () => null,
      readLinearVelocity: () => ({ x: 0, y: 0, z: 0 }),
      applyImpulse() {},
      setKinematicTarget() {},
      get bodyCount() { return 0 },
      dispose() {}
    } as PhysicsPort
    const render = createNullRenderer()
    const handle = createMonkeyBallDefinition(lib, tuning).play!.createGameplay!(
      level,
      render.port,
      physics
    )

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }))
    handle.fixedUpdate(1 / 60)
    handle.render(0.5, 1 / 60)
    handle.dispose()

    expect(render.calls.some((call) => call.op === 'setCamera')).toBe(true)
    expect(removeBody).toHaveBeenCalled()
  })
})
