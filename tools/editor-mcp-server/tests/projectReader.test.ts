// @vitest-environment node
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createProjectDirectoryReader } from '../src/projectReader'

describe('project directory reader', () => {
  let dir: string
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'project-reader-'))
    await writeFile(join(dir, '..icon.png'), 'ok')
  })
  afterAll(async () => { await rm(dir, { recursive: true, force: true }) })

  it('reads an in-root file whose name merely starts with dots', async () => {
    const reader = createProjectDirectoryReader(dir)
    await expect(reader.readText('..icon.png')).resolves.toBe('ok')
  })

  it('rejects a path that escapes the project root', async () => {
    const reader = createProjectDirectoryReader(dir)
    await expect(reader.readText('../secret')).rejects.toThrow(/outside project root/)
  })
})
