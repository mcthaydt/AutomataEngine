import { describe, expect, it } from 'vitest'
import { createDirector } from '../../src/systems/director'
import { WAVES, WAVE_COUNT } from '../../src/config'
import type { FeedbackEvent } from '../../src/systems/feedback'
import { playingCtx } from '../helpers/ctx'

const enemyCount = (ctx: ReturnType<typeof playingCtx>) => [...ctx.world.with('enemy')].length
const clearEnemies = (ctx: ReturnType<typeof playingCtx>) => {
  for (const e of [...ctx.world.with('enemy')]) ctx.world.remove(e)
}
const kinds = (ctx: ReturnType<typeof playingCtx>) =>
  ctx.feedback.read<FeedbackEvent>('feedback').map((e) => e.kind)

describe('director', () => {
  it('spawns the first wave on the first playing step', () => {
    const ctx = playingCtx()
    createDirector().run(ctx)
    expect(enemyCount(ctx)).toBe(WAVES[0]!.rammer + WAVES[0]!.shooter)
  })

  it('does not advance the run on the step it spawns', () => {
    const ctx = playingCtx()
    createDirector().run(ctx)
    expect(ctx.store.getState().scene).toBe('playing')
    expect(ctx.store.getState().run.wave).toBe(1)
  })

  it('opens the upgrade screen with three choices once a wave is cleared', () => {
    const ctx = playingCtx()
    const director = createDirector()
    director.run(ctx)
    clearEnemies(ctx)
    director.run(ctx)
    expect(ctx.store.getState().scene).toBe('upgrade')
    expect(ctx.store.getState().run.choices).toHaveLength(3)
    expect(kinds(ctx)).toContain('waveCleared')
  })

  it('spawns the next wave after an upgrade is chosen', () => {
    const ctx = playingCtx()
    const director = createDirector()
    director.run(ctx)
    clearEnemies(ctx)
    director.run(ctx)
    ctx.store.dispatch({ type: 'upgradeChosen', id: ctx.store.getState().run.choices[0]! })
    director.run(ctx)
    expect(ctx.store.getState().run.wave).toBe(2)
    expect(enemyCount(ctx)).toBe(WAVES[1]!.rammer + WAVES[1]!.shooter)
  })

  it('spawns a boss on the final wave and announces it', () => {
    const ctx = playingCtx()
    for (let i = 0; i < WAVE_COUNT - 1; i++) ctx.store.dispatch({ type: 'upgradeChosen', id: 'damage' })
    expect(ctx.store.getState().run.wave).toBe(WAVE_COUNT)
    const director = createDirector()
    director.run(ctx)
    expect([...ctx.world.with('enemy')][0]!.enemy).toEqual({ kind: 'boss' })
    expect(kinds(ctx)).toContain('bossSpawn')
  })

  it('wins the run when the boss is cleared', () => {
    const ctx = playingCtx()
    for (let i = 0; i < WAVE_COUNT - 1; i++) ctx.store.dispatch({ type: 'upgradeChosen', id: 'damage' })
    const director = createDirector()
    director.run(ctx)
    clearEnemies(ctx)
    director.run(ctx)
    expect(ctx.store.getState().scene).toBe('victory')
    expect(kinds(ctx)).toContain('victory')
  })

  it('resets and respawns wave one on a new run', () => {
    const ctx = playingCtx()
    const director = createDirector()
    director.run(ctx)
    ctx.store.dispatch({ type: 'retried' })
    clearEnemies(ctx)
    director.run(ctx)
    expect(ctx.store.getState().run.wave).toBe(1)
    expect(enemyCount(ctx)).toBe(WAVES[0]!.rammer + WAVES[0]!.shooter)
  })

  it('is inert when not playing', () => {
    const ctx = playingCtx()
    ctx.store.dispatch({ type: 'paused' })
    createDirector().run(ctx)
    expect(enemyCount(ctx)).toBe(0)
  })
})
