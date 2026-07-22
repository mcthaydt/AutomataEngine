import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

const repoRoot = existsSync(resolve(process.cwd(), 'packages/pack-combat-ai/package.json'))
  ? process.cwd()
  : resolve(process.cwd(), '../..')

describe('combat-ai workspace integration', () => {
  it('participates in workspace test and typecheck commands', () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(repoRoot, 'packages/pack-combat-ai/package.json'), 'utf8')
    ) as { scripts?: Record<string, string> }

    expect(packageJson.scripts).toMatchObject({
      test: 'vitest run',
      typecheck: 'tsc --noEmit'
    })
  })

  it('inherits reusable-pack import-boundary lint rules', async () => {
    const eslint = new ESLint({ cwd: repoRoot })
    const config = await eslint.calculateConfigForFile('packages/pack-combat-ai/src/config.ts')
    const rule = config?.rules?.['no-restricted-imports']

    expect(rule?.[0]).toBe(2)
    expect(JSON.stringify(rule)).toContain('zod')
    expect(JSON.stringify(rule)).toContain('@automata/editor')
  })
})
