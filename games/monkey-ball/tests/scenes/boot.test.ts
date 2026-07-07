import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createLoader, DataLoadError } from '@automata/engine'
import { describe, expect, it } from 'vitest'
import { loadBootData } from '../../src/scenes/boot'
import { fsFetchText } from '../helpers/data'

const projectRoot = resolve(import.meta.dirname, '../../public/project')

describe('loadBootData', () => {
  it('loads the project through ProjectFileReader and archetypes through DataLoader', async () => {
    const dataReads: string[] = []
    const projectReads: string[] = []
    const loader = createLoader(async (path) => {
      dataReads.push(path)
      return fsFetchText(path)
    })
    const data = await loadBootData(loader, {
      async readText(path) {
        projectReads.push(path)
        return readFile(resolve(projectRoot, path), 'utf8')
      }
    })

    expect(data.project.tuning.maxTiltRad).toBeGreaterThan(0)
    expect(Object.keys(data.lib)).toContain('ball')
    expect(data.project.manifest.worlds[0]!.id).toBe('w1')
    expect(dataReads).toEqual(['data/archetypes/standard.yaml'])
    expect(projectReads).toEqual([
      'automata.project.json',
      'scenes/w1-l1.scene.json', 'scenes/w1-l2.scene.json', 'scenes/w1-l3.scene.json',
      'scenes/w2-l1.scene.json', 'scenes/w2-l2.scene.json', 'scenes/w2-l3.scene.json',
      'resources/physics.resource.json', 'resources/worlds.resource.json'
    ])
    expect(dataReads).not.toContain('/data/config/physics.toml')
    expect(dataReads).not.toContain('/data/levels/worlds.json')
  })

  it('rejects with a DataLoadError when a file cannot be fetched', async () => {
    const loader = createLoader(async () => { throw new Error('404') })

    await expect(loadBootData(loader, {
      readText: (path) => readFile(resolve(projectRoot, path), 'utf8')
    })).rejects.toBeInstanceOf(DataLoadError)
  })
})
