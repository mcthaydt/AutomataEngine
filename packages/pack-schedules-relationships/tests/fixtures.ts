import type { SchedulesRelationshipsPackConfig } from '../src/config'

/** Minimal internally consistent config; tests mutate copies to break one rule at a time. */
export function validConfig(): SchedulesRelationshipsPackConfig {
  return {
    slotSeconds: 20,
    walkers: [
      {
        id: 'walker-1', name: 'Stroller', speed: 2,
        stations: [{ x: 2, z: 2 }, { x: -3, z: 4 }, { x: 5, z: -2 }, { x: 0, z: 6 }]
      }
    ],
    relationships: {
      tracked: [{ npcId: 'npc-1', name: 'The Keeper', questIds: ['q-main-1'] }],
      thresholds: { acquaintance: 1, friend: 2 },
      gains: { questCompleted: 1 }
    }
  }
}
