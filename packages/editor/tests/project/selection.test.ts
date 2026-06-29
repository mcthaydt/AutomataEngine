import { describe, expect, it } from 'vitest'
import { reconcileSelection } from '../../src/project/selection'
import { fakeSnapshot } from '../fixtures/fakeProject'

describe('project selection reconciliation', () => {
  it('preserves valid project, scene, resource, entity, and component selections', () => {
    const snapshot = fakeSnapshot()
    const selections = [
      { kind: 'project' as const },
      { kind: 'scene' as const, sceneId: 'main' },
      { kind: 'resource' as const, resourceId: 'tuning' },
      { kind: 'entity' as const, sceneId: 'main', entityIds: ['box'] },
      { kind: 'component' as const, sceneId: 'main', entityId: 'box', componentId: 't' }
    ]
    for (const selection of selections) expect(reconcileSelection(snapshot, selection)).toEqual(selection)
  })

  it('falls back through project, scene, and entity scopes', () => {
    const snapshot = fakeSnapshot()
    expect(reconcileSelection(snapshot, { kind: 'scene', sceneId: 'missing' })).toEqual({ kind: 'project' })
    expect(reconcileSelection(snapshot, { kind: 'resource', resourceId: 'missing' })).toEqual({ kind: 'project' })
    expect(reconcileSelection(snapshot, { kind: 'entity', sceneId: 'missing', entityIds: ['box'] })).toEqual({ kind: 'project' })
    expect(reconcileSelection(snapshot, { kind: 'entity', sceneId: 'main', entityIds: ['missing', 'box'] })).toEqual({ kind: 'entity', sceneId: 'main', entityIds: ['box'] })
    expect(reconcileSelection(snapshot, { kind: 'entity', sceneId: 'main', entityIds: ['missing'] })).toEqual({ kind: 'scene', sceneId: 'main' })
    expect(reconcileSelection(snapshot, { kind: 'component', sceneId: 'main', entityId: 'box', componentId: 'missing' })).toEqual({ kind: 'entity', sceneId: 'main', entityIds: ['box'] })
    expect(reconcileSelection(snapshot, { kind: 'component', sceneId: 'main', entityId: 'missing', componentId: 'x' })).toEqual({ kind: 'scene', sceneId: 'main' })
    expect(reconcileSelection(snapshot, { kind: 'component', sceneId: 'missing', entityId: 'missing', componentId: 'x' })).toEqual({ kind: 'project' })
  })
})
