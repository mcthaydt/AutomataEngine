import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { gameSpecSchema, parseCompositionManifest } from '@automata/contracts'
import { composeGame } from '@automata/game-compose'

const gameRoot = resolve(import.meta.dirname, '../..')
const read = (path: string) => readFile(resolve(gameRoot, path), 'utf8')

describe('compose parity', () => {
  it('checked-in composed files reproduce byte-for-byte from the recorded seed', async () => {
    const spec = gameSpecSchema.parse(JSON.parse(await read('gamespec.json')))
    const composition = parseCompositionManifest(await read('public/project/composition.json'))
    expect(composition.source).not.toBeNull()
    const result = composeGame({ spec, seed: composition.source!.seed, specHash: composition.source!.specHash })
    if (!result.ok) throw new Error('compose must succeed for the checked-in spec')
    for (const file of result.files) expect(await read(file.path), file.path).toBe(file.text)
  })
})
