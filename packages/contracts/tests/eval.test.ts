import { describe, it, expect } from 'vitest'
import { testPlayResultSchema, type TestPlayResult } from '../src/eval'

describe('testPlayResultSchema', () => {
  it('parses the no-input rest baseline result', () => {
    const r: TestPlayResult = { outcome: 'incomplete', timeMs: 0, fallCount: 0, bananas: 0, steps: 180 }
    expect(testPlayResultSchema.parse(r)).toEqual(r)
  })

  it('rejects an invalid outcome', () => {
    expect(() =>
      testPlayResultSchema.parse({ outcome: 'won', timeMs: 0, fallCount: 0, bananas: 0, steps: 0 })
    ).toThrow()
  })
})
