import type { EditorProjectRegistration, ProjectPlayHandle } from '@automata/editor'
import { createKeyboardInput } from '@automata/engine/browser'
import { CORE_TYPE_IDS } from '@automata/project'
import { createGameplay } from '../game/gameplay'
import { createRng } from '../sim/rng'
import { createGameStore } from '../state/root'
import { pulsebreakProjectDefinition } from './definition'
import { evaluatePulsebreakProject } from './evaluation'
import { PULSEBREAK_TYPE_IDS, type PulsebreakCompiledProject } from './types'

const transform = (position = { x: 0, y: 0.5, z: 0 }) => ({
  typeId: CORE_TYPE_IDS.transform,
  data: { position, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } }
})

/** Declarative Pulsebreak authoring registration; shared UI supplies all DOM. */
export const pulsebreakEditorRegistration: EditorProjectRegistration<PulsebreakCompiledProject> = {
  project: pulsebreakProjectDefinition,
  prefabs: [
    {
      id: 'floor',
      label: 'Floor',
      components: [
        transform({ x: 0, y: -0.15, z: 0 }),
        { typeId: CORE_TYPE_IDS.primitive, data: { shape: 'box', size: { x: 28, y: 0.3, z: 28 } } },
        { typeId: CORE_TYPE_IDS.surface, data: { color: '#0a1124' } }
      ]
    },
    {
      id: 'player-start',
      label: 'Player Start',
      components: [transform(), { typeId: PULSEBREAK_TYPE_IDS.playerStart, data: {} }]
    },
    {
      id: 'spawn-zone',
      label: 'Spawn Zone',
      components: [
        transform(),
        {
          typeId: PULSEBREAK_TYPE_IDS.spawnZone,
          data: {
            mode: 'ring', radius: 13, weight: 1, enemies: ['rammer', 'shooter'],
            minSeparation: 0, edgePaddingMin: 1, edgePaddingMax: 3, angleJitterRad: 0.35
          }
        }
      ]
    }
  ],
  preview: {
    create(compiled, _sceneId, render): ProjectPlayHandle {
      const store = createGameStore({ config: compiled })
      const input = createKeyboardInput(window)
      const game = createGameplay({
        config: compiled,
        store,
        render,
        rng: createRng(1),
        inputSources: [input]
      })
      store.dispatch({ type: 'runStarted' })
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
  evaluation: { evaluate: evaluatePulsebreakProject }
}
