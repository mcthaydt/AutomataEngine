import { describe, expect, it } from 'vitest'
import { validConfig } from './fixtures'
import { acceptQuest, createQuestLog } from '../src/questCore'
import { availableChoices, choose, startDialogue } from '../src/dialogueCore'

const config = validConfig()
const dialogue = config.dialogues[0]!
const quests = config.quests
const none = { collected: [] as string[] }
const held = { collected: ['item-1'] }

describe('dialogueCore', () => {
  it('starts at the start node', () => {
    expect(startDialogue(dialogue)).toEqual({ dialogueId: 'dlg-1', nodeId: 'greet' })
  })

  it('filters choices by quest state and inventory (AND semantics)', () => {
    const fresh = createQuestLog(quests)
    const session = startDialogue(dialogue)
    expect(availableChoices(dialogue, session, fresh, none).map((choice) => choice.text))
      .toEqual(['I will help.', 'Bye.'])
    const active = acceptQuest(fresh, 'q-1')
    expect(availableChoices(dialogue, session, active, none).map((choice) => choice.text))
      .toEqual(['Bye.'])
    expect(availableChoices(dialogue, session, active, held).map((choice) => choice.text))
      .toEqual(['Hand it over.', 'Bye.'])
  })

  it('choose advances the session and returns effects; terminal choice ends it', () => {
    const fresh = createQuestLog(quests)
    const session = startDialogue(dialogue)
    const accepted = choose(dialogue, session, 0, fresh, none)
    expect(accepted.session).toEqual({ dialogueId: 'dlg-1', nodeId: 'done' })
    expect(accepted.effects).toEqual([{ kind: 'acceptQuest', questId: 'q-1' }])
    const ended = choose(dialogue, accepted.session!, 0, fresh, none)
    expect(ended.session).toBeNull()
    expect(ended.effects).toEqual([])
  })

  it('out-of-range choice is a no-op', () => {
    const session = startDialogue(dialogue)
    const outcome = choose(dialogue, session, 7, createQuestLog(quests), none)
    expect(outcome.session).toEqual(session)
    expect(outcome.effects).toEqual([])
  })
})
