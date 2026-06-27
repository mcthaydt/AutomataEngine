import { describe, it, expect } from 'vitest'
import { AGENT_CORE_VERSION } from '../src/index'

describe('agent-core package', () => {
  it('is importable', () => {
    expect(AGENT_CORE_VERSION).toBe('0.1.0')
  })
})
