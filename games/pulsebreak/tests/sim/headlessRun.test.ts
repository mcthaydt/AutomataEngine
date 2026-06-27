import { describe, expect, it } from 'vitest'
import { createWorld } from '@automata/engine'
import { createHeadlessRun, kite } from '../../src/sim/headlessRun'
import { createGameStore } from '../../src/state/root'
import type { Entity } from '../../src/entity'
import type { SceneId } from '../../src/state/actions'

const ended = (run: ReturnType<typeof createHeadlessRun>) => (): boolean =>
  ['victory', 'defeat'].includes(run.store.getState().scene satisfies SceneId)

describe('headless full-run flows', () => {
  it('plays from title to victory clearing all five waves', () => {
    const run = createHeadlessRun({ seed: 42, control: kite })
    run.store.dispatch({ type: 'runStarted' })
    run.runUntil(ended(run), 12_000)
    expect(run.store.getState().scene).toBe('victory')
    expect(run.store.getState().run.wave).toBe(5)
    expect(run.store.getState().run.score).toBeGreaterThan(0)
    expect(run.store.getState().progress.bestScore).toBe(run.store.getState().run.score)
    run.dispose()
  })

  it('is deterministic: the same seed yields the same victory outcome', () => {
    const a = createHeadlessRun({ seed: 7, control: kite })
    const b = createHeadlessRun({ seed: 7, control: kite })
    a.store.dispatch({ type: 'runStarted' })
    b.store.dispatch({ type: 'runStarted' })
    const stepsA = a.runUntil(ended(a), 12_000)
    const stepsB = b.runUntil(ended(b), 12_000)
    expect(a.store.getState().scene).toBe('victory')
    expect(stepsA).toBe(stepsB)
    expect(a.store.getState().run.score).toBe(b.store.getState().run.score)
    a.dispose(); b.dispose()
  })

  it('kite returns a neutral input when there is no drone', () => {
    expect(kite(createWorld<Entity>(), createGameStore())).toEqual({ x: 0, y: 0 })
  })

  it('honours a custom upgrade picker on the way to victory', () => {
    const run = createHeadlessRun({ seed: 42, control: kite, pickUpgrade: (choices) => choices[0]! })
    run.store.dispatch({ type: 'runStarted' })
    run.runUntil(ended(run), 12_000)
    expect(run.store.getState().scene).toBe('victory')
    run.dispose()
  })

  it('plays from title to defeat and retries back into a live run', () => {
    const run = createHeadlessRun({ seed: 3, disarm: true })
    run.store.dispatch({ type: 'runStarted' })
    run.runUntil(() => run.store.getState().scene === 'defeat', 6000)
    expect(run.store.getState().scene).toBe('defeat')
    expect(run.store.getState().run.health).toBe(0)

    run.store.dispatch({ type: 'retried' })
    expect(run.store.getState().scene).toBe('playing')
    run.step()
    expect(run.store.getState().run.health).toBeGreaterThan(0)
    expect([...run.game.world.with('enemy')].length).toBeGreaterThan(0)
    run.dispose()
  })
})
