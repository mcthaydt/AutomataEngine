import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

describe('scaffold Node entry graph', () => {
  it('loads through the Node ESM TypeScript loader without Vitest resolution', () => {
    const writeModule = new URL('../src/write.ts', import.meta.url).href
    const result = spawnSync(
      process.execPath,
      ['--input-type=module', '--eval', `await import(${JSON.stringify(writeModule)})`],
      { encoding: 'utf8' }
    )

    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
  })
})
