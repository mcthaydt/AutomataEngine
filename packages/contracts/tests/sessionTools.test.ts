import { describe, expect, it } from 'vitest'
import { parseSessionToolArgs, sessionToolDefs } from '../src'

describe('session tools', () => {
  it('advertises the session and run tools with JSON schemas', () => {
    expect(sessionToolDefs().map((d) => d.name)).toEqual([
      'openProject', 'closeProject', 'sessionStatus', 'runBuild', 'runTests', 'browserSmoke'
    ])
    for (const def of sessionToolDefs()) expect(def.schema).toBeTypeOf('object')
  })

  it('parses openProject gameId and rejects a bad slug', () => {
    expect(parseSessionToolArgs('openProject', { gameId: 'beacon-run' })).toEqual({ gameId: 'beacon-run' })
    expect(() => parseSessionToolArgs('openProject', { gameId: 'Bad Name' })).toThrow()
  })

  it('accepts an optional force flag on run tools and rejects unknown tools', () => {
    expect(parseSessionToolArgs('runBuild', {})).toEqual({})
    expect(parseSessionToolArgs('runBuild', { force: true })).toEqual({ force: true })
    expect(() => parseSessionToolArgs('nope', {})).toThrow(/unknown session tool/i)
  })
})
