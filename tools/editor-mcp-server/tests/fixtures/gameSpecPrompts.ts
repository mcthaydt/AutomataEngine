import { minimalGameSpecDraft } from '@automata/contracts'

type Draft = ReturnType<typeof minimalGameSpecDraft>
type Entry = { gameId: string; title: string; logline: string; prompt: string; mutate?: (draft: Draft) => void }

function draftFor(entry: Entry): Draft {
  const draft = minimalGameSpecDraft(entry.gameId)
  const identity = draft.identity as Record<string, unknown>
  identity.title = entry.title
  identity.logline = entry.logline
  entry.mutate?.(draft)
  return draft
}

const entries: readonly Entry[] = [
  { gameId: 'gs-heist', title: 'Small Takes', logline: 'Case a seaside town for one gentle heist.', prompt: 'A cozy heist game where you case a tiny seaside town.', mutate: (draft) => { (draft.identity as Record<string, unknown>).themes = ['heist', 'cozy'] } },
  { gameId: 'gs-noir', title: 'Alley Rain', logline: 'Find a missing cat in one rainy district.', prompt: 'Make me something noir: rain, a missing cat, one stubborn detective.', mutate: (draft) => { (draft.direction as Record<string, unknown>).dialogueTone = 'noir deadpan'; (draft.capabilities as unknown[]).push({ id: 'dialogue-quests', config: {}, requirements: [] }) } },
  { gameId: 'gs-market', title: 'Night Stall', logline: 'Run a market stall until dawn.', prompt: 'I want to run a night market stall and haggle with regulars.', mutate: (draft) => { (draft.capabilities as unknown[]).push({ id: 'economy-progression', config: {}, requirements: [] }) } },
  { gameId: 'gs-courier', title: 'Hill Runner', logline: 'Race deliveries through one hillside district.', prompt: 'Bicycle courier in a compact hillside district, deliveries against the clock.', mutate: (draft) => { (draft.capabilities as unknown[]).push({ id: 'hub-navigation-vehicle', config: {}, requirements: [] }); (draft.budgets as Record<string, unknown>).targetMinutes = 45 } },
  { gameId: 'gs-keeper', title: 'Last Light', logline: 'Keep a lighthouse and its town alive.', prompt: 'You inherit a lighthouse and the townsfolk each want something from you.', mutate: (draft) => { (draft.budgets as Record<string, unknown>).characterCount = 6; (draft.cast as unknown[]).push({ id: 'mayor', name: 'Mayor', role: 'quest-giver', description: 'Needs the light.' }) } },
  { gameId: 'gs-garden', title: 'Walled Green', logline: 'Restore a walled garden bed by bed.', prompt: 'A gentle game about restoring a walled garden, no combat at all please.', mutate: (draft) => { (draft.identity as Record<string, unknown>).themes = ['garden', 'restoration'] } },
  { gameId: 'gs-wraith', title: 'Friendly Haunt', logline: 'Befriend ghosts on an old street.', prompt: 'Spooky but kid-friendly: befriend the ghosts haunting one old street.', mutate: (draft) => { (draft.identity as Record<string, unknown>).themes = ['ghosts', 'friendship']; (draft.capabilities as unknown[]).push({ id: 'dialogue-quests', config: {}, requirements: [] }) } },
  { gameId: 'gs-diner', title: 'Blue Plate', logline: 'Cook for regulars and learn their stories.', prompt: 'Short-order cook sim with regulars who gossip; I want to learn their stories.', mutate: (draft) => { (draft.capabilities as unknown[]).push({ id: 'dialogue-quests', config: {}, requirements: [] }, { id: 'schedules-relationships', config: {}, requirements: [] }) } },
  { gameId: 'gs-relic', title: 'Dig Ledger', logline: 'Catalogue a desert dig and its one big find.', prompt: 'An archaeology dig in a desert outpost — brushes, ledgers, and one big find.', mutate: (draft) => { (draft.assets as unknown[]).push({ id: 'relic-model', kind: 'model', description: 'The big find.' }) } },
  { gameId: 'gs-signal', title: 'Open Line', logline: 'Take calls until a midnight mystery connects.', prompt: 'Late-night radio host taking calls that slowly connect into one mystery.', mutate: (draft) => { (draft.direction as Record<string, unknown>).audioStyle = 'lo-fi radio hum'; (draft.capabilities as unknown[]).push({ id: 'save-load', config: {}, requirements: [] }) } }
]

export const GAME_SPEC_PROMPTS: ReadonlyArray<{ gameId: string; prompt: string; draft: Draft }> = entries.map((entry) => ({
  gameId: entry.gameId,
  prompt: entry.prompt,
  draft: draftFor(entry)
}))
