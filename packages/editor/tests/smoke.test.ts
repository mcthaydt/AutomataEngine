import { describe, expect, it } from 'vitest'
import { EDITOR_VERSION } from '../src/index'

describe('editor package', () => {
  it('exports its version', () => {
    expect(EDITOR_VERSION).toBe('0.1.0')
  })
})
