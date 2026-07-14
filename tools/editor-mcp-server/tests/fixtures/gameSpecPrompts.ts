import { minimalGameSpecDraft } from '@automata/contracts'

type Draft = ReturnType<typeof minimalGameSpecDraft>
const prompts = [
  ['gs-heist', 'Small Takes', 'A cozy heist game where you case a tiny seaside town.'], ['gs-noir', 'Alley Rain', 'Make me something noir: rain and a missing cat.'], ['gs-market', 'Night Stall', 'Run a night market stall and haggle with regulars.'], ['gs-courier', 'Hill Runner', 'Bicycle courier in a compact hillside district.'], ['gs-keeper', 'Last Light', 'You inherit a lighthouse and the town needs you.'], ['gs-garden', 'Walled Green', 'Restore a walled garden, with no combat.'], ['gs-wraith', 'Friendly Haunt', 'Befriend ghosts haunting one old street.'], ['gs-diner', 'Blue Plate', 'Short-order cook sim with gossiping regulars.'], ['gs-relic', 'Dig Ledger', 'An archaeology dig in a desert outpost.'], ['gs-signal', 'Open Line', 'Late-night radio host connects a mystery.']
] as const

export const GAME_SPEC_PROMPTS: ReadonlyArray<{ gameId: string; prompt: string; draft: Draft }> = prompts.map(([gameId, title, prompt]) => {
  const draft = minimalGameSpecDraft(gameId); (draft.identity as Record<string, unknown>).title = title
  return { gameId, prompt, draft }
})
