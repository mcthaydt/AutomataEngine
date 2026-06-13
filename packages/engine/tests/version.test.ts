import { describe, expect, it } from 'vitest'
import { ENGINE_VERSION } from '../src/index'

describe('engine package', () => {
  it('exports a semver-ish version string', () => {
    expect(ENGINE_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })
})
