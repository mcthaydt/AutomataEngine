import { createNullAudio, createRecordingSpriteRenderer } from '@automata/engine'
import { describe, expect, it, vi } from 'vitest'

import manifest from '../../assets/manifest.json'
import { registerSounds } from '../../src/audio/sounds'
import { createGameplay } from '../../src/game/gameplay'
import { createGameStore } from '../../src/state/root'

function harness() {
  const store = createGameStore({ seed: 17 })
  const renderer = createRecordingSpriteRenderer()
  const audio = createNullAudio()
  registerSounds(audio.port)
  const presentation = { trigger: vi.fn() }
  const input = {
    movement: { read: vi.fn(() => ({ x: 1, y: 0 })), dispose: vi.fn() },
    read: vi.fn(() => ({ operate: false })),
    consume: vi.fn(() => ({ carryPressed: false, pausePressed: false }))
  }
  const game = createGameplay({
    store,
    manifest,
    render: renderer.port,
    audio: audio.port,
    presentation,
    input
  })
  return { store, renderer, audio, presentation, input, game }
}

describe('createGameplay', () => {
  it('advances only a playing night and freezes paused or terminal state', () => {
    const { store, game } = harness()
    game.fixedUpdate(0.5)
    expect(store.getState().night.timeS).toBe(0)

    store.dispatch({ type: 'runStarted', seed: 17 })
    game.fixedUpdate(0.5)
    expect(store.getState().night.timeS).toBe(0.5)

    store.dispatch({ type: 'paused' })
    game.fixedUpdate(0.5)
    expect(store.getState().night.timeS).toBe(0.5)

    store.dispatch({ type: 'resumed' })
    const night = store.getState().night
    store.dispatch({
      type: 'nightAdvanced',
      night: { ...night, outcome: 'defeat', terminalReason: 'test terminal' }
    })
    game.fixedUpdate(0.5)
    expect(store.getState().scene).toBe('defeat')
    expect(store.getState().night.timeS).toBe(0.5)
  })

  it('renders with interpolation alpha without reading DOM or wall-clock time', () => {
    const { store, renderer, game } = harness()
    store.dispatch({ type: 'runStarted', seed: 17 })
    game.render(1)
    const initial = store.getState().night
    store.dispatch({
      type: 'nightAdvanced',
      night: { ...initial, keeper: { ...initial.keeper, x: 48 } }
    })
    game.render(0.5)

    expect(renderer.getSprite(game.entity('keeper'))?.pose?.x).toBe(24)
  })

  it('drains simulation feedback exactly once before the next render', () => {
    const { store, audio, presentation, game } = harness()
    store.dispatch({ type: 'runStarted', seed: 17 })
    const night = store.getState().night
    store.dispatch({
      type: 'nightAdvanced',
      night: { ...night, feedback: [{ type: 'ship-rescued', timeS: 0 }] }
    })

    game.fixedUpdate(1 / 60)
    game.fixedUpdate(1 / 60)

    expect(audio.calls.filter((call) => call.op === 'play' && call.id === 'rescue')).toHaveLength(1)
    expect(presentation.trigger).toHaveBeenCalledWith('flare')
    expect(store.getState().night.feedback).toEqual([])
  })

  it('rebuilds run-scoped presentation and disposes explicitly', () => {
    const { store, renderer, game } = harness()
    const count = renderer.port.objectCount
    const oldKeeper = game.entity('keeper')
    store.dispatch({ type: 'runStarted', seed: 20 })

    expect(renderer.getSprite(oldKeeper)).toBeUndefined()
    expect(game.entity('keeper')).not.toBe(oldKeeper)
    expect(renderer.port.objectCount).toBe(count)

    game.dispose()
    game.dispose()
    expect(renderer.port.objectCount).toBe(0)
  })
})
