import { describe, expect, it } from 'vitest'
import { gameIdFromEntryModule, publicReadPath } from '../src/projectCatalog'

describe('gameIdFromEntryModule', () => {
  it('extracts the game id from a discovered editor entry path', () => {
    expect(gameIdFromEntryModule('../../../games/pulsebreak/src/project/editor.ts')).toBe('pulsebreak')
    expect(gameIdFromEntryModule('../../../games/monkey-ball/src/project/editor.ts')).toBe('monkey-ball')
  })

  it('throws on a path without a games/<id> segment', () => {
    expect(() => gameIdFromEntryModule('../nope/editor.ts')).toThrow()
  })
})

describe('publicReadPath', () => {
  it('scopes a public-relative read to the game and matches the dev middleware contract', () => {
    expect(publicReadPath('pulsebreak', 'data/archetypes/standard.yaml'))
      .toBe('/games/pulsebreak/public/data/archetypes/standard.yaml')
    // Must satisfy resolveGameAssetPath's `/games/<id>/public/<rest>` shape.
    expect(publicReadPath('monkey-ball', 'project/automata.project.json'))
      .toMatch(/^\/games\/monkey-ball\/public\//)
  })
})
