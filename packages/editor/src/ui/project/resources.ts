import type { ResourceTypeRegistration } from '@automata/project'
import type { ProjectEditorAction } from '../../project/actions'
import type { ProjectEditorState } from '../../project/store'

/**
 * Resource panel: groups current documents by registered resource type and
 * offers an Add action per type. Singleton types disable Add once one document
 * exists. Clicking a document selects it for the inspector.
 */
export interface ProjectResourcesOptions {
  dispatch: (action: ProjectEditorAction) => void
}

export interface ProjectResourcesHandle {
  update(state: ProjectEditorState): void
  dispose(): void
}

export function mountProjectResources(parent: HTMLElement, options: ProjectResourcesOptions): ProjectResourcesHandle {
  const root = document.createElement('div')
  root.className = 'ed-panel ed-resources'
  root.dataset.projectResources = ''
  parent.append(root)
  return {
    update(state) { render(root, state, options) },
    dispose() { root.remove() }
  }
}

function render(root: HTMLElement, state: ProjectEditorState, options: ProjectResourcesOptions): void {
  root.replaceChildren()
  const head = document.createElement('div')
  head.className = 'ed-panel-head'
  head.textContent = 'Resources'
  root.append(head)

  const selectedId = state.selection.kind === 'resource' ? state.selection.resourceId : null
  for (const type of state.registration.resourceTypes) {
    const group = document.createElement('div')
    group.className = 'ed-resource-group'
    group.dataset.resourceType = type.typeId
    const title = document.createElement('div')
    title.className = 'ed-resource-title'
    title.textContent = type.label
    group.append(title)

    const docs = Object.values(state.snapshot.resources).filter((resource) => resource.typeId === type.typeId)
    for (const doc of docs) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'ed-resource-row'
      button.dataset.resourceId = doc.id
      button.textContent = doc.id
      if (doc.id === selectedId) button.classList.add('is-selected')
      button.addEventListener('click', () => options.dispatch({ type: 'select', selection: { kind: 'resource', resourceId: doc.id } }))
      group.append(button)
    }

    const add = document.createElement('button')
    add.type = 'button'
    add.dataset.resourceAdd = type.typeId
    add.textContent = `Add ${type.label}`
    add.disabled = Boolean(type.singleton) && docs.length >= 1
    add.addEventListener('click', () => options.dispatch({ type: 'projectCommand', command: addResourceCommand(state, type) }))
    group.append(add)
    root.append(group)
  }
}

function addResourceCommand(state: ProjectEditorState, type: ResourceTypeRegistration): Extract<ProjectEditorAction, { type: 'projectCommand' }>['command'] {
  const base = type.typeId.split('.').pop() ?? 'resource'
  let id = base
  let counter = 1
  while (state.snapshot.resources[id]) id = `${base}-${++counter}`
  return {
    type: 'addResource',
    resource: { formatVersion: 1, id, typeId: type.typeId, data: structuredClone(type.defaultData) },
    path: `resources/${id}.resource.json`
  }
}
