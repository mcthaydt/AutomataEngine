import { createLoader, DataLoadError } from '@automata/engine'
import { describe, expect, it } from 'vitest'
import { loadBootData } from '../../src/scenes/boot'
import { fsFetchText } from '../helpers/data'

describe('loadBootData', () => {
  it('loads tuning, archetypes, and the worlds manifest from shipped files', async () => {
    const data = await loadBootData(createLoader(fsFetchText))

    expect(data.tuning.maxTiltRad).toBeGreaterThan(0)
    expect(Object.keys(data.lib)).toContain('ball')
    expect(data.manifest.worlds[0]!.id).toBe('w1')
  })

  it('rejects with a DataLoadError when a file cannot be fetched', async () => {
    const loader = createLoader(async () => { throw new Error('404') })

    await expect(loadBootData(loader)).rejects.toBeInstanceOf(DataLoadError)
  })
})
