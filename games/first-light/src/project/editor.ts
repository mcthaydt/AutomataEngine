import type { EditorProjectRegistration, EditorRegistrationLoader, ProjectPlayHandle } from '@automata/editor'
import { emptyComposition, parseCompositionManifest } from '@automata/contracts'
import type { PackPreviewHandle } from '@automata/game-kit'
import { CORE_TYPE_IDS } from '@automata/project'
import { resolveEditorContributions } from '@automata/pack-registry'
import { createGameplay } from '../game/gameplay'
import { seekGoal } from '../sim/sim'
import { projectDefinition } from './definition'
import { evaluateProject } from './evaluation'
import { GAME_TYPE_IDS, type CompiledProject } from './types'

/** Declarative authoring registration; the shared editor UI supplies all DOM. */
export const editorRegistration: EditorProjectRegistration<CompiledProject> = {
  project: projectDefinition,
  prefabs: [
    {
      id: 'spawn-point',
      label: 'Spawn Point',
      components: [
        {
          typeId: CORE_TYPE_IDS.transform,
          data: { position: { x: 0, y: 0.5, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } }
        },
        { typeId: GAME_TYPE_IDS.spawnPoint, data: {} }
      ]
    }
  ],
  preview: {
    create(compiled, _sceneId, render): ProjectPlayHandle {
      // The preview demonstrates the sim by walking itself to the goal.
      return createGameplay({ compiled, render, control: (state) => seekGoal(state, compiled.tuning) })
    }
  },
  evaluation: { evaluate: evaluateProject }
}

/**
 * Registry convention entry: the browser editor discovers and calls this.
 * Composition-aware: composed packs contribute prefab templates and preview
 * markers; plain scaffolds (no composition.json) load the base registration.
 */
export const loadEditorRegistration: EditorRegistrationLoader = async (deps) => {
  let text: string | null = null
  try {
    text = await deps.readText('project/composition.json')
  } catch {
    text = null
  }
  const composition = text === null
    ? emptyComposition(projectDefinition.gameId)
    : parseCompositionManifest(text)
  const contributions = resolveEditorContributions(composition)
  if (contributions.length === 0) return editorRegistration
  const registration: EditorProjectRegistration<CompiledProject> = {
    ...editorRegistration,
    prefabs: [
      ...editorRegistration.prefabs,
      ...contributions.flatMap(({ contribution }) => contribution.prefabs)
    ],
    preview: {
      create(compiled, sceneId, render, physics): ProjectPlayHandle {
        const previewAdapter = editorRegistration.preview!
        const packHandles: PackPreviewHandle[] = []
        try {
          for (const { contribution, config } of contributions) {
            const handle = contribution.createPreview?.(config, render)
            if (handle) packHandles.push(handle)
          }
          const inner = previewAdapter.create(compiled, sceneId, render, physics)
          return {
            fixedUpdate: (dt) => inner.fixedUpdate(dt),
            render: (alpha, frameDt) => {
              inner.render(alpha, frameDt)
              for (const handle of packHandles) handle.render?.(alpha)
            },
            dispose: () => {
              for (const handle of packHandles) handle.dispose()
              inner.dispose()
            }
          }
        } catch (error) {
          for (const handle of packHandles.reverse()) handle.dispose()
          throw error
        }
      }
    }
  }
  return registration
}
