import { describe, expect, it } from 'vitest'
import { parseSpecToolArgs, parseUnifiedToolArgs, specToolDefs } from '../src'

describe('spec tool contracts', () => {
  it('serves four tool defs; compileGameSpec carries the draft JSON schema', () => {
    const defs = specToolDefs()
    expect(defs.map((def) => def.name)).toEqual([
      'compileGameSpec', 'getGameSpec', 'renderDesignBrief', 'recordDesignDecision'
    ])
    const compile = defs.find((def) => def.name === 'compileGameSpec')!
    expect(compile.description).toContain('"identity"')
    expect(compile.description).toContain('"budgets"')
  })

  it('parses and defaults compileGameSpec args', () => {
    const parsed = parseSpecToolArgs('compileGameSpec', {
      gameId: 'probe', draft: { any: 'shape' }, prompt: 'make a game'
    }) as { translations: unknown[] }
    expect(parsed.translations).toEqual([])
    expect(() => parseSpecToolArgs('compileGameSpec', { gameId: 'probe' })).toThrow()
    expect(() => parseSpecToolArgs('recordDesignDecision', {
      gameId: 'probe', decision: 'maybe', reason: 'because'
    })).toThrow()
  })

  it('routes spec tools through the unified parser', () => {
    expect(parseUnifiedToolArgs('getGameSpec', { gameId: 'probe' })).toEqual({ gameId: 'probe' })
  })
})
