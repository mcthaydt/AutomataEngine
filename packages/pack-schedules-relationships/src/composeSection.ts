import type { SeededRng } from '@automata/engine'
import {
  SLOT_COUNT, packConfigSchema,
  type SchedulesRelationshipsPackConfig, type TrackedRelationship, type WalkerDef
} from './config'

export const SCHEDULE_DEFAULTS = { slotSeconds: 20, walkerSpeed: 2 } as const

export interface SchedulesComposeInput {
  specConfig: { slotSeconds?: number }
  cast: ReadonlyArray<{ id: string; name: string; role: string }>
  arena: { half: number; spawn: { x: number; z: number }; goal: { x: number; z: number } }
  inventory: { items: ReadonlyArray<{ id: string; position: { x: number; z: number } }> }
  dialogue: {
    npcs: ReadonlyArray<{ id: string; name: string; position: { x: number; z: number } }>
    quests: ReadonlyArray<{ id: string; kind: 'main' | 'side'; giverNpcId: string }>
  }
}

const WALL_MARGIN = 1
const KEEPOUT = 3
const SEPARATION = 2
const DRAW_BUDGET = 200

const round2 = (value: number): number => Math.round(value * 100) / 100
const far = (a: { x: number; z: number }, b: { x: number; z: number }, min: number): boolean =>
  Math.hypot(a.x - b.x, a.z - b.z) >= min

/** Seeded walker stations + tracked quest-givers; defaults deliberately live outside GameSpec. */
export function composeSchedulesSection(input: SchedulesComposeInput, rng: SeededRng): SchedulesRelationshipsPackConfig {
  const slotSeconds = input.specConfig.slotSeconds ?? SCHEDULE_DEFAULTS.slotSeconds
  const ambient = input.cast.filter((member) => member.role === 'ambient')
  const extent = input.arena.half - WALL_MARGIN
  const hardKeepouts = [input.arena.spawn, input.arena.goal]
  const softKeepouts = [
    ...input.inventory.items.map((item) => item.position),
    ...input.dialogue.npcs.map((npc) => npc.position)
  ]
  const placedPerSlot: Array<Array<{ x: number; z: number }>> = Array.from({ length: SLOT_COUNT }, () => [])

  const walkers: WalkerDef[] = ambient.map((member, index) => {
    const stations: Array<{ x: number; z: number }> = []
    for (let slot = 0; slot < SLOT_COUNT; slot += 1) {
      let station: { x: number; z: number } | null = null
      for (let draw = 0; draw < DRAW_BUDGET && !station; draw += 1) {
        const candidate = {
          x: round2((rng.next() * 2 - 1) * extent),
          z: round2((rng.next() * 2 - 1) * extent)
        }
        if (!hardKeepouts.every((point) => far(candidate, point, KEEPOUT))) continue
        if (!softKeepouts.every((point) => far(candidate, point, SEPARATION))) continue
        if (!placedPerSlot[slot]!.every((other) => far(candidate, other, SEPARATION))) continue
        station = candidate
      }
      if (!station) throw new Error(`Walker station placement budget exhausted: walker ${index + 1}, slot ${slot}`)
      placedPerSlot[slot]!.push(station)
      stations.push(station)
    }
    return { id: `walker-${index + 1}`, name: member.name, speed: SCHEDULE_DEFAULTS.walkerSpeed, stations }
  })

  // Distinct main-quest givers in first-appearance order; side quests are intentionally untracked.
  const tracked: TrackedRelationship[] = []
  for (const quest of input.dialogue.quests) {
    if (quest.kind !== 'main') continue
    const existing = tracked.find((entry) => entry.npcId === quest.giverNpcId)
    if (existing) {
      existing.questIds.push(quest.id)
      continue
    }
    const npc = input.dialogue.npcs.find((entry) => entry.id === quest.giverNpcId)
    if (!npc) throw new Error(`composeSchedulesSection: main quest "${quest.id}" giver "${quest.giverNpcId}" not in dialogue npcs`)
    tracked.push({ npcId: npc.id, name: npc.name, questIds: [quest.id] })
  }

  return packConfigSchema.parse({
    slotSeconds,
    walkers,
    relationships: {
      tracked,
      thresholds: { acquaintance: 1, friend: 2 },
      gains: { questCompleted: 1 }
    }
  })
}
