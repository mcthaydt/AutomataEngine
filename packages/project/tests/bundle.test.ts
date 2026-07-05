import { describe, expect, it } from 'vitest'
import { toProjectBundle, stringifyProjectBundle, parseProjectBundle } from '../src'
import { sampleSnapshot } from './fixtures/sampleProject'

describe('project bundle', () => {
  it('sorts scenes/resources/entities/components by stable ID without mutating input', () => {
    const snapshot = sampleSnapshot()
    // Insert an out-of-order entity and a second scene to observe canonical sorting.
    snapshot.scenes.main!.entities.unshift({ id: 'aaa', name: 'A', enabled: true, components: [] })
    const before = JSON.stringify(snapshot)

    const bundle = toProjectBundle(snapshot)
    expect(bundle.scenes.map((scene) => scene.id)).toEqual(['main'])
    expect(bundle.scenes[0]!.entities.map((entity) => entity.id)).toEqual(['aaa', 'root', 'spawn'])
    expect(bundle.resources.map((resource) => resource.id)).toEqual(['tuning'])
    // Input untouched.
    expect(JSON.stringify(snapshot)).toBe(before)
  })

  it('serializes with two-space JSON and a trailing newline', () => {
    const text = stringifyProjectBundle(toProjectBundle(sampleSnapshot()))
    expect(text.endsWith('}\n')).toBe(true)
    expect(text).toContain('\n  "manifest"')
  })

  it('round-trips a snapshot through stringify/parse', () => {
    const snapshot = sampleSnapshot()
    const parsed = parseProjectBundle(stringifyProjectBundle(toProjectBundle(snapshot)))
    expect(parsed.snapshot).toEqual(snapshot)
    expect(parsed.fromVersion).toBe(2)
  })

  it('rejects a future manifest formatVersion and non-bundle shapes', () => {
    const bundle = toProjectBundle(sampleSnapshot())
    const future = { ...bundle, manifest: { ...bundle.manifest, formatVersion: 99 } }
    expect(() => parseProjectBundle(JSON.stringify(future))).toThrow(/newer than this build supports/i)
    expect(() => parseProjectBundle('42')).toThrow(/not a project bundle/i)
    expect(() => parseProjectBundle('{"manifest":{}}')).toThrow(/not a project bundle/i)
  })

  it('rejects duplicate ids instead of silently last-winning', () => {
    const bundle = toProjectBundle(sampleSnapshot())
    const dup = { ...bundle, scenes: [...bundle.scenes, structuredClone(bundle.scenes[0]!)] }
    expect(() => parseProjectBundle(JSON.stringify(dup))).toThrow(/duplicate scene id/i)
  })
})
