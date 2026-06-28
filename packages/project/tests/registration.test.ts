import { describe, expect, it } from 'vitest'
import { defineGameProject } from '../src'
import type { ObjectSchema, ProjectSnapshot } from '../src'

const stats = {
  kind: 'object',
  fields: [
    { key: 'speed', label: 'Speed', kind: 'number', required: true, min: 0, max: 20, step: 0.5 },
    { key: 'mode', label: 'Mode', kind: 'enum', required: true, values: ['chase', 'kite'] },
    { key: 'tint', label: 'Tint', kind: 'color', required: true }
  ]
} as const satisfies ObjectSchema

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
})
