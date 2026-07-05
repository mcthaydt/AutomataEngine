import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { color, defineGameProject } from '../src'
import type { ProjectSnapshot } from '../src'
import { sampleDefinitionInput } from './fixtures/sampleProject'

const stats = z.strictObject({
  speed: z.number().min(0).max(20).meta({ label: 'Speed', step: 0.5 }),
  mode: z.enum(['chase', 'kite']).meta({ label: 'Mode' }),
  tint: color({ label: 'Tint' })
})

const goodComponent = {
  typeId: 'fake.stats', label: 'Stats', schema: stats,
  defaultData: { speed: 1, mode: 'chase', tint: '#fff' }, cardinality: { min: 0, max: 1 }
}

function makeTemplate(): ProjectSnapshot {
  return {
    manifest: { formatVersion: 1, id: 'fake', name: 'Fake', gameId: 'fake', entrySceneId: 'main', scenes: [], resources: [] },
    scenes: {}, resources: {}
  }
}

describe('defineGameProject', () => {
  it('rejects duplicate type ids and invalid defaults at registration time', () => {
    expect(() => defineGameProject({
      gameId: 'fake', label: 'Fake', createTemplate: () => ({} as never),
      components: [
        { typeId: 'fake.stats', label: 'Stats', schema: stats, defaultData: { speed: -1, mode: 'chase', tint: '#fff' }, cardinality: { min: 0, max: 1 } },
        { typeId: 'fake.stats', label: 'Duplicate', schema: stats, defaultData: { speed: 1, mode: 'chase', tint: '#fff' }, cardinality: { min: 0, max: 1 } }
      ],
      resources: [], validate: () => [], compile: () => ({})
    })).toThrow(/duplicate|default/i)
  })

  it('rejects invalid cardinality', () => {
    expect(() => defineGameProject({
      gameId: 'fake', label: 'Fake', createTemplate: makeTemplate,
      components: [{ ...goodComponent, cardinality: { min: 2, max: 1 } }],
      resources: [], validate: () => [], compile: () => ({})
    })).toThrow(/cardinality/i)
  })

  it('preserves an authored migrate hook', () => {
    const migrate = (snapshot: ProjectSnapshot) => snapshot
    const definition = defineGameProject({ ...sampleDefinitionInput, migrate })
    expect(definition.migrate).toBe(migrate)
  })

  it('rejects a template whose gameId does not match', () => {
    expect(() => defineGameProject({
      gameId: 'fake', label: 'Fake',
      createTemplate: () => ({ ...makeTemplate(), manifest: { ...makeTemplate().manifest, gameId: 'other' } }),
      components: [goodComponent], resources: [], validate: () => [], compile: () => ({})
    })).toThrow(/gameId/i)
  })

  it('returns a usable definition for a well-formed registration', () => {
    const def = defineGameProject({
      gameId: 'fake', label: 'Fake', createTemplate: makeTemplate,
      components: [goodComponent],
      resources: [{ typeId: 'fake.tuning', label: 'Tuning', schema: stats, defaultData: { speed: 2, mode: 'kite', tint: '#000' }, singleton: true }],
      validate: () => [], compile: (snapshot) => ({ id: snapshot.manifest.id })
    })
    expect(def.gameId).toBe('fake')
    expect(def.components.map((c) => c.typeId)).toEqual(['fake.stats'])
    expect(def.compile(makeTemplate())).toEqual({ id: 'fake' })
  })

  it('derives the IR, keeps the zod source, and emits a JSON schema', () => {
    const def = defineGameProject({
      gameId: 'fake', label: 'Fake', createTemplate: makeTemplate,
      components: [goodComponent],
      resources: [], validate: () => [], compile: () => ({})
    })
    const spec = def.components[0]!
    expect(spec.schema).toMatchObject({
      kind: 'object',
      fields: [
        expect.objectContaining({ kind: 'number', key: 'speed', min: 0, max: 20, step: 0.5 }),
        expect.objectContaining({ kind: 'enum', key: 'mode', values: ['chase', 'kite'] }),
        expect.objectContaining({ kind: 'color', key: 'tint' })
      ]
    })
    expect(spec.dataSchema).toBe(stats)
    expect(spec.jsonSchema).toMatchObject({ type: 'object', additionalProperties: false })
  })
})
