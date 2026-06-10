import { describe, expect, it } from 'vitest'
import { parseByFormat, ParseError } from '../../src/data/parsers'

describe('parseByFormat', () => {
  it('parses TOML', () => {
    expect(parseByFormat('toml', 'max-tilt-deg = 12.0\n[ball]\nradius = 0.5'))
      .toEqual({ 'max-tilt-deg': 12, ball: { radius: 0.5 } })
  })

  it('parses YAML', () => {
    expect(parseByFormat('yaml', 'banana:\n  collectible: { value: 1 }'))
      .toEqual({ banana: { collectible: { value: 1 } } })
  })

  it('parses JSON', () => {
    expect(parseByFormat('json', '{ "id": "w1-l1" }')).toEqual({ id: 'w1-l1' })
  })

  it('throws ParseError with the format and underlying message on bad input', () => {
    for (const format of ['toml', 'yaml', 'json'] as const) {
      let caught: unknown
      try { parseByFormat(format, '{{{{not valid in any format::::') } catch (e) { caught = e }
      expect(caught).toBeInstanceOf(ParseError)
      expect((caught as ParseError).format).toBe(format)
      expect((caught as ParseError).message.length).toBeGreaterThan(0)
    }
  })
})
