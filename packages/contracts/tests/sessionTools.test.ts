import { describe, expect, it } from 'vitest'
import { getWorkspacePrompt } from '../src/prompts'
import {
  parseUnifiedToolArgs, sessionToolDefs, splitClientStepId
} from '../src/sessionTools'

describe('session tools', () => {
  it('advertises the seven session tools with JSON schemas', () => {
    expect(sessionToolDefs().map((def) => def.name)).toEqual([
      'openProject', 'getSession', 'setResumePoint', 'runBuild', 'runTests', 'runBrowserEval', 'changedFiles'
    ])
    for (const def of sessionToolDefs()) expect(def.schema).toBeTruthy()
  })

  it('routes unified parsing across workspace, session, and project tools', () => {
    expect(parseUnifiedToolArgs('listGames', {})).toEqual({})
    expect(parseUnifiedToolArgs('openProject', { gameId: 'probe' })).toEqual({ gameId: 'probe' })
    expect(parseUnifiedToolArgs('runBuild', { gameId: 'probe' })).toEqual({ gameId: 'probe' })
    expect(parseUnifiedToolArgs('runBuild', {})).toEqual({})
    expect(() => parseUnifiedToolArgs('openProject', { gameId: 'NOT A SLUG' })).toThrow()
    expect(() => parseUnifiedToolArgs('definitely-not-a-tool', {})).toThrow(/unknown/i)
    expect(parseUnifiedToolArgs('getHierarchy', {})).toEqual({})
  })

  it('strips clientStepId from write-tool args before project validation', () => {
    const args = { sceneId: 's', entity: { id: 'e', name: 'E', enabled: true, components: [] }, clientStepId: 'c-1' }
    expect(splitClientStepId(args)).toEqual({ clientStepId: 'c-1', rest: { sceneId: args.sceneId, entity: args.entity } })
    expect(() => parseUnifiedToolArgs('addEntity', args)).not.toThrow()
  })

  it('build-game prompt steers to openProject instead of --project reconnect', () => {
    const text = getWorkspacePrompt('build-game', { description: 'a racing game', name: 'race' })
      .messages[0]!.content.text
    expect(text).toContain('openProject')
    expect(text).not.toContain('--project')
  })
})
