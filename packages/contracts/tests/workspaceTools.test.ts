import { describe, expect, it } from 'vitest'
import { parseWorkspaceToolArgs, workspaceToolDefs } from '../src/workspaceTools'

describe('workspace tool contracts', () => {
  it('advertises createGame and listGames with JSON schemas', () => {
    const defs = workspaceToolDefs()
    expect(defs.map((def) => def.name)).toEqual(['createGame', 'listGames'])
    for (const def of defs) {
      expect(def.description.length).toBeGreaterThan(0)
      expect(def.schema).toMatchObject({ type: 'object' })
    }
  })

  it('accepts a valid createGame request with an optional port', () => {
    expect(parseWorkspaceToolArgs('createGame', { name: 'beacon-run' })).toEqual({ name: 'beacon-run' })
    expect(parseWorkspaceToolArgs('createGame', { name: 'x1', port: 5190 })).toEqual({ name: 'x1', port: 5190 })
    expect(parseWorkspaceToolArgs('listGames', {})).toEqual({})
  })

  it('rejects malformed slugs, ports, and unknown tools', () => {
    expect(() => parseWorkspaceToolArgs('createGame', { name: 'Bad Name' })).toThrow()
    expect(() => parseWorkspaceToolArgs('createGame', { name: '../escape' })).toThrow()
    expect(() => parseWorkspaceToolArgs('createGame', { name: 'ok', port: 0 })).toThrow()
    expect(() => parseWorkspaceToolArgs('createGame', { name: 'ok', port: 65_536 })).toThrow()
    expect(() => parseWorkspaceToolArgs('nope', {})).toThrow(/unknown workspace tool/i)
  })
})
