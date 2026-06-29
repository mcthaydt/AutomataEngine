import type { ArchetypeLibrary } from '@automata/engine'
import { createKeyboardInput } from '@automata/engine/browser'
import type { EditorProjectRegistration, ProjectPlayHandle } from '@automata/editor'
import { CORE_TYPE_IDS } from '@automata/project'
import { createGameplay } from '../game/gameplay'
import { createGameStore } from '../state/root'
import { monkeyBallProjectDefinition } from './definition'
import { evaluateMonkeyBallProject } from './evaluation'
import { MONKEY_BALL_TYPE_IDS, type CompiledMonkeyBallProject } from './types'

const transform = (position = { x: 0, y: 0, z: 0 }) => ({
  typeId: CORE_TYPE_IDS.transform,
  data: { position, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } }
})

const archetype = (archetypeId: 'banana' | 'bumper' | 'moving-platform') => ({
  typeId: MONKEY_BALL_TYPE_IDS.archetype,
  data: { archetypeId, overrides: {} }
})

/** Close preview/evaluation over the runtime archetype registry. */
export function createMonkeyBallEditorRegistration(
  lib: ArchetypeLibrary
): EditorProjectRegistration<CompiledMonkeyBallProject> {
  return {
    project: monkeyBallProjectDefinition,
    prefabs: [
      {
        id: 'box', label: 'Box', components: [
          transform(),
          { typeId: CORE_TYPE_IDS.primitive, data: { shape: 'box', size: { x: 4, y: 0.5, z: 4 } } },
          { typeId: CORE_TYPE_IDS.surface, data: { color: '#7ec850' } },
          { typeId: CORE_TYPE_IDS.collider, data: { shape: 'box', friction: 0.6 } }
        ]
      },
      {
        id: 'cylinder', label: 'Cylinder', components: [
          transform(),
          { typeId: CORE_TYPE_IDS.primitive, data: { shape: 'cylinder', size: { x: 2, y: 1, z: 2 } } },
          { typeId: CORE_TYPE_IDS.surface, data: { color: '#4ecdc4' } },
          { typeId: CORE_TYPE_IDS.collider, data: { shape: 'cylinder', friction: 0.6 } }
        ]
      },
      { id: 'banana', label: 'Banana', components: [transform({ x: 0, y: 0.6, z: 0 }), archetype('banana')] },
      { id: 'bumper', label: 'Bumper', components: [transform({ x: 0, y: 0.25, z: 0 }), archetype('bumper')] },
      { id: 'moving-platform', label: 'Moving Platform', components: [transform(), archetype('moving-platform')] },
      {
        id: 'spawn', label: 'Spawn', components: [
          transform({ x: 0, y: 1, z: 0 }),
          { typeId: MONKEY_BALL_TYPE_IDS.spawn, data: { timeLimitS: 60, fallY: -10 } }
        ]
      },
      {
        id: 'goal', label: 'Goal', components: [
          transform(),
          { typeId: MONKEY_BALL_TYPE_IDS.goal, data: {} }
        ]
      }
    ],
    preview: {
      create(compiled, sceneId, render, physics): ProjectPlayHandle {
        const level = compiled.levels[sceneId]
        if (!level) throw new Error(`Monkey Ball preview: missing level "${sceneId}"`)
        const store = createGameStore()
        const input = createKeyboardInput(window)
        const game = createGameplay({
          store,
          physics,
          render,
          lib,
          level,
          tuning: compiled.tuning,
          inputSources: [input]
        })
        store.dispatch({ type: 'levelStarted', levelId: sceneId })
        return {
          fixedUpdate: (dt) => game.fixedUpdate(dt),
          render: (alpha, frameDt) => game.render(alpha, frameDt),
          dispose: () => {
            game.dispose()
            input.dispose()
          }
        }
      }
    },
    evaluation: {
      evaluate: (snapshot, opts) => evaluateMonkeyBallProject(snapshot, lib, opts)
    }
  }
}
