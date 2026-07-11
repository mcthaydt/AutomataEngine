import { describe, expect, it } from 'vitest'
import * as project from '../../src/project'

describe('legacy surface is retired', () => {
  it('does not re-export the legacy importer symbols', () => {
    expect('importLegacyMonkeyBallProject' in project).toBe(false)
    expect('parseLegacyMonkeyBallLevel' in project).toBe(false)
  })
})
