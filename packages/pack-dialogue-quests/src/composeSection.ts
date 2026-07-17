import type { SeededRng } from '@automata/engine'
import {
  packConfigSchema,
  type DialogueChoice, type DialogueDef, type DialogueQuestsPackConfig, type NpcDef, type QuestDef
} from './config'

export const DIALOGUE_DEFAULTS = { talkRadius: 2 } as const

export interface DialogueComposeInput {
  specConfig: { talkRadius?: number }
  quests: ReadonlyArray<{ id: string; kind: 'main' | 'side'; summary: string }>
  cast: ReadonlyArray<{ id: string; name: string; role: string }>
  arena: { half: number; spawn: { x: number; z: number }; goal: { x: number; z: number } }
  inventory: { items: ReadonlyArray<{ id: string; position: { x: number; z: number } }> }
}

const WALL_MARGIN = 1
const KEEPOUT = 3
const SEPARATION = 2
const DRAW_BUDGET = 200
const GIVER_ROLES = ['quest-giver', 'ally', 'vendor']
// Each quest contributes two stateful choices. Three per page leaves room for
// navigation and exit while keeping every dialogue choice list keyboard-safe.
const QUESTS_PER_MENU_PAGE = 3

const round2 = (value: number): number => Math.round(value * 100) / 100
const far = (a: { x: number; z: number }, b: { x: number; z: number }, min: number): boolean =>
  Math.hypot(a.x - b.x, a.z - b.z) >= min

/** Fixed per-quest tree: greet/accepted/done, with progressing choices first. */
function questChoices(quest: QuestDef): { greet: DialogueChoice[]; nodes: DialogueDef['nodes'] } {
  const turnInConditions: DialogueChoice['conditions'] = quest.objective.kind === 'fetch'
    ? [{ kind: 'questState', questId: quest.id, status: 'active' }, { kind: 'hasItems', itemIds: quest.objective.itemIds }]
    : [{ kind: 'questState', questId: quest.id, status: 'active' }]
  const doneId = `${quest.id}-done`
  const acceptedId = `${quest.id}-accepted`
  const greet: DialogueChoice[] = [
    { text: `Here about "${quest.title}" — done.`, next: doneId, conditions: turnInConditions, effects: [{ kind: 'completeQuest', questId: quest.id }] },
    { text: `I'll take on "${quest.title}".`, next: acceptedId, conditions: [{ kind: 'questState', questId: quest.id, status: 'available' }], effects: [{ kind: 'acceptQuest', questId: quest.id }] }
  ]
  const nodes: DialogueDef['nodes'] = [
    {
      id: acceptedId,
      speaker: '',
      text: quest.objective.kind === 'fetch' ? 'Bring it back when you have it.' : 'Good. That settles it.',
      choices: [
        { text: 'Done already.', next: doneId, conditions: turnInConditions, effects: [{ kind: 'completeQuest', questId: quest.id }] },
        { text: 'On my way.', next: null }
      ]
    },
    { id: doneId, speaker: '', text: 'Well done.', choices: [{ text: 'Bye.', next: null }] }
  ]
  return { greet, nodes }
}

/**
 * Keep a single cast giver as a single NPC even for the full 18-quest spec.
 * Menu pages expose three quests each (six stateful choices), followed by a
 * forward link and exit. The largest generated tree has 42 nodes, within the
 * pack's deliberate 48-node safety limit.
 */
function composeDialogueNodes(npcName: string, parts: ReadonlyArray<ReturnType<typeof questChoices>>): DialogueDef['nodes'] {
  const pages: Array<ReadonlyArray<ReturnType<typeof questChoices>>> = []
  for (let offset = 0; offset < parts.length; offset += QUESTS_PER_MENU_PAGE) {
    pages.push(parts.slice(offset, offset + QUESTS_PER_MENU_PAGE))
  }

  return pages.flatMap((page, index) => {
    const id = index === 0 ? 'greet' : `greet-${index + 1}`
    const nextPageId = index + 1 < pages.length ? `greet-${index + 2}` : null
    const choices: DialogueChoice[] = [
      ...page.flatMap((part) => part.greet),
      ...(nextPageId ? [{ text: 'More requests.', next: nextPageId }] : []),
      { text: 'Just passing through.', next: null }
    ]
    return [
      { id, speaker: npcName, text: `${npcName} nods at you.`, choices },
      ...page.flatMap((part) => part.nodes.map((node) => ({ ...node, speaker: npcName })))
    ]
  })
}

/** Seeded NPC placement and templated quest trees; defaults live here, not in GameSpec. */
export function composeDialogueSection(input: DialogueComposeInput, rng: SeededRng): DialogueQuestsPackConfig {
  const talkRadius = input.specConfig.talkRadius ?? DIALOGUE_DEFAULTS.talkRadius
  const givers = GIVER_ROLES.flatMap((role) => input.cast.filter((member) => member.role === role))
  if (givers.length === 0) throw new Error('composeDialogueSection: cast has no quest-giver (or ally/vendor fallback)')
  const npcCount = Math.min(givers.length, input.quests.length)

  const extent = input.arena.half - WALL_MARGIN
  const keepouts = [input.arena.spawn, input.arena.goal]
  const placed: Array<{ x: number; z: number }> = []
  for (let index = 0; index < npcCount; index += 1) {
    let position: { x: number; z: number } | null = null
    for (let draw = 0; draw < DRAW_BUDGET && !position; draw += 1) {
      const candidate = {
        x: round2((rng.next() * 2 - 1) * extent),
        z: round2((rng.next() * 2 - 1) * extent)
      }
      if (!keepouts.every((point) => far(candidate, point, KEEPOUT))) continue
      if (!input.inventory.items.every((item) => far(candidate, item.position, SEPARATION))) continue
      if (!placed.every((other) => far(candidate, other, SEPARATION))) continue
      position = candidate
    }
    if (!position) throw new Error(`NPC placement budget exhausted: placed ${placed.length}/${npcCount}`)
    placed.push(position)
  }

  // Preserve spec order: it defines the main chain. Fetch objectives are capped by concrete items.
  let fetchIndex = 0
  const quests: QuestDef[] = input.quests.map((quest, index) => {
    const wantFetch = index % 2 === 1 && fetchIndex < input.inventory.items.length
    const objective: QuestDef['objective'] = wantFetch
      ? { kind: 'fetch', itemIds: [input.inventory.items[fetchIndex++]!.id] }
      : { kind: 'talk' }
    return {
      id: quest.id,
      kind: quest.kind,
      title: quest.summary,
      giverNpcId: `npc-${(index % npcCount) + 1}`,
      objective
    }
  })

  const npcs: NpcDef[] = placed.map((position, index) => ({
    id: `npc-${index + 1}`,
    name: givers[index]!.name,
    position,
    dialogueId: `dlg-npc-${index + 1}`
  }))
  const dialogues: DialogueDef[] = npcs.map((npc) => {
    const parts = quests.filter((quest) => quest.giverNpcId === npc.id).map((quest) => questChoices(quest))
    return {
      id: npc.dialogueId,
      start: 'greet',
      nodes: composeDialogueNodes(npc.name, parts)
    }
  })

  return packConfigSchema.parse({ talkRadius, npcs, dialogues, quests })
}
