import type { DialogueChoice, DialogueCondition, DialogueDef, DialogueEffect, DialogueNode } from './config'
import type { InventoryView, QuestLog } from './questCore'

/** Pure dialogue-tree traversal: no DOM, clocks, or RNG. */
export interface DialogueSession { dialogueId: string; nodeId: string }

export function startDialogue(dialogue: DialogueDef): DialogueSession {
  return { dialogueId: dialogue.id, nodeId: dialogue.start }
}

export function currentNode(dialogue: DialogueDef, session: DialogueSession): DialogueNode {
  const node = dialogue.nodes.find((entry) => entry.id === session.nodeId)
  if (!node) throw new Error(`Dialogue "${dialogue.id}" has no node "${session.nodeId}"`)
  return node
}

/** AND over the list; an absent list is vacuously true. */
export function conditionsMet(conditions: readonly DialogueCondition[] | undefined, questLog: QuestLog, inventory: InventoryView): boolean {
  return (conditions ?? []).every((condition) =>
    condition.kind === 'questState'
      ? questLog[condition.questId] === condition.status
      : condition.itemIds.every((itemId) => inventory.collected.includes(itemId)))
}

/** The choices the player actually sees, in authored order. */
export function availableChoices(dialogue: DialogueDef, session: DialogueSession, questLog: QuestLog, inventory: InventoryView): DialogueChoice[] {
  return currentNode(dialogue, session).choices
    .filter((choice) => conditionsMet(choice.conditions, questLog, inventory))
}

export interface ChoiceOutcome { session: DialogueSession | null; effects: readonly DialogueEffect[] }

/** Pick by index into availableChoices; out-of-range is a no-op. */
export function choose(dialogue: DialogueDef, session: DialogueSession, index: number, questLog: QuestLog, inventory: InventoryView): ChoiceOutcome {
  const choice = availableChoices(dialogue, session, questLog, inventory)[index]
  if (!choice) return { session, effects: [] }
  return {
    session: choice.next === null ? null : { dialogueId: dialogue.id, nodeId: choice.next },
    effects: choice.effects ?? []
  }
}
