// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  archetypeLibraryKind,
  createNullAudio,
  createNullRenderer,
  createRapierPhysics,
  parseData,
  type InputSource
} from '@automata/engine'
import { createGameplay } from '../../src/game/gameplay'
import { registerSounds } from '../../src/audio/sounds'
import { levelKind } from '../../src/data/level'
import { createGameStore } from '../../src/state/root'
import { readDataFile } from '../helpers/data'
import type { PhysicsTuning } from '../../src/data/config'

const lib = parseData(archetypeLibraryKind, readDataFile('archetypes/standard.yaml'), 'standard.yaml')
const level = parseData(levelKind, readDataFile('levels/w1-l1.json'), 'w1-l1.json')
const tuning: PhysicsTuning = {
  maxTiltRad: (12 * Math.PI) / 180, tiltSmooth: 1, gravity: 9.81, ball: { radius: 0.5, friction: 0.6 }
}
const stick = (v: { x: number; y: number }): InputSource => ({ read: () => v, dispose() {} })

describe('gameplay runner — M10 effects', () => {
  it('plays the pickup sound through the runner on collection', async () => {
    const physics = await createRapierPhysics()
    const render = createNullRenderer()
    const audio = createNullAudio(); registerSounds(audio.port)
    const store = createGameStore()
    store.dispatch({ type: 'levelStarted', levelId: level.id })
    const game = createGameplay({
      store, physics, render: render.port, audio: audio.port, lib, level, tuning,
      inputSources: [stick({ x: 0, y: 1 })]
    })

    let played = false
    for (let i = 0; i < 240 && !played; i++) {
      game.fixedUpdate(1 / 60)
      played = audio.calls.some((c) => c.op === 'play' && c.id === 'pickup')
    }
    expect(played).toBe(true)
    game.dispose(); physics.dispose()
  })

  it('reaps the respawn-poof particles while still playing', async () => {
    const physics = await createRapierPhysics()
    const render = createNullRenderer()
    const audio = createNullAudio(); registerSounds(audio.port)
    const store = createGameStore()
    store.dispatch({ type: 'levelStarted', levelId: level.id })
    const game = createGameplay({
      store, physics, render: render.port, audio: audio.port, lib, level, tuning,
      inputSources: [stick({ x: 0, y: 0 })]
    })

    store.dispatch({ type: 'ballFell' })
    expect([...game.world.with('particle')].length).toBeGreaterThan(0)
    for (let i = 0; i < 60; i++) game.fixedUpdate(1 / 60)
    expect([...game.world.with('particle')]).toHaveLength(0)
    game.dispose(); physics.dispose()
  })
})
