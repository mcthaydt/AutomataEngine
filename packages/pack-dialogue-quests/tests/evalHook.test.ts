import { describe, expect, it } from 'vitest'
import { validConfig } from './fixtures'
import { createDialogueQuestsEvalHook } from '../src/evalHook'

const config = validConfig()
const npcPos = config.npcs[0]!.position
const away = { x: -8, z: -8 }
const noSlices = { inventory: { collected: [] as string[] } }
const heldSlices = { inventory: { collected: ['item-1'] } }

describe('dialogue-quests eval hook', () => {
  it('targets the giver to accept, then yields (null) while the fetch is unsatisfied', () => {
    const hook = createDialogueQuestsEvalHook(config)
    let state = hook.createState()
    expect(hook.nextTarget(state, away, noSlices)).toEqual(npcPos)
    state = hook.step(state, npcPos, noSlices)
    expect(hook.complete(state)).toBe(false)
    expect(hook.nextTarget(state, away, noSlices)).toBeNull()
  })

  it('targets the giver again once items are held, completes on the second visit', () => {
    const hook = createDialogueQuestsEvalHook(config)
    let state = hook.createState()
    state = hook.step(state, npcPos, noSlices)
    expect(hook.nextTarget(state, away, heldSlices)).toEqual(npcPos)
    state = hook.step(state, npcPos, heldSlices)
    expect(hook.complete(state)).toBe(true)
    expect(hook.nextTarget(state, away, heldSlices)).toBeNull()
  })

  it('does nothing outside talk radius and publishes the questLog slice', () => {
    const hook = createDialogueQuestsEvalHook(config)
    const state = hook.createState()
    expect(hook.step(state, away, noSlices)).toBe(state)
    expect(hook.publishSlices!(state)).toEqual({ questLog: { 'q-1': 'available' } })
  })
})
