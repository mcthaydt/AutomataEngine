import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineKind, parseData, DataLoadError } from '../../src/data/registry'

const tuningKind = defineKind('tuning', 'toml', z.object({
  gravity: z.number(),
  ball: z.object({ radius: z.number().positive() })
}))

describe('parseData', () => {
  it('parses and validates into a typed value', () => {
    const result = parseData(tuningKind, 'gravity = 9.81\n[ball]\nradius = 0.5', 'physics.toml')
    expect(result).toEqual({ gravity: 9.81, ball: { radius: 0.5 } })
  })

  it('wraps syntax errors in DataLoadError with file and kind', () => {
    let caught: unknown
    try { parseData(tuningKind, '= broken =', 'physics.toml') } catch (e) { caught = e }
    expect(caught).toBeInstanceOf(DataLoadError)
    const err = caught as DataLoadError
    expect(err.file).toBe('physics.toml')
    expect(err.kind).toBe('tuning')
    expect(err.issues.length).toBeGreaterThan(0)
  })

  it('reports schema violations with dotted paths', () => {
    let caught: unknown
    try {
      parseData(tuningKind, 'gravity = 9.81\n[ball]\nradius = -1', 'physics.toml')
    } catch (e) { caught = e }
    const err = caught as DataLoadError
    expect(err).toBeInstanceOf(DataLoadError)
    expect(err.issues.some((issue) => issue.startsWith('ball.radius:'))).toBe(true)
    expect(err.message).toContain('physics.toml')
  })
})
