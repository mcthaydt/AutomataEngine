import { describe, expect, it } from 'vitest'
import { createSeededRng } from '@automata/engine'
import { packConfigSchema } from '../src/config'
import { composeDialogueSection, type DialogueComposeInput } from '../src/composeSection'

const input = (): DialogueComposeInput => ({
  specConfig: {},
  quests: [
    { id: 'q-main-1', kind: 'main', summary: 'Meet the keeper' },
    { id: 'q-main-2', kind: 'main', summary: 'Recover the lens' },
    { id: 'q-side-1', kind: 'side', summary: 'Chat with the dockhand' }
  ],
  cast: [
    { id: 'c-player', name: 'You', role: 'player' },
    { id: 'c-keeper', name: 'The Keeper', role: 'quest-giver' },
    { id: 'c-dock', name: 'Dockhand', role: 'ally' }
  ],
  arena: { half: 12, spawn: { x: -8, z: -8 }, goal: { x: 6, z: 6 } },
  inventory: { items: [{ id: 'item-1', position: { x: -2, z: 3 } }] }
})

describe('composeDialogueSection', () => {
  it('is deterministic and schema-valid', () => {
    const a = composeDialogueSection(input(), createSeededRng(7))
    const b = composeDialogueSection(input(), createSeededRng(7))
    expect(a).toEqual(b)
    expect(() => packConfigSchema.parse(a)).not.toThrow()
    expect(a.talkRadius).toBe(2)
  })

  it('alternates talk/fetch, capping fetch by available items', () => {
    const config = composeDialogueSection(input(), createSeededRng(7))
    expect(config.quests.map((quest) => quest.objective.kind)).toEqual(['talk', 'fetch', 'talk'])
    const fetch = config.quests.find((quest) => quest.objective.kind === 'fetch')!
    expect(fetch.objective).toEqual({ kind: 'fetch', itemIds: ['item-1'] })
  })

  it('places NPCs inside the arena, clear of spawn/goal/items/each other', () => {
    const config = composeDialogueSection(input(), createSeededRng(7))
    const points = [input().arena.spawn, input().arena.goal, ...input().inventory.items.map((item) => item.position)]
    for (const npc of config.npcs) {
      expect(Math.abs(npc.position.x)).toBeLessThanOrEqual(11)
      expect(Math.abs(npc.position.z)).toBeLessThanOrEqual(11)
      for (const point of points) {
        expect(Math.hypot(npc.position.x - point.x, npc.position.z - point.z)).toBeGreaterThanOrEqual(2)
      }
    }
  })

  it('orders progressing choices first in every node (greedy-eval invariant)', () => {
    const config = composeDialogueSection(input(), createSeededRng(7))
    for (const dialogue of config.dialogues) {
      for (const node of dialogue.nodes) {
        const firstPlain = node.choices.findIndex((choice) => !choice.effects)
        const lastEffect = node.choices.reduce((last, choice, index) => (choice.effects ? index : last), -1)
        if (firstPlain !== -1 && lastEffect !== -1) expect(lastEffect).toBeLessThan(firstPlain)
      }
    }
  })

  it('throws when no cast member can give quests', () => {
    const bad = input()
    ;(bad as { cast: unknown }).cast = [{ id: 'c-player', name: 'You', role: 'player' }]
    expect(() => composeDialogueSection(bad, createSeededRng(7))).toThrow(/quest-giver/i)
  })
})
