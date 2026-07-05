import { describe, expect, it } from 'vitest'
import { registerEditorProject } from '../../../src/project/registration'
import { mountProjectInspector } from '../../../src/ui/project/inspector'
import { fakeEditorRegistration, fakeSnapshot } from '../../fixtures/fakeProject'
import { normalizeResourceType, reference, z, type ProjectCommand } from '@automata/project'

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
    const enabled = parent.querySelector<HTMLInputElement>('[data-entity-enabled]')!
    enabled.checked = false; enabled.dispatchEvent(new Event('change'))
    expect(dispatched).toContainEqual({ type: 'setProperty', target: { kind: 'entity', sceneId: 'main', entityId: 'box' }, pointer: '/enabled', value: false })
  })

  it('renders only shared position controls for a multi-entity selection', () => {
    const { registration, snapshot, parent, dispatched, inspector } = setup()
    snapshot.scenes.main!.entities.push({ id: 'plain', name: 'Plain', enabled: true, components: [] })
    inspector.update({ registration, snapshot, selection: { kind: 'entity', sceneId: 'main', entityIds: ['box', 'box'] } })
    expect(parent.querySelector('[data-multi-position]')).not.toBeNull()
    expect(parent.querySelector('[data-component-card]')).toBeNull()
    const x = parent.querySelector<HTMLInputElement>('[data-axis="x"]')!
    x.value = 'bad'; x.dispatchEvent(new Event('change'))
    expect(x.getAttribute('aria-invalid')).toBe('true')
    x.value = '3'; x.dispatchEvent(new Event('change'))
    expect(x.hasAttribute('aria-invalid')).toBe(false)
    expect(dispatched.filter((command) => command.type === 'setProperty')).toHaveLength(2)

    dispatched.length = 0
    inspector.update({ registration, snapshot, selection: { kind: 'entity', sceneId: 'main', entityIds: ['plain', 'box'] } })
    const y = parent.querySelector<HTMLInputElement>('[data-axis="y"]')!
    y.value = '2'; y.dispatchEvent(new Event('change'))
    expect(dispatched).toHaveLength(1)
  })

  it('renders an empty hint for the project root selection', () => {
    const { registration, snapshot, parent, inspector } = setup()
    inspector.update({ registration, snapshot, selection: { kind: 'project' } })
    expect(parent.textContent).toBeTruthy()
  })

  it('renders scene, missing-resource, and missing-entity states', () => {
    const { registration, snapshot, parent, inspector } = setup()
    inspector.update({ registration, snapshot, selection: { kind: 'scene', sceneId: 'main' } })
    expect(parent.textContent).toContain('Main')
    inspector.update({ registration, snapshot, selection: { kind: 'scene', sceneId: 'missing' } })
    expect(parent.textContent).toContain('missing')
    inspector.update({ registration, snapshot, selection: { kind: 'resource', resourceId: 'missing' } })
    expect(parent.textContent).toContain('Resource not found')
    inspector.update({ registration, snapshot, selection: { kind: 'entity', sceneId: 'main', entityIds: ['missing'] } })
    expect(parent.textContent).toContain('Entity not found')
  })

  it('focuses one component and falls back to its ID when unregistered', () => {
    const { registration, snapshot, parent, inspector } = setup()
    snapshot.scenes.main!.entities[0]!.components.push({ id: 'custom', typeId: 'unknown.type', data: {} })
    inspector.update({
      registration,
      snapshot,
      selection: { kind: 'component', sceneId: 'main', entityId: 'box', componentId: 'custom' }
    })
    expect(parent.querySelectorAll('[data-component-card]')).toHaveLength(1)
    expect(parent.textContent).toContain('custom')
    expect(parent.querySelector('[data-entity-name]')).toBeNull()
  })

  it('disposes its root panel', () => {
    const { parent, inspector } = setup()
    inspector.dispose()
    expect(parent.children).toHaveLength(0)
  })

  it('builds filtered resource and entity reference options', () => {
    const { registration, snapshot, parent, inspector } = setup()
    registration.resourceTypes.push(normalizeResourceType({
      typeId: 'fake.links', label: 'Links', defaultData: {},
      schema: z.strictObject({
        any: reference({ target: 'resource', label: 'Any' }).optional(),
        typed: reference({ target: 'resource', typeIds: ['fake.tuning'], label: 'Typed' }).optional(),
        entity: reference({ target: 'entity', label: 'Entity' })
      })
    }))
    snapshot.resources.links = {
      id: 'links', typeId: 'fake.links',
      data: { any: 'tuning', typed: 'tuning', entity: 'box' }
    }
    inspector.update({ registration, snapshot, selection: { kind: 'resource', resourceId: 'links' } })
    expect(parent.querySelector<HTMLSelectElement>('[data-prop="/any"] select')!.options.length).toBe(3)
    expect(parent.querySelector<HTMLSelectElement>('[data-prop="/typed"] select')!.options.length).toBe(2)
    expect(parent.querySelector<HTMLSelectElement>('[data-prop="/entity"] select')!.options.item(0)!.value).toBe('box')

    snapshot.manifest.entrySceneId = ''
    inspector.update({ registration, snapshot, selection: { kind: 'resource', resourceId: 'links' } })
    expect(parent.querySelector<HTMLSelectElement>('[data-prop="/entity"] select')!.options.length).toBe(0)
  })
})
