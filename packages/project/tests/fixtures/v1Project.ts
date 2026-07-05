import type { RawProjectDocuments } from '../../src'

/**
 * Frozen formatVersion-1 documents pinning the 1→2 migration forever.
 * NEVER update these shapes to a newer format — that is the point of them.
 * Mirrors sampleProject.ts as it existed at v1.
 */
export function v1RawDocuments(): RawProjectDocuments {
  return {
    manifest: {
      formatVersion: 1, id: 'demo', name: 'Demo', gameId: 'fake', entrySceneId: 'main',
      scenes: [{ id: 'main', path: 'scenes/main.scene.json' }],
      resources: [{ id: 'tuning', typeId: 'fake.tuning', path: 'resources/tuning.resource.json' }]
    },
    scenes: [{
      formatVersion: 1, id: 'main', name: 'Main',
      entities: [
        {
          id: 'root', name: 'Root', enabled: true,
          components: [{ id: 'transform', typeId: 'core.transform', data: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } } }]
        },
        {
          id: 'spawn', name: 'Spawn', parentId: 'root', enabled: true,
          components: [{ id: 'c-spawn', typeId: 'fake.spawn', data: { team: 'red', tuning: 'tuning' } }]
        }
      ]
    }],
    resources: [{ formatVersion: 1, id: 'tuning', typeId: 'fake.tuning', data: { speed: 4 } }]
  }
}

/** The same project as v1 single-file bundle text (root formatVersion included, as v1 wrote it). */
export function v1BundleText(): string {
  const docs = v1RawDocuments()
  return `${JSON.stringify({ formatVersion: 1, manifest: docs.manifest, scenes: docs.scenes, resources: docs.resources }, null, 2)}\n`
}
