import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as contracts from '../src/index'

describe('contracts package', () => {
  it('is importable', () => {
    expect(contracts.CONTRACTS_VERSION).toBe('0.1.0')
  })

  it('has no legacy level-shaped exports', () => {
    expect(contracts).not.toHaveProperty('SceneCommand')
    expect(contracts).not.toHaveProperty('TestPlayResult')

    const source = readFileSync(resolve(import.meta.dirname, '../src/index.ts'), 'utf8')
    expect(source).not.toMatch(/\.\/project(?:Command|Eval|Tools)'/)
  })
})
