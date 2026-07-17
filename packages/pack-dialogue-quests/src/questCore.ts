import { z } from '@automata/project'
import type { QuestDef, QuestStatus } from './config'

/** Pure quest-log state machine: no DOM, clocks, or RNG. */
export type QuestLog = Readonly<Record<string, QuestStatus>>

/** Shape this pack expects of the read-only inventory slice. */
export interface InventoryView { collected: readonly string[] }

const mains = (quests: readonly QuestDef[]): QuestDef[] => quests.filter((quest) => quest.kind === 'main')

/** First main plus all side quests start available; later mains are chain-locked. */
export function createQuestLog(quests: readonly QuestDef[]): QuestLog {
  const firstMainId = mains(quests)[0]?.id
  return Object.fromEntries(quests.map((quest) => [
    quest.id,
    quest.kind === 'side' || quest.id === firstMainId ? 'available' : 'locked'
  ]))
}

export function acceptQuest(log: QuestLog, questId: string): QuestLog {
  if (log[questId] !== 'available') return log
  return { ...log, [questId]: 'active' }
}

export function objectiveSatisfied(quest: QuestDef, inventory: InventoryView): boolean {
  if (quest.objective.kind === 'talk') return true
  return quest.objective.itemIds.every((itemId) => inventory.collected.includes(itemId))
}

/** Complete an active, satisfied quest; completing main N unlocks main N+1. */
export function completeQuest(log: QuestLog, questId: string, quests: readonly QuestDef[], inventory: InventoryView): QuestLog {
  const quest = quests.find((entry) => entry.id === questId)
  if (!quest || log[questId] !== 'active' || !objectiveSatisfied(quest, inventory)) return log
  const next: Record<string, QuestStatus> = { ...log, [questId]: 'complete' }
  const chain = mains(quests)
  const index = chain.findIndex((entry) => entry.id === questId)
  const follower = index >= 0 ? chain[index + 1] : undefined
  if (follower && next[follower.id] === 'locked') next[follower.id] = 'available'
  return next
}

export function questsComplete(log: QuestLog, quests: readonly QuestDef[]): boolean {
  return mains(quests).every((quest) => log[quest.id] === 'complete')
}

/** Earliest not-yet-complete main quest: the HUD and evaluator focus. */
export function activeMainQuest(log: QuestLog, quests: readonly QuestDef[]): QuestDef | null {
  return mains(quests).find((quest) => log[quest.id] !== 'complete') ?? null
}

const questStatusSchema = z.enum(['locked', 'available', 'active', 'complete'])
const savedQuestLogSchema = z.record(z.string().min(1).max(60), questStatusSchema)

export function serializeQuestLog(log: QuestLog): unknown {
  return { ...log }
}

/** Parse or throw; saved keys must exactly match the configured quest set. */
export function deserializeQuestLog(raw: unknown, quests: readonly QuestDef[]): QuestLog {
  const parsed = savedQuestLogSchema.parse(raw)
  const expected = new Set(quests.map((quest) => quest.id))
  for (const id of Object.keys(parsed)) {
    if (!expected.has(id)) throw new Error(`Saved quest log has unknown quest "${id}"`)
  }
  for (const id of expected) {
    if (!(id in parsed)) throw new Error(`Saved quest log missing quest "${id}"`)
  }
  return parsed
}
