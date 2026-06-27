import type { ArchetypeLibrary, PhysicsPort, RenderPort } from '@automata/engine'
import { createKeyboardInput } from '@automata/engine/browser'
import type { GameDefinition } from '@automata/editor/headless'
import type { PhysicsTuning } from '../data/config'
import type { Level } from '../data/level'
import { createGameplay } from '../game/gameplay'
import { createGameStore } from '../state/root'
import { createHeadlessMonkeyBallDefinition } from './headlessRegistration'

/** Build a definition once boot data is available. */
export function createMonkeyBallDefinition(
  lib: ArchetypeLibrary,
  tuning: PhysicsTuning
): GameDefinition<Level> {
  const definition = createHeadlessMonkeyBallDefinition(lib, tuning)
  return {
    ...definition,
    play: {
      ...definition.play!,
      createGameplay(level: Level, render: RenderPort, physics: PhysicsPort) {
        const store = createGameStore()
        const inputs = [createKeyboardInput(window)]
        const game = createGameplay({ store, physics, render, lib, level, tuning, inputSources: inputs })
        store.dispatch({ type: 'levelStarted', levelId: level.id })

        return {
          fixedUpdate: (dt: number) => game.fixedUpdate(dt),
          render: (alpha: number, frameDt = 0) => game.render(alpha, frameDt),
          dispose: () => {
            game.dispose()
            for (const input of inputs) input.dispose()
          }
        }
      }
    }
  }
}
