import { describe, expect, it } from 'vitest'
import { packConfigSchema } from '../src/config'
import { validConfig } from './fixtures'

describe('dialogue-quests pack config schema', () => {
  it('parses a valid config unchanged', () => {
    expect(packConfigSchema.parse(validConfig())).toEqual(validConfig())
  })

  it('rejects a choice pointing at a missing node', () => {
    const config = validConfig()
    config.dialogues[0]!.nodes[0]!.choices[2]!.next = 'nowhere'
    expect(() => packConfigSchema.parse(config)).toThrow(/nowhere/)
  })

  it('rejects a missing start node, duplicate node ids, and duplicate dialogue ids', () => {
    const missingStart = validConfig()
    missingStart.dialogues[0]!.start = 'nope'
    expect(() => packConfigSchema.parse(missingStart)).toThrow(/start/)
    const dupNode = validConfig()
    dupNode.dialogues[0]!.nodes.push({ ...dupNode.dialogues[0]!.nodes[1]! })
    expect(() => packConfigSchema.parse(dupNode)).toThrow(/duplicate/i)
    const dupDialogue = validConfig()
    dupDialogue.dialogues.push({ ...dupDialogue.dialogues[0]! })
    expect(() => packConfigSchema.parse(dupDialogue)).toThrow(/duplicate/i)
  })

  it('rejects an npc referencing a missing dialogue and a quest referencing a missing npc', () => {
    const badNpc = validConfig()
    badNpc.npcs[0]!.dialogueId = 'dlg-9'
    expect(() => packConfigSchema.parse(badNpc)).toThrow(/dlg-9/)
    const badQuest = validConfig()
    badQuest.quests[0]!.giverNpcId = 'npc-9'
    expect(() => packConfigSchema.parse(badQuest)).toThrow(/npc-9/)
  })

  it('rejects conditions/effects referencing unknown quests and empty fetch itemIds', () => {
    const badRef = validConfig()
    badRef.dialogues[0]!.nodes[0]!.choices[1]!.effects = [{ kind: 'acceptQuest', questId: 'q-9' }]
    expect(() => packConfigSchema.parse(badRef)).toThrow(/q-9/)
    const emptyFetch = validConfig()
    emptyFetch.quests[0]!.objective = { kind: 'fetch', itemIds: [] }
    expect(() => packConfigSchema.parse(emptyFetch)).toThrow()
  })
})
