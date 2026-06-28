import type { ProjectSnapshot } from '@automata/project'

/**
 * The typed editor selection. Every selectable thing in a project is one of
 * these shapes, so panels and the inspector branch on `kind` instead of on
 * game-specific item types.
 */
export type ProjectSelection =
  | { kind: 'project' }
  | { kind: 'scene'; sceneId: string }
  | { kind: 'entity'; sceneId: string; entityIds: string[] }
  | { kind: 'component'; sceneId: string; entityId: string; componentId: string }
  | { kind: 'resource'; resourceId: string }

export const initialProjectSelection: ProjectSelection = { kind: 'project' }

/**
 * Narrow a selection so it only ever references documents that still exist,
 * falling back toward the broadest still-valid scope (scene → project).
 */
export function reconcileSelection(snapshot: ProjectSnapshot, selection: ProjectSelection): ProjectSelection {
  switch (selection.kind) {
    case 'project':
      return selection
    case 'scene':
      return snapshot.scenes[selection.sceneId] ? selection : { kind: 'project' }
    case 'resource':
      return snapshot.resources[selection.resourceId] ? selection : { kind: 'project' }
    case 'entity': {
      const scene = snapshot.scenes[selection.sceneId]
      if (!scene) return { kind: 'project' }
      const present = new Set(scene.entities.map((entity) => entity.id))
      const entityIds = selection.entityIds.filter((id) => present.has(id))
      return entityIds.length > 0 ? { kind: 'entity', sceneId: selection.sceneId, entityIds } : { kind: 'scene', sceneId: selection.sceneId }
    }
    case 'component': {
      const scene = snapshot.scenes[selection.sceneId]
      const entity = scene?.entities.find((candidate) => candidate.id === selection.entityId)
      if (entity?.components.some((component) => component.id === selection.componentId)) return selection
      if (entity) return { kind: 'entity', sceneId: selection.sceneId, entityIds: [entity.id] }
      return scene ? { kind: 'scene', sceneId: selection.sceneId } : { kind: 'project' }
    }
  }
}
