import { describe, expect, it } from 'vitest'
import { getWorkspacePrompt, workspacePromptDefs } from '../src'

describe('workspace prompts', () => {
  it('lists build-game with a required description argument', () => {
    expect(workspacePromptDefs()).toEqual([
      expect.objectContaining({
        name: 'build-game',
        arguments: [
          expect.objectContaining({ name: 'description', required: true }),
          expect.objectContaining({ name: 'name', required: false })
        ]
      })
    ])
  })

  it('expands a description into the full authoring workflow', () => {
    const result = getWorkspacePrompt('build-game', { description: 'a game about dodging meteors' })
    const text = result.messages[0]!.content.text
    expect(result.messages[0]!.role).toBe('user')
    expect(text).toContain('a game about dodging meteors')
    expect(text).toContain('createGame')
    expect(text).toContain('npm install')
    expect(text).toContain('--project games/')
    expect(text).toContain('evaluate')
    expect(text).toContain('npm run ci')
  })

  it('threads a chosen slug into the workflow', () => {
    const text = getWorkspacePrompt('build-game', { description: 'x', name: 'meteor-dodge' })
      .messages[0]!.content.text
    expect(text).toContain('meteor-dodge')
  })

  it('rejects unknown prompts and bad arguments', () => {
    expect(() => getWorkspacePrompt('nope', {})).toThrow(/unknown prompt/i)
    expect(() => getWorkspacePrompt('build-game', {})).toThrow()
    expect(() => getWorkspacePrompt('build-game', { description: 'x', name: 'Bad Name' })).toThrow()
  })
})
