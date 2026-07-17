import { describe, expect, it } from 'vitest'
import { createNullRenderer } from '@automata/engine'
import { validConfig } from './fixtures'
import { dialogueQuestsEditorContribution } from '../src/editorContribution'

describe('dialogue-quests editor contribution', () => {
  it('ships no prefabs (NPCs are composition-owned) and previews NPC markers', () => {
    expect(dialogueQuestsEditorContribution.prefabs).toEqual([])
    const render = createNullRenderer()
    const handle = dialogueQuestsEditorContribution.createPreview!(validConfig(), render.port)
    expect(render.port.objectCount).toBe(1)
    handle.dispose()
    expect(render.port.objectCount).toBe(0)
  })

  it('rejects malformed config', () => {
    const render = createNullRenderer()
    expect(() => dialogueQuestsEditorContribution.createPreview!({ nope: true }, render.port)).toThrow()
  })
})
