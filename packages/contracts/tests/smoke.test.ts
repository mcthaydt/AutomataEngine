import { describe, it, expect } from 'vitest'
import { CONTRACTS_VERSION } from '../src/index'

describe('contracts package', () => {
  it('is importable', () => {
    expect(CONTRACTS_VERSION).toBe('0.1.0')
  })
})
