// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { archetypeLibraryKind, parseData } from '@automata/engine'
import { physicsTuningKind, toPhysicsTuning } from '../../src/data/config'
import { levelKind } from '../../src/data/level'
import { createMonkeyBallDefinition } from '../../src/editor/registration'
import { createHeadlessMonkeyBallDefinition } from '../../src/editor/headlessRegistration'
import { readDataFile } from '../helpers/data'

const lib = parseData(archetypeLibraryKind, readDataFile('archetypes/standard.yaml'), 'standard.yaml')
const tuning = toPhysicsTuning(parseData(physicsTuningKind, readDataFile('config/physics.toml'), 'physics.toml'))
const level = parseData(levelKind, readDataFile('levels/w1-l1.json'), 'w1-l1.json')

describe('monkey-ball play registration', () => {
  it('exposes a headless runner through play', async () => {
    const def = createMonkeyBallDefinition(lib, tuning)

    expect(def.play).toBeDefined()
    const result = await def.play!.runHeadlessPlay(level, { maxSteps: 60 })
    expect(result.outcome).toBe('incomplete')
    expect(result.steps).toBe(60)
  })

  it('resolves supported surfaces and rejects texture surfaces', () => {
    const definition = createHeadlessMonkeyBallDefinition(lib, tuning)

    expect(definition.resolveSurface({ kind: 'color', value: '#123456' })).toEqual({ color: '#123456' })
    expect(() => definition.resolveSurface({ kind: 'texture', textureId: 'stone' })).toThrow(
      'unsupported surface kind texture'
    )
  })

  it('runs the headless-only definition without browser globals', async () => {
    expect('window' in globalThis).toBe(false)
    const definition = createHeadlessMonkeyBallDefinition(lib, tuning)

    await expect(definition.play!.runHeadlessPlay(level, { maxSteps: 1 })).resolves.toMatchObject({
      outcome: 'incomplete',
      steps: 1
    })
  })
})
