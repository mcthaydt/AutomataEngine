import { describe, expect, it, vi } from 'vitest'
import {
  archetypeLibraryKind,
  createNullRenderer,
  parseData,
  registerRenderables,
  type PhysicsPort
} from '@automata/engine'
import { physicsTuningKind, toPhysicsTuning } from '../../src/data/config'
import { levelKind } from '../../src/data/level'
import type { Entity } from '../../src/entity'
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

describe('Monkey Ball editor world synchronization', () => {
  it('preserves unchanged entity identity and replaces only a moved item', () => {
    const addBody = vi.fn()
    const removeBody = vi.fn()
    const physics = {
      addBody,
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
    const definition = createMonkeyBallDefinition(lib, tuning)
    const initialDoc = definition.scene.parse(level)
    const world = definition.buildWorld(initialDoc, render.port, physics)
    const offRender = registerRenderables(world as never, render.port)
    const byId = (): Map<string, Entity> => new Map(
      [...(world as ReturnType<typeof definition.buildWorld> & {
        with(key: 'editorId'): Iterable<Entity & { editorId: string }>
      }).with('editorId')].map((entity) => [entity.editorId, entity])
    )
    const initialEntities = byId()
    const syncWorld = definition.syncWorld

    expect(typeof syncWorld).toBe('function')
    if (!syncWorld) return

    const metadataDoc = definition.scene.apply(initialDoc, {
      type: 'setMetadata',
      path: 'name',
      value: 'Renamed'
    })
    syncWorld(world, initialDoc, metadataDoc)
    for (const [id, entity] of initialEntities) expect(byId().get(id)).toBe(entity)

    const movedId = [...initialEntities.keys()].find((id) => id.startsWith('geometry:'))!
    const movedDoc = definition.scene.apply(metadataDoc, {
      type: 'moveSelected',
      ids: [movedId],
      delta: { x: 1, y: 0, z: 0 }
    })
    const addsBefore = addBody.mock.calls.length
    const removesBefore = removeBody.mock.calls.length
    const renderAddsBefore = render.calls.filter((call) => call.op === 'add').length
    const renderRemovesBefore = render.calls.filter((call) => call.op === 'remove').length
    syncWorld(world, metadataDoc, movedDoc)

    const movedEntities = byId()
    expect(movedEntities.get(movedId)).not.toBe(initialEntities.get(movedId))
    for (const [id, entity] of initialEntities) {
      if (id !== movedId) expect(movedEntities.get(id)).toBe(entity)
    }
    expect(addBody).toHaveBeenCalledTimes(addsBefore + 1)
    expect(removeBody).toHaveBeenCalledTimes(removesBefore + 1)
    expect(render.calls.filter((call) => call.op === 'add')).toHaveLength(renderAddsBefore + 1)
    expect(render.calls.filter((call) => call.op === 'remove')).toHaveLength(renderRemovesBefore + 1)
    offRender()
  })
})
