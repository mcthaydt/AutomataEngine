import { readFileSync, readdirSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const editorSource = resolve(import.meta.dirname, '../../../packages/editor/src')
const forbidden = /\b(?:monkey-ball|pulsebreak|GameDefinition|SceneModel|SceneCommand)\b/

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return extname(path) === '.ts' ? [path] : []
  })
}

describe('shared editor boundary', () => {
  it('contains no legacy or game-specific source dependencies', () => {
    const violations = sourceFiles(editorSource).flatMap((file) =>
      readFileSync(file, 'utf8').split('\n').flatMap((line, index) =>
        forbidden.test(line) && !line.toLowerCase().includes('migration')
          ? [`${file}:${index + 1}: ${line.trim()}`]
          : []
      )
    )
    expect(violations).toEqual([])
  })
})
