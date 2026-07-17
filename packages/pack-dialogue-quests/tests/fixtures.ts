import type { DialogueQuestsPackConfig } from '../src/config'

/** Minimal internally consistent config; tests mutate copies to break one reference at a time. */
export function validConfig(): DialogueQuestsPackConfig {
  return {
    talkRadius: 2,
    npcs: [{ id: 'npc-1', name: 'Mara', position: { x: 5, z: 5 }, dialogueId: 'dlg-1' }],
    dialogues: [{
      id: 'dlg-1',
      start: 'greet',
      nodes: [
        {
          id: 'greet', speaker: 'Mara', text: 'Need a hand?',
          choices: [
            { text: 'Hand it over.', next: 'done', conditions: [{ kind: 'questState', questId: 'q-1', status: 'active' }, { kind: 'hasItems', itemIds: ['item-1'] }], effects: [{ kind: 'completeQuest', questId: 'q-1' }] },
            { text: 'I will help.', next: 'done', conditions: [{ kind: 'questState', questId: 'q-1', status: 'available' }], effects: [{ kind: 'acceptQuest', questId: 'q-1' }] },
            { text: 'Bye.', next: null }
          ]
        },
        { id: 'done', speaker: 'Mara', text: 'Thanks.', choices: [{ text: 'Bye.', next: null }] }
      ]
    }],
    quests: [{ id: 'q-1', kind: 'main', title: 'Fetch the relic', giverNpcId: 'npc-1', objective: { kind: 'fetch', itemIds: ['item-1'] } }]
  }
}
