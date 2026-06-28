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
    expect(parsed).toEqual(snapshot)
  })

  it('rejects an invalid bundle without silently repairing it', () => {
    const broken = stringifyProjectBundle(toProjectBundle(sampleSnapshot())).replace('"formatVersion": 1', '"formatVersion": 2')
    expect(() => parseProjectBundle(broken)).toThrow()
  })
})
