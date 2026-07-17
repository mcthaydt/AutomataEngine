import { describe, expect, it } from 'vitest'
import { createSchedulesRelationshipsEvalHook, EVAL_TICK_DT } from '../src/evalHook'
import { validConfig } from './fixtures'

const player = { x: 0, z: 0 }

describe('schedules-relationships eval hook', () => {
  it('never requests a walk target and starts incomplete', () => {
    const hook = createSchedulesRelationshipsEvalHook(validConfig())
    const state = hook.createState()
    expect(hook.nextTarget(state, player, {})).toBeNull()
    expect(hook.complete(state)).toBe(false)
  })

  it('completes when the questLog slice shows its tracked quest complete', () => {
    const hook = createSchedulesRelationshipsEvalHook(validConfig())
    let state = hook.createState()
    state = hook.step(state, player, { questLog: { 'q-main-1': 'active' } })
    expect(hook.complete(state)).toBe(false)
    state = hook.step(state, player, { questLog: { 'q-main-1': 'complete' } })
    expect(hook.complete(state)).toBe(true)
    expect(hook.publishSlices!(state)).toMatchObject({ relationships: { affinities: { 'npc-1': 1 } } })
  })

  it('does not double-count a quest that stays complete across ticks', () => {
    const hook = createSchedulesRelationshipsEvalHook(validConfig())
    let state = hook.createState()
    state = hook.step(state, player, { questLog: { 'q-main-1': 'complete' } })
    state = hook.step(state, player, { questLog: { 'q-main-1': 'complete' } })
    expect(hook.publishSlices!(state)).toMatchObject({ relationships: { affinities: { 'npc-1': 1 } } })
  })

  it('advances the published clock slice deterministically with its fixed tick', () => {
    const config = { ...validConfig(), slotSeconds: 5 }
    const hook = createSchedulesRelationshipsEvalHook(config)
    let state = hook.createState()
    const ticks = Math.ceil(5 / EVAL_TICK_DT)
    for (let i = 0; i < ticks; i += 1) state = hook.step(state, player, {})
    expect((hook.publishSlices!(state) as { clock: { slot: number } }).clock.slot).toBe(1)
  })
})
