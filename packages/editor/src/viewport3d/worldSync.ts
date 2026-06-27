import {
  registerRenderables, renderSystem, type EngineEntity, type PhysicsPort, type RenderPort, type World
} from '@automata/engine'
import type { GameDefinition } from '../model/gameDefinition'
import type { EditorStore } from '../state/store'

type EditorEntity = EngineEntity & { editorId?: string }

export interface WorldSync {
  /** Rebuild the live world from the current doc, then re-apply selection highlight. */
  syncNow(): void
  /** Re-apply selection highlight without rebuilding the world (cheap). */
  applyHighlight(): void
  render(alpha: number): void
  dispose(): void
}

export function createWorldSync<Doc>(
  definition: GameDefinition<Doc>,
  store: EditorStore<Doc>,
  render: RenderPort,
  physics: PhysicsPort
): WorldSync {
  const stage = render.createGroup()
  let world: World<EditorEntity> | null = null
  let worldDoc: Doc | undefined
  let offRender: (() => void) | null = null
  const renderStep = renderSystem<{ world: World<EngineEntity>; alpha: number }>(render)

  function teardown(): void {
    if (world) {
      for (const entity of [...world.entities]) world.remove(entity)
    }
    offRender?.()
    offRender = null
    world = null
  }

  function rebuild(doc: Doc): void {
    teardown()
    world = definition.buildWorld(doc, render, physics) as World<EditorEntity>
    offRender = registerRenderables(world, render, stage)
  }

  function applyHighlight(): void {
    if (!world) return
    const selected = new Set(store.getState().selection)
    for (const entity of world.with('editorId')) {
      render.setHighlight(entity, selected.has(entity.editorId!))
    }
  }

  return {
    syncNow() {
      const nextDoc = store.getState().document.doc
      if (!world) {
        rebuild(nextDoc)
        worldDoc = nextDoc
      } else if (nextDoc !== worldDoc) {
        if (definition.syncWorld) {
          definition.syncWorld(world as World<object>, worldDoc!, nextDoc)
        } else {
          rebuild(nextDoc)
        }
        worldDoc = nextDoc
      }
      applyHighlight()
    },
    applyHighlight,
    render(alpha) {
      if (world) renderStep.run({ world, alpha })
    },
    dispose() {
      teardown()
      render.removeGroup(stage)
    }
  }
}
