import { describe, expect, it } from 'vitest'
import { registerEditorProject } from '../../../src/project/registration'
import { mountProjectInspector } from '../../../src/ui/project/inspector'
import { fakeEditorRegistration, fakeSnapshot } from '../../fixtures/fakeProject'
import type { ProjectCommand } from '@automata/project'

function setup() {
  const registration = registerEditorProject(fakeEditorRegistration)
  const snapshot = fakeSnapshot()
  const parent = document.createElement('div')
  const dispatched: ProjectCommand[] = []
  const inspector = mountProjectInspector(parent, { dispatch: (command) => dispatched.push(command) })
  return { registration, snapshot, parent, dispatched, inspector }
}

describe('project inspector', () => {
  it('renders the resource schema for a resource selection', () => {
    const { registration, snapshot, parent, inspector } = setup()
    inspector.update({ registration, snapshot, selection: { kind: 'resource', resourceId: 'tuning' } })
    expect(parent.querySelector('[data-prop="/speed"]')).not.toBeNull()
    expect(parent.querySelector('[data-prop="/mode"]')).not.toBeNull()
  })

  it('renders entity name/enabled plus component cards for an entity selection', () => {
    const { registration, snapshot, parent, dispatched, inspector } = setup()
    inspector.update({ registration, snapshot, selection: { kind: 'entity', sceneId: 'main', entityIds: ['box'] } })
    const name = parent.querySelector<HTMLInputElement>('[data-entity-name]')!
    expect(name).not.toBeNull()
    expect(parent.querySelectorAll('[data-component-card]').length).toBeGreaterThan(0)

    name.value = 'Renamed'; name.dispatchEvent(new Event('change'))
    expect(dispatched).toContainEqual({ type: 'setProperty', target: { kind: 'entity', sceneId: 'main', entityId: 'box' }, pointer: '/name', value: 'Renamed' })
  })

  it('renders only shared position controls for a multi-entity selection', () => {
    const { registration, snapshot, parent, inspector } = setup()
    inspector.update({ registration, snapshot, selection: { kind: 'entity', sceneId: 'main', entityIds: ['box', 'box'] } })
    expect(parent.querySelector('[data-multi-position]')).not.toBeNull()
    expect(parent.querySelector('[data-component-card]')).toBeNull()
  })

  it('renders an empty hint for the project root selection', () => {
    const { registration, snapshot, parent, inspector } = setup()
    inspector.update({ registration, snapshot, selection: { kind: 'project' } })
    expect(parent.textContent).toBeTruthy()
  })
})
