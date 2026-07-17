import type { ProjectCommand } from '@automata/project'
import { uniqueComponentId } from '../../project/ids'
import type { ProjectEditorState } from '../../project/store'

/**
 * Placement palette: prefab buttons select the active placement tool (reported
 * via `onSelectPrefab`), and an Add Component menu — generated from the
 * component registrations and gated by cardinality — adds components to the
 * single selected entity.
 */
export interface ProjectPaletteOptions {
  dispatch: (command: ProjectCommand) => void
  onSelectPrefab: (prefabId: string | null) => void
}

export interface ProjectPaletteHandle {
  update(state: ProjectEditorState): void
  dispose(): void
}

export function mountProjectPalette(parent: HTMLElement, options: ProjectPaletteOptions): ProjectPaletteHandle {
  const root = document.createElement('div')
  root.className = 'ed-panel ed-palette'
  root.dataset.projectPalette = ''
  parent.append(root)
  let activePrefab: string | null = null

  const render = (state: ProjectEditorState): void => {
    root.replaceChildren()
    const head = document.createElement('div')
    head.className = 'ed-panel-head'
    head.textContent = 'Palette'
    root.append(head)

    for (const prefab of state.registration.prefabs) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'ed-prefab'
      button.dataset.prefab = prefab.id
      button.textContent = prefab.label
      if (prefab.id === activePrefab) button.classList.add('is-active')
      button.addEventListener('click', () => {
        activePrefab = activePrefab === prefab.id ? null : prefab.id
        options.onSelectPrefab(activePrefab)
        render(state)
      })
      root.append(button)
    }

    renderAddComponent(root, state, options)
  }

  return {
    update(state) { render(state) },
    dispose() { root.remove() }
  }
}

function renderAddComponent(root: HTMLElement, state: ProjectEditorState, options: ProjectPaletteOptions): void {
  const selection = state.selection
  if (selection.kind !== 'entity' || selection.entityIds.length !== 1) return
  const entityId = selection.entityIds[0]!
  const scene = state.snapshot.scenes[selection.sceneId]
  const entity = scene?.entities.find((candidate) => candidate.id === entityId)
  if (!entity) return

  const menu = document.createElement('div')
  menu.className = 'ed-add-component'
  menu.dataset.addComponentMenu = ''
  const title = document.createElement('div')
  title.className = 'ed-add-component-title'
  title.textContent = 'Add Component'
  menu.append(title)

  for (const type of state.registration.componentTypes) {
    const count = entity.components.filter((component) => component.typeId === type.typeId).length
    if (count >= type.cardinality.max) continue
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset.addComponent = type.typeId
    button.textContent = type.label
    button.addEventListener('click', () => {
      const base = type.typeId.split('.').pop() ?? 'component'
      const componentId = uniqueComponentId(entity.components.map((component) => component.id), base)
      options.dispatch({ type: 'addComponent', sceneId: selection.sceneId, entityId, component: { id: componentId, typeId: type.typeId, data: structuredClone(type.defaultData) } })
    })
    menu.append(button)
  }
  root.append(menu)
}
