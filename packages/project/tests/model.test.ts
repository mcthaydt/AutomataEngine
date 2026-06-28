import { describe, expect, it } from 'vitest'
import { projectSnapshotSchema } from '../src/model'

const snapshot = {
  manifest: {
    formatVersion: 1, id: 'demo', name: 'Demo', gameId: 'fake', entrySceneId: 'main',
    scenes: [{ id: 'main', path: 'scenes/main.scene.json' }],
    resources: [{ id: 'tuning', typeId: 'fake.tuning', path: 'resources/tuning.resource.json' }]
  },
  scenes: {
    main: {
      formatVersion: 1, id: 'main', name: 'Main',
      entities: [{
        id: 'root', name: 'Root', enabled: true,
        components: [{ id: 'transform', typeId: 'core.transform', data: { position: { x: 0, y: 0, z: 0 } } }]
      }]
    }
  },
  resources: {
    tuning: { formatVersion: 1, id: 'tuning', typeId: 'fake.tuning', data: { speed: 4 } }
  }
}

describe('projectSnapshotSchema', () => {
  it('accepts a v1 project snapshot without erasing component/resource data', () => {
    expect(projectSnapshotSchema.parse(snapshot)).toEqual(snapshot)
  })

  it.each([
    [{ ...snapshot, manifest: { ...snapshot.manifest, formatVersion: 2 } }, 'formatVersion'],
    [{ ...snapshot, manifest: { ...snapshot.manifest, id: '' } }, 'id'],
    [{ ...snapshot, scenes: { main: { ...snapshot.scenes.main, entities: [{ ...snapshot.scenes.main.entities[0], enabled: 'yes' }] } } }, 'enabled']
  ])('rejects malformed persisted data', (value, path) => {
    expect(() => projectSnapshotSchema.parse(value)).toThrow(path)
  })
})
