import type { EntityDocument } from '@automata/project'
import type { ProjectEditorAction } from '../../project/actions'
import type { ProjectEditorState } from '../../project/store'

/**
 * Scene + entity tree. Renders manifest scenes (click to switch/select) then a
 * depth-first entity tree for the active scene, indented by depth and ordered by
 * scene array order. Delete routes through an injected confirmation hook so the
 * shell owns cascading-delete UX. Reparenting in v1 is explicit (no drag-drop).
 */
export interface ProjectHierarchyOptions {
  dispatch: (action: ProjectEditorAction) => void
  confirmDelete?: (entityIds: string[]) => boolean
}

export interface ProjectHierarchyHandle {
  update(state: ProjectEditorState): void
  dispose(): void
}

export function mountProjectHierarchy(parent: HTMLElement, options: ProjectHierarchyOptions): ProjectHierarchyHandle {
  const root = document.createElement('div')
  root.className = 'ed-panel ed-hierarchy'
  root.dataset.projectHierarchy = ''
  parent.append(root)
  return {
    update(state) { render(root, state, options) },
    dispose() { root.remove() }
  }
}

function render(root: HTMLElement, state: ProjectEditorState, options: ProjectHierarchyOptions): void {
  root.replaceChildren()
  const head = document.createElement('div')
  head.className = 'ed-panel-head'
  head.textContent = 'Hierarchy'
  root.append(head)

  for (const entry of state.snapshot.manifest.scenes) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'ed-tree-scene'
    button.dataset.sceneId = entry.id
    const name = state.snapshot.scenes[entry.id]?.name ?? entry.id
    button.textContent = name === entry.id ? entry.id : `${name} (${entry.id})`
    if (entry.id === state.activeSceneId) button.classList.add('is-active')
    button.addEventListener('click', () => {
      options.dispatch({ type: 'setActiveScene', sceneId: entry.id })
      options.dispatch({ type: 'select', selection: { kind: 'scene', sceneId: entry.id } })
    })
    root.append(button)
  }

  const scene = state.snapshot.scenes[state.activeSceneId]
  if (!scene) return

  const childrenByParent = new Map<string | undefined, EntityDocument[]>()
  for (const entity of scene.entities) {
    const siblings = childrenByParent.get(entity.parentId) ?? []
    siblings.push(entity)
    childrenByParent.set(entity.parentId, siblings)
  }
  const selected = state.selection.kind === 'entity' ? new Set(state.selection.entityIds) : new Set<string>()

  const walk = (parentId: string | undefined, depth: number): void => {
    for (const entity of childrenByParent.get(parentId) ?? []) {
      root.append(entityRow(state.activeSceneId, entity, depth, selected.has(entity.id), options))
      walk(entity.id, depth + 1)
    }
  }
  walk(undefined, 0)
}

function entityRow(sceneId: string, entity: EntityDocument, depth: number, isSelected: boolean, options: ProjectHierarchyOptions): HTMLElement {
  const row = document.createElement('div')
  row.className = 'ed-tree-entity'
  row.dataset.entityId = entity.id
  row.dataset.depth = String(depth)
  row.style.paddingLeft = `${depth * 12}px`
  if (isSelected) row.classList.add('is-selected')

  const label = document.createElement('button')
  label.type = 'button'
  label.className = 'ed-tree-label'
  label.textContent = entity.name
  label.addEventListener('click', () => options.dispatch({ type: 'select', selection: { kind: 'entity', sceneId, entityIds: [entity.id] } }))

  const remove = document.createElement('button')
  remove.type = 'button'
  remove.dataset.delete = ''
  remove.textContent = '✕'
  remove.addEventListener('click', () => {
    if (options.confirmDelete && !options.confirmDelete([entity.id])) return
    options.dispatch({ type: 'projectCommand', command: { type: 'removeEntities', sceneId, entityIds: [entity.id] } })
  })

  row.append(label, remove)
  return row
}
