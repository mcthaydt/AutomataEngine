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

/** The Phase 3 vertical-slice game: relight the beacon by gathering its light cells. */
export function firstLightGameSpecDraft(): Record<string, unknown> {
  return {
    identity: { id: 'first-light', title: 'First Light', logline: 'Relight the harbor beacon by gathering its scattered light cells.', themes: ['exploration', 'restoration'], contentRating: 'everyone' },
    direction: { visualStyle: 'stylized low-poly night harbor', audioStyle: 'calm ambient synth', dialogueTone: 'quiet and hopeful', camera: 'fixed' },
    budgets: { targetMinutes: 30, districtCount: 1, interiorCount: 0, characterCount: 1, mainQuestCount: 2, sideQuestCount: 0, enemyTypeCount: 0, assetBudget: 1, buildTimeMinutes: 30 },
    capabilities: [{ id: 'interaction-inventory', config: { requiredItems: 2, interactRadius: 1.5 }, requirements: ['collect both light cells before the beacon counts'] }],
    world: { locations: [{ id: 'harbor', name: 'Harbor', kind: 'district', description: 'A small dark harbor arena lit only by the dormant beacon.' }] },
    cast: [{ id: 'player', name: 'The Keeper', role: 'player', description: 'The lighthouse keeper.' }],
    story: {
      premise: 'The beacon went dark; its two light cells are scattered across the harbor.',
      beats: [{ id: 'b-begin', kind: 'beginning', summary: 'The keeper arrives at the dark harbor.' }, { id: 'b-end', kind: 'ending', summary: 'With both cells recovered, the beacon relights.' }],
      quests: [{ id: 'q-cells', kind: 'main', summary: 'Gather the two scattered light cells.' }, { id: 'q-beacon', kind: 'main', summary: 'Return to the beacon and relight it.' }]
    },
    progression: { milestones: [{ id: 'm-first-cell', summary: 'First light cell recovered.' }, { id: 'm-relit', summary: 'Beacon relit.' }] },
    assets: [{ id: 'item-icon', kind: 'ui', description: 'Light-cell icon for the inventory HUD.' }],
    acceptance: [
      { id: 'a-structural', description: 'The spec validates against the supported envelope.', kind: 'structural', target: 'spec:valid' },
      { id: 'a-sim', description: 'Deterministic automation collects both cells then reaches the beacon.', kind: 'simulation', target: 'evaluate:critical-path' },
      { id: 'a-browser', description: 'The game boots clean and holds frame budget in the browser.', kind: 'browser', target: 'e2e:boot-console-frametime' },
      { id: 'a-manual', description: 'A human approves the playable slice.', kind: 'manual', target: 'checkpoint:slice' }
    ]
  }
}
