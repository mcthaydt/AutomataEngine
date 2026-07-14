/** Minimal valid GameSpec draft for tests across packages; mutate copies to probe bounds. */
export function minimalGameSpecDraft(gameId = 'probe'): Record<string, unknown> {
  return {
    identity: {
      id: gameId, title: 'Probe', logline: 'A tiny hub adventure.',
      themes: ['exploration'], contentRating: 'everyone'
    },
    direction: {
      visualStyle: 'stylized low-poly', audioStyle: 'ambient synth',
      dialogueTone: 'warm', camera: 'third-person-follow'
    },
    budgets: {
      targetMinutes: 60, districtCount: 1, interiorCount: 2, characterCount: 4,
      mainQuestCount: 2, sideQuestCount: 1, enemyTypeCount: 0, assetBudget: 10,
      buildTimeMinutes: 60
    },
    capabilities: [{ id: 'interaction-inventory', config: {}, requirements: [] }],
    world: {
      locations: [
        { id: 'hub', name: 'Hub', kind: 'district', description: 'The district.' },
        { id: 'shop', name: 'Shop', kind: 'interior', description: 'A shop.' }
      ]
    },
    cast: [{ id: 'player', name: 'Player', role: 'player', description: 'You.' }],
    story: {
      premise: 'Find the beacon.',
      beats: [
        { id: 'b1', kind: 'beginning', summary: 'Arrive.' },
        { id: 'b2', kind: 'ending', summary: 'Light the beacon.' }
      ],
      quests: [
        { id: 'q1', kind: 'main', summary: 'Reach the shop.' },
        { id: 'q2', kind: 'main', summary: 'Light the beacon.' },
        { id: 'q3', kind: 'side', summary: 'Help the shopkeeper.' }
      ]
    },
    progression: { milestones: [{ id: 'm1', summary: 'Reach the shop.' }] },
    assets: [{ id: 'beacon-model', kind: 'model', description: 'The beacon.' }],
    acceptance: [{
      id: 'a1', description: 'Player can reach the ending beat.',
      kind: 'structural', target: 'story.beats:ending-reachable'
    }]
  }
}
