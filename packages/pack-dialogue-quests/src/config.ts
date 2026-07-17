import { z } from '@automata/project'

/**
 * Compiled pack config: NPCs, dialogue trees, and quests, cross-validated so
 * dangling references are compose-time errors. Contract names for the slices
 * and events this pack owns/reads/emits/consumes live here; the inventory
 * names are deliberate string copies — pack-to-pack imports are forbidden.
 */
export const QUEST_LOG_SLICE_ID = 'questLog'
export const INVENTORY_SLICE_ID = 'inventory'
export const ITEM_ACQUIRED_EVENT = 'itemAcquired'
export const QUEST_COMPLETED_EVENT = 'questCompleted'
export const DIALOGUE_ENDED_EVENT = 'dialogueEnded'

const questStatusSchema = z.enum(['locked', 'available', 'active', 'complete'])
export type QuestStatus = z.infer<typeof questStatusSchema>

const idSchema = z.string().min(1).max(60)
const itemIdsSchema = z.array(idSchema).min(1).max(8)

const questObjectiveSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('talk') }),
  z.strictObject({ kind: z.literal('fetch'), itemIds: itemIdsSchema })
])
export type QuestObjective = z.infer<typeof questObjectiveSchema>

const questDefSchema = z.strictObject({
  id: idSchema,
  kind: z.enum(['main', 'side']),
  title: z.string().min(1).max(120),
  giverNpcId: idSchema,
  objective: questObjectiveSchema
})
export type QuestDef = z.infer<typeof questDefSchema>

const dialogueConditionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('questState'), questId: idSchema, status: questStatusSchema }),
  z.strictObject({ kind: z.literal('hasItems'), itemIds: itemIdsSchema })
])
export type DialogueCondition = z.infer<typeof dialogueConditionSchema>

const dialogueEffectSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('acceptQuest'), questId: idSchema }),
  z.strictObject({ kind: z.literal('completeQuest'), questId: idSchema })
])
export type DialogueEffect = z.infer<typeof dialogueEffectSchema>

const dialogueChoiceSchema = z.strictObject({
  text: z.string().min(1).max(240),
  next: idSchema.nullable(),
  conditions: z.array(dialogueConditionSchema).min(1).max(4).optional(),
  effects: z.array(dialogueEffectSchema).min(1).max(4).optional()
})
export type DialogueChoice = z.infer<typeof dialogueChoiceSchema>

const dialogueNodeSchema = z.strictObject({
  id: idSchema,
  speaker: z.string().min(1).max(80),
  text: z.string().min(1).max(400),
  choices: z.array(dialogueChoiceSchema).min(1).max(9)
})
export type DialogueNode = z.infer<typeof dialogueNodeSchema>

const dialogueDefSchema = z.strictObject({
  id: idSchema,
  start: idSchema,
  nodes: z.array(dialogueNodeSchema).min(1).max(40)
})
export type DialogueDef = z.infer<typeof dialogueDefSchema>

const npcDefSchema = z.strictObject({
  id: idSchema,
  name: z.string().min(1).max(80),
  position: z.strictObject({ x: z.number(), z: z.number() }),
  dialogueId: idSchema
})
export type NpcDef = z.infer<typeof npcDefSchema>

const baseConfigSchema = z.strictObject({
  talkRadius: z.number().min(0.5).max(5),
  npcs: z.array(npcDefSchema).min(1).max(12),
  dialogues: z.array(dialogueDefSchema).min(1).max(12),
  quests: z.array(questDefSchema).min(1).max(18)
})
export type DialogueQuestsPackConfig = z.infer<typeof baseConfigSchema>

const duplicates = (ids: string[]): string[] =>
  ids.filter((id, index) => ids.indexOf(id) !== index)

/** Strict schema plus referential integrity: every mentioned id must resolve. */
export const packConfigSchema: z.ZodType<DialogueQuestsPackConfig> = baseConfigSchema.superRefine((config, ctx) => {
  const issue = (message: string): void => { ctx.addIssue({ code: 'custom', message }) }
  const questIds = new Set(config.quests.map((quest) => quest.id))
  const npcIds = new Set(config.npcs.map((npc) => npc.id))
  const dialogueIds = new Set(config.dialogues.map((dialogue) => dialogue.id))
  for (const duplicate of duplicates(config.quests.map((quest) => quest.id))) issue(`duplicate quest id "${duplicate}"`)
  for (const duplicate of duplicates(config.npcs.map((npc) => npc.id))) issue(`duplicate npc id "${duplicate}"`)
  for (const duplicate of duplicates(config.dialogues.map((dialogue) => dialogue.id))) issue(`duplicate dialogue id "${duplicate}"`)
  for (const npc of config.npcs) {
    if (!dialogueIds.has(npc.dialogueId)) issue(`npc "${npc.id}" references missing dialogue "${npc.dialogueId}"`)
  }
  for (const quest of config.quests) {
    if (!npcIds.has(quest.giverNpcId)) issue(`quest "${quest.id}" references missing npc "${quest.giverNpcId}"`)
  }
  for (const dialogue of config.dialogues) {
    const nodeIds = new Set(dialogue.nodes.map((node) => node.id))
    for (const duplicate of duplicates(dialogue.nodes.map((node) => node.id))) {
      issue(`duplicate node id "${duplicate}" in dialogue "${dialogue.id}"`)
    }
    if (!nodeIds.has(dialogue.start)) issue(`dialogue "${dialogue.id}" start node "${dialogue.start}" missing`)
    for (const node of dialogue.nodes) {
      for (const choice of node.choices) {
        if (choice.next !== null && !nodeIds.has(choice.next)) {
          issue(`choice "${choice.text}" in dialogue "${dialogue.id}" targets missing node "${choice.next}"`)
        }
        for (const condition of choice.conditions ?? []) {
          if (condition.kind === 'questState' && !questIds.has(condition.questId)) {
            issue(`condition references missing quest "${condition.questId}"`)
          }
        }
        for (const effect of choice.effects ?? []) {
          if (!questIds.has(effect.questId)) issue(`effect references missing quest "${effect.questId}"`)
        }
      }
    }
  }
})
