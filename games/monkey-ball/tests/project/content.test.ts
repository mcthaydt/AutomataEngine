// @vitest-environment node
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { archetypeLibraryKind, parseData } from '@automata/engine'
import { loadProjectFiles, stringifyProjectBundle, toProjectBundle, validateProject } from '@automata/project'
import { physicsTuningKind, toPhysicsTuning } from '../../src/project/legacyTypes'
import { levelKind, worldsManifestKind, type Level } from '../../src/project/legacyTypes'
import { runHeadlessPlay } from '../../src/level/headlessPlay'
import { monkeyBallProjectDefinition } from '../../src/project/definition'
import { importLegacyMonkeyBallProject } from '../../src/project/legacyImporter'
import { readDataFile } from '../helpers/data'
import baseline from '../fixtures/metric-baselines.json'

const projectRoot = resolve(import.meta.dirname, '../../public/project')
const reader = { readText: (path: string) => readFile(resolve(projectRoot, path), 'utf8') }
const loadSnapshot = async () => (await loadProjectFiles(reader)).snapshot
const lib = parseData(archetypeLibraryKind, readDataFile('archetypes/standard.yaml'), 'standard.yaml')

function legacySnapshot() {
  const tuning = toPhysicsTuning(parseData(physicsTuningKind, readDataFile('config/physics.toml'), 'physics.toml'))
  const manifest = parseData(worldsManifestKind, readDataFile('levels/worlds.json'), 'worlds.json')
  const levels = Object.fromEntries(manifest.worlds.flatMap((world) => world.levels).map((id) => [
    id,
    parseData(levelKind, readDataFile(`levels/${id}.json`), `${id}.json`)
  ])) as Record<string, Level>
  return importLegacyMonkeyBallProject({ tuning, manifest, levels })
}

describe('Monkey Ball project content', () => {
  it('loads as a valid project and exactly matches a fresh legacy import', async () => {
    const shipped = await loadSnapshot()
    expect(validateProject(monkeyBallProjectDefinition, shipped)).toEqual([])
    expect(stringifyProjectBundle(toProjectBundle(shipped))).toBe(
      stringifyProjectBundle(toProjectBundle(legacySnapshot()))
    )
  })

  it('rejects a physics max tilt beyond the 45° clamp', async () => {
    const snapshot = await loadSnapshot()
    ;(snapshot.resources.physics!.data as { maxTiltRad: number }).maxTiltRad = Math.PI / 2
    expect(validateProject(monkeyBallProjectDefinition, snapshot).map((issue) => issue.code)).toContain('number.max')
  })

  it('compiles all six scenes and retains every no-input metric baseline', async () => {
    const compiled = monkeyBallProjectDefinition.compile(await loadSnapshot())
    const ids = compiled.manifest.worlds.flatMap((world) => world.levels)
    expect(ids).toEqual(['w1-l1', 'w1-l2', 'w1-l3', 'w2-l1', 'w2-l2', 'w2-l3'])

    for (const id of ids) {
      const result = await runHeadlessPlay(compiled.levels[id]!, lib, compiled.tuning, { maxSteps: baseline.restSteps })
      expect(result).toMatchObject({
        outcome: baseline.restOutcome,
        fallCount: baseline.restFallCount,
        steps: baseline.restSteps
      })
    }
  }, 60000)
})
