import { describe, expect, it } from 'vitest'
import type { ProjectSnapshot } from '@automata/project'
import { diffProjects } from '../src/diff'
import { fakeSnapshot } from './fixtures/fakeProject'

function changedSnapshots(): { before: ProjectSnapshot; after: ProjectSnapshot } {
  const before = fakeSnapshot()
  before.manifest.scenes.push({ id: 'retired', path: 'scenes/retired.scene.json' })
  before.scenes.retired = { formatVersion: 1, id: 'retired', name: 'Retired', entities: [] }
  before.scenes.arena!.entities.push({ id: 'retired', name: 'Retired Spawn', enabled: true, components: [] })
  before.manifest.resources.push({ id: 'old', typeId: 'pulsebreak.wave-set', path: 'resources/old.resource.json' })
  before.resources.old = { formatVersion: 1, id: 'old', typeId: 'pulsebreak.wave-set', data: { count: 1 } }

  const after = structuredClone(before)
  after.manifest.name = 'Changed Project'
  after.manifest.scenes = after.manifest.scenes.filter((entry) => entry.id !== 'retired')
  after.manifest.scenes.push({ id: 'bonus', path: 'scenes/bonus.scene.json' })
  delete after.scenes.retired
  after.scenes.bonus = { formatVersion: 1, id: 'bonus', name: 'Bonus', entities: [] }
  after.scenes.arena!.name = 'Changed Arena'

  const spawn = after.scenes.arena!.entities.find((entity) => entity.id === 'spawn-east')!
  spawn.enabled = false
  ;(spawn.components[0]!.data as { weight: number }).weight = 2
  spawn.components.push({ id: 'transform', typeId: 'core.transform', data: {} })
  after.scenes.arena!.entities = after.scenes.arena!.entities.filter((entity) => entity.id !== 'retired')
  after.scenes.arena!.entities.push({ id: 'new-spawn', name: 'New Spawn', enabled: true, components: [] })

  after.manifest.resources = after.manifest.resources.filter((entry) => entry.id !== 'old')
  after.manifest.resources.push({ id: 'tuning', typeId: 'pulsebreak.wave-set', path: 'resources/tuning.resource.json' })
  delete after.resources.old
  ;(after.resources.waves!.data as { count: number }).count = 4
  after.resources.tuning = { formatVersion: 1, id: 'tuning', typeId: 'pulsebreak.wave-set', data: { count: 2 } }
  return { before, after }
}

describe('diffProjects', () => {
  it('reports stable scene, entity, component, resource, and property changes', () => {
    const { before, after } = changedSnapshots()
    const diff = diffProjects(before, after)

    expect(diff).toMatchObject({ addedCount: 4, removedCount: 3, modifiedCount: 5 })
    expect(diff.changes).toEqual([
      { id: 'transform', kind: 'added', label: 'component:spawn-east/core.transform' },
      { id: 'spawn-zone', kind: 'modified', label: 'component:spawn-east/pulsebreak.spawn-zone' },
      { id: 'new-spawn', kind: 'added', label: 'entity:arena/new-spawn' },
      { id: 'retired', kind: 'removed', label: 'entity:arena/retired' },
      { id: 'spawn-east', kind: 'modified', label: 'entity:arena/spawn-east' },
      { id: 'fake-project', kind: 'modified', label: 'project:fake-project' },
      { id: 'old', kind: 'removed', label: 'resource:old' },
      { id: 'tuning', kind: 'added', label: 'resource:tuning' },
      { id: 'waves', kind: 'modified', label: 'resource:waves' },
      { id: 'arena', kind: 'modified', label: 'scene:arena' },
      { id: 'bonus', kind: 'added', label: 'scene:bonus' },
      { id: 'retired', kind: 'removed', label: 'scene:retired' }
    ])
  })

  it('reports no changes for structurally identical snapshots', () => {
    const snapshot = fakeSnapshot()
    expect(diffProjects(snapshot, structuredClone(snapshot))).toEqual({
      changes: [], addedCount: 0, removedCount: 0, modifiedCount: 0
    })
  })

  it('compares array properties and reports removed components', () => {
    const before = fakeSnapshot()
    before.resources.waves!.data = { values: [1, 2] }
    const same = structuredClone(before)
    expect(diffProjects(before, same).changes).toEqual([])

    const after = structuredClone(before)
    after.resources.waves!.data = { values: [1, 3] }
    after.scenes.arena!.entities[0]!.components = []
    expect(diffProjects(before, after).changes).toEqual([
      {
        id: 'spawn-zone',
        kind: 'removed',
        label: 'component:spawn-east/pulsebreak.spawn-zone'
      },
      { id: 'waves', kind: 'modified', label: 'resource:waves' }
    ])
  })
})
