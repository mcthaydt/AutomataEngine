import {
  CORE_TYPE_IDS,
  type ComponentTypeRegistration, type ProjectCommand, type ProjectSnapshot, type ReferenceProperty
} from '@automata/project'
import type { RegisteredEditorProject } from '../../project/registration'
import type { ProjectSelection } from '../../project/selection'
import { mountPropertyControl, type ReferenceOption } from './propertyControl'

/**
 * The generic project inspector. It resolves the selection's registered schema
 * and target, then renders schema-generated controls — entity name/enabled plus
 * collapsible component cards, a single focused card for a component selection,
 * the resource schema for a resource, and shared position controls for a
 * multi-entity selection. It never branches on a game name or type id.
 */
export interface ProjectInspectorContext {
  registration: RegisteredEditorProject
  snapshot: ProjectSnapshot
  selection: ProjectSelection
}

export interface ProjectInspectorOptions {
  dispatch: (command: ProjectCommand) => void
}

export interface ProjectInspectorHandle {
  update(context: ProjectInspectorContext): void
  dispose(): void
}

export function mountProjectInspector(parent: HTMLElement, options: ProjectInspectorOptions): ProjectInspectorHandle {
  const root = document.createElement('div')
  root.className = 'ed-panel ed-inspector'
  root.dataset.projectInspector = ''
  parent.append(root)
  return {
    update(context) {
      root.replaceChildren()
      render(root, context, options)
    },
    dispose() { root.remove() }
  }
}

function header(text: string): HTMLElement {
  const head = document.createElement('div')
  head.className = 'ed-panel-head'
  head.textContent = text
  return head
}

function referenceOptionsFor(snapshot: ProjectSnapshot, sceneId: string | undefined): (field: ReferenceProperty) => ReferenceOption[] {
  return (field) => {
    if (field.target === 'resource') {
      return Object.values(snapshot.resources)
        .filter((resource) => !field.typeIds || field.typeIds.includes(resource.typeId))
        .map((resource) => ({ id: resource.id, label: resource.id }))
    }
    const scene = sceneId ? snapshot.scenes[sceneId] : undefined
    return (scene?.entities ?? []).map((entity) => ({ id: entity.id, label: entity.name }))
  }
}

function render(root: HTMLElement, context: ProjectInspectorContext, options: ProjectInspectorOptions): void {
  const { snapshot, selection } = context
  switch (selection.kind) {
    case 'project':
      root.append(header('Project'), hint('Select a scene, entity, or resource to edit it.'))
      return
    case 'scene':
      root.append(header(snapshot.scenes[selection.sceneId]?.name ?? selection.sceneId), hint('Scene selected.'))
      return
    case 'resource':
      renderResource(root, context, options)
      return
    case 'entity':
      if (selection.entityIds.length > 1) renderMultiEntity(root, context, options)
      else renderEntity(root, context, options, selection.entityIds[0]!)
      return
    case 'component':
      renderEntity(root, context, options, selection.entityId, selection.componentId)
      return
  }
}

function renderResource(root: HTMLElement, context: ProjectInspectorContext, options: ProjectInspectorOptions): void {
  const { registration, snapshot, selection } = context
  if (selection.kind !== 'resource') return
  const resource = snapshot.resources[selection.resourceId]
  const schema = registration.resourceTypes.find((type) => type.typeId === resource?.typeId)?.schema
  if (!resource || !schema) {
    root.append(header('Resource'), hint('Resource not found.'))
    return
  }
  root.append(header(resource.id))
  mountPropertyControl(root, {
    schema, value: resource.data, pointer: '', target: { kind: 'resource', resourceId: resource.id },
    dispatch: options.dispatch, referenceOptions: referenceOptionsFor(snapshot, snapshot.manifest.entrySceneId)
  })
}

function renderEntity(root: HTMLElement, context: ProjectInspectorContext, options: ProjectInspectorOptions, entityId: string, focusComponentId?: string): void {
  const { registration, snapshot, selection } = context
  const sceneId = selection.kind === 'entity' || selection.kind === 'component' ? selection.sceneId : snapshot.manifest.entrySceneId
  const scene = snapshot.scenes[sceneId]
  const entity = scene?.entities.find((candidate) => candidate.id === entityId)
  if (!entity) {
    root.append(header('Entity'), hint('Entity not found.'))
    return
  }
  root.append(header(entity.name))

  if (!focusComponentId) {
    root.append(entityNameField(sceneId, entity.id, entity.name, options))
    root.append(entityEnabledField(sceneId, entity.id, entity.enabled, options))
  }

  const components = focusComponentId ? entity.components.filter((component) => component.id === focusComponentId) : entity.components
  const byTypeId = new Map(registration.componentTypes.map((type) => [type.typeId, type]))
  for (const component of components) {
    const registered = byTypeId.get(component.typeId)
    root.append(componentCard(sceneId, entity.id, component.id, registered, component.data, snapshot, options))
  }
}

function componentCard(
  sceneId: string, entityId: string, componentId: string,
  registered: ComponentTypeRegistration | undefined, data: unknown,
  snapshot: ProjectSnapshot, options: ProjectInspectorOptions
): HTMLElement {
  const card = document.createElement('div')
  card.className = 'ed-component-card'
  card.dataset.componentCard = ''
  card.dataset.componentId = componentId
  const title = document.createElement('div')
  title.className = 'ed-component-title'
  title.textContent = registered?.label ?? componentId
  card.append(title)
  if (registered) {
    mountPropertyControl(card, {
      schema: registered.schema, value: data, pointer: '',
      target: { kind: 'component', sceneId, entityId, componentId },
      dispatch: options.dispatch, referenceOptions: referenceOptionsFor(snapshot, sceneId)
    })
  }
  return card
}

function renderMultiEntity(root: HTMLElement, context: ProjectInspectorContext, options: ProjectInspectorOptions): void {
  const { snapshot, selection } = context
  if (selection.kind !== 'entity') return
  const sceneId = selection.sceneId
  const scene = snapshot.scenes[sceneId]
  root.append(header(`${selection.entityIds.length} entities`))

  const group = document.createElement('div')
  group.className = 'ed-field ed-vec3'
  group.dataset.multiPosition = ''
  const labelSpan = document.createElement('span')
  labelSpan.className = 'ed-field-label'
  labelSpan.textContent = 'Position'
  group.append(labelSpan)

  for (const axis of ['x', 'y', 'z'] as const) {
    const input = document.createElement('input')
    input.type = 'text'
    input.inputMode = 'decimal'
    input.className = 'ed-field-num'
    input.dataset.axis = axis
    input.addEventListener('change', () => {
      const raw = Number(input.value.trim())
      if (input.value.trim() === '' || !Number.isFinite(raw)) {
        input.setAttribute('aria-invalid', 'true')
        return
      }
      input.removeAttribute('aria-invalid')
      // Apply the shared axis to every selected entity's transform.
      for (const entityId of selection.entityIds) {
        const entity = scene?.entities.find((candidate) => candidate.id === entityId)
        const transform = entity?.components.find((component) => component.typeId === CORE_TYPE_IDS.transform)
        if (transform) options.dispatch({ type: 'setProperty', target: { kind: 'component', sceneId, entityId, componentId: transform.id }, pointer: `/position/${axis}`, value: raw })
      }
    })
    group.append(input)
  }
  root.append(group)
}

function entityNameField(sceneId: string, entityId: string, name: string, options: ProjectInspectorOptions): HTMLElement {
  const wrap = document.createElement('label')
  wrap.className = 'ed-field'
  const span = document.createElement('span')
  span.className = 'ed-field-label'
  span.textContent = 'Name'
  const input = document.createElement('input')
  input.type = 'text'
  input.dataset.entityName = ''
  input.value = name
  input.addEventListener('change', () => options.dispatch({ type: 'setProperty', target: { kind: 'entity', sceneId, entityId }, pointer: '/name', value: input.value }))
  wrap.append(span, input)
  return wrap
}

function entityEnabledField(sceneId: string, entityId: string, enabled: boolean, options: ProjectInspectorOptions): HTMLElement {
  const wrap = document.createElement('label')
  wrap.className = 'ed-field'
  const span = document.createElement('span')
  span.className = 'ed-field-label'
  span.textContent = 'Enabled'
  const input = document.createElement('input')
  input.type = 'checkbox'
  input.dataset.entityEnabled = ''
  input.checked = enabled
  input.addEventListener('change', () => options.dispatch({ type: 'setProperty', target: { kind: 'entity', sceneId, entityId }, pointer: '/enabled', value: input.checked }))
  wrap.append(span, input)
  return wrap
}

function hint(text: string): HTMLElement {
  const element = document.createElement('p')
  element.className = 'ed-hint'
  element.textContent = text
  return element
}
