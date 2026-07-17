import type { EvalSliceView, PackEvalHook } from '@automata/game-kit'
import { INVENTORY_SLICE_ID, type DialogueEffect, type DialogueQuestsPackConfig, type QuestDef } from './config'
import { availableChoices, choose, startDialogue } from './dialogueCore'
import {
  acceptQuest, completeQuest, createQuestLog, objectiveSatisfied, questsComplete,
  type InventoryView, type QuestLog
} from './questCore'

interface EvalState { questLog: QuestLog }

const EMPTY_INVENTORY: InventoryView = { collected: [] }
const CONVERSATION_BUDGET = 32

const inventoryView = (slices?: EvalSliceView): InventoryView =>
  (slices?.[INVENTORY_SLICE_ID] as InventoryView | undefined) ?? EMPTY_INVENTORY

/** Earliest quest with an actionable next step: accept or satisfy its turn-in. */
function actionableQuest(config: DialogueQuestsPackConfig, log: QuestLog, inventory: InventoryView): QuestDef | null {
  for (const quest of config.quests) {
    if (log[quest.id] === 'available') return quest
    if (log[quest.id] === 'active' && objectiveSatisfied(quest, inventory)) return quest
  }
  return null
}

/**
 * Headless twin of the browser pack. Conversations are atomic here: one step
 * inside talkRadius greedily drives the whole dialogue. composeSection keeps
 * the progressing choice first, which makes this policy deterministic.
 */
export function createDialogueQuestsEvalHook(config: DialogueQuestsPackConfig): PackEvalHook {
  const applyEffects = (log: QuestLog, effects: readonly DialogueEffect[], inventory: InventoryView): QuestLog => {
    let next = log
    for (const effect of effects) {
      next = effect.kind === 'acceptQuest'
        ? acceptQuest(next, effect.questId)
        : completeQuest(next, effect.questId, config.quests, inventory)
    }
    return next
  }

  return {
    packId: 'dialogue-quests',
    createState: (): EvalState => ({ questLog: createQuestLog(config.quests) }),
    nextTarget(state, _player, slices) {
      const { questLog } = state as EvalState
      if (questsComplete(questLog, config.quests)) return null
      const quest = actionableQuest(config, questLog, inventoryView(slices))
      if (!quest) return null
      const npc = config.npcs.find((entry) => entry.id === quest.giverNpcId)!
      return { ...npc.position }
    },
    step(state, player, slices) {
      const evalState = state as EvalState
      const inventory = inventoryView(slices)
      const npc = config.npcs.find((entry) =>
        Math.hypot(entry.position.x - player.x, entry.position.z - player.z) <= config.talkRadius)
      if (!npc) return state
      const dialogue = config.dialogues.find((entry) => entry.id === npc.dialogueId)!
      let questLog = evalState.questLog
      let session: ReturnType<typeof startDialogue> | null = startDialogue(dialogue)
      for (let turns = 0; session && turns < CONVERSATION_BUDGET; turns += 1) {
        if (availableChoices(dialogue, session, questLog, inventory).length === 0) break
        const outcome = choose(dialogue, session, 0, questLog, inventory)
        questLog = applyEffects(questLog, outcome.effects, inventory)
        session = outcome.session
      }
      return questLog === evalState.questLog ? state : { questLog }
    },
    complete: (state) => questsComplete((state as EvalState).questLog, config.quests),
    publishSlices: (state) => ({ questLog: { ...(state as EvalState).questLog } })
  }
}
