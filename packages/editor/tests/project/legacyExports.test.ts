import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as editorHeadless from '../../src/headless'

describe('legacy editor exports', () => {
  it('does not expose game-shaped editor contracts', () => {
    expect(editorHeadless).not.toHaveProperty('GameDefinition')
    expect(editorHeadless).not.toHaveProperty('SceneModel')

    const source = readFileSync(resolve(import.meta.dirname, '../../src/headless.ts'), 'utf8')
    expect(source).not.toMatch(/\b(?:GameDefinition|SceneModel)\b/)
  })
})
