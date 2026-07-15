import type { EditorProjectRegistration, EditorRegistrationLoader, ProjectPlayHandle } from '@automata/editor'
import { CORE_TYPE_IDS } from '@automata/project'
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

/** Registry convention entry: the browser editor discovers and calls this. */
export const loadEditorRegistration: EditorRegistrationLoader = async () => editorRegistration
