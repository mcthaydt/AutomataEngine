import { describe, expect, it, vi } from 'vitest'
import { applyGameMigration, parseProjectBundle, parseProjectSnapshot, PROJECT_FORMAT_VERSION } from '../src'
import type { RawProjectDocuments } from '../src'
import { sampleSnapshot } from './fixtures/sampleProject'
import { v1BundleText, v1RawDocuments } from './fixtures/v1Project'

/** Explode a snapshot into the raw pre-validation shape the pipeline consumes. */
function rawDocs(): RawProjectDocuments {
  const snapshot = structuredClone(sampleSnapshot())
  return {
    manifest: snapshot.manifest,
    scenes: Object.values(snapshot.scenes),
    resources: Object.values(snapshot.resources)
  }
}

describe('parseProjectSnapshot', () => {
  it('parses current-version documents and reports fromVersion', () => {
    const parsed = parseProjectSnapshot(rawDocs())
    expect(parsed.snapshot).toEqual(sampleSnapshot())
    expect(parsed.fromVersion).toBe(PROJECT_FORMAT_VERSION)
  })

  it('rejects a missing or non-positive-integer formatVersion', () => {
    for (const bad of [undefined, '1', 1.5, 0, -1, null]) {
      const docs = rawDocs()
      ;(docs.manifest as Record<string, unknown>).formatVersion = bad
      expect(() => parseProjectSnapshot(docs)).toThrow(/not a versioned automata project/i)
    }
  })

  it('rejects a future formatVersion with an update-the-engine error', () => {
    const docs = rawDocs()
    ;(docs.manifest as Record<string, unknown>).formatVersion = PROJECT_FORMAT_VERSION + 1
    expect(() => parseProjectSnapshot(docs)).toThrow(/newer than this build supports/i)
  })

  it('rejects duplicate scene and resource ids', () => {
    const dupScene = rawDocs()
    dupScene.scenes.push(structuredClone(dupScene.scenes[0]))
    expect(() => parseProjectSnapshot(dupScene)).toThrow(/duplicate scene id "main"/i)

    const dupResource = rawDocs()
    dupResource.resources.push(structuredClone(dupResource.resources[0]))
    expect(() => parseProjectSnapshot(dupResource)).toThrow(/duplicate resource id "tuning"/i)
  })

  it('rejects manifest/document set mismatches', () => {
    const missingScene = rawDocs()
    missingScene.scenes = []
    expect(() => parseProjectSnapshot(missingScene)).toThrow(/missing scene "main"/i)

    const unreferencedScene = rawDocs()
    unreferencedScene.scenes.push({ ...structuredClone(sampleSnapshot().scenes.main), id: 'stray' })
    expect(() => parseProjectSnapshot(unreferencedScene)).toThrow(/scene "stray" is not referenced/i)

    const missingResource = rawDocs()
    missingResource.resources = []
    expect(() => parseProjectSnapshot(missingResource)).toThrow(/missing resource "tuning"/i)

    const unreferencedResource = rawDocs()
    unreferencedResource.resources.push({ ...structuredClone(sampleSnapshot().resources.tuning), id: 'stray' })
    expect(() => parseProjectSnapshot(unreferencedResource)).toThrow(/resource "stray" is not referenced/i)

    const typeMismatch = rawDocs()
    ;(typeMismatch.resources[0] as Record<string, unknown>).typeId = 'other'
    expect(() => parseProjectSnapshot(typeMismatch)).toThrow(/resource type mismatch for "tuning"/i)
  })

  it('does not invoke the game hook for current-version documents', () => {
    const migrate = vi.fn()
    parseProjectSnapshot(rawDocs(), { migrate })
    expect(migrate).not.toHaveBeenCalled()
  })
})

describe('migration 1→2', () => {
  it('migrates v1 raw documents: manifest owns the version, docs lose theirs', () => {
    const parsed = parseProjectSnapshot(v1RawDocuments())
    expect(parsed.fromVersion).toBe(1)
    expect(parsed.snapshot.manifest.formatVersion).toBe(2)
    expect('formatVersion' in parsed.snapshot.scenes.main!).toBe(false)
    expect('formatVersion' in parsed.snapshot.resources.tuning!).toBe(false)
    expect(parsed.snapshot.scenes.main!.entities).toHaveLength(2)
  })

  it('parses a v1 bundle (root formatVersion ignored) to the same snapshot', () => {
    const fromBundle = parseProjectBundle(v1BundleText())
    expect(fromBundle.fromVersion).toBe(1)
    expect(fromBundle.snapshot).toEqual(parseProjectSnapshot(v1RawDocuments()).snapshot)
  })

  it('fires the game hook with the post-core snapshot and the original fromVersion', () => {
    const calls: number[] = []
    const parsed = parseProjectSnapshot(v1RawDocuments(), {
      migrate: (snapshot, fromVersion) => {
        calls.push(fromVersion)
        expect(snapshot.manifest.formatVersion).toBe(2) // core migrations ran first
        return snapshot
      }
    })
    expect(calls).toEqual([1])
    expect(parsed.fromVersion).toBe(1)
  })
})

describe('applyGameMigration', () => {
  it('returns the snapshot untouched without a hook or at the current version', () => {
    const snapshot = sampleSnapshot()
    expect(applyGameMigration({ snapshot, fromVersion: 0 }, undefined)).toBe(snapshot)
    const migrate = vi.fn()
    expect(applyGameMigration({ snapshot, fromVersion: PROJECT_FORMAT_VERSION }, migrate)).toBe(snapshot)
    expect(migrate).not.toHaveBeenCalled()
  })

  it('invokes the hook with the snapshot and original fromVersion, and re-validates the result', () => {
    const snapshot = sampleSnapshot()
    const migrate = vi.fn((input: typeof snapshot) => structuredClone(input))
    const result = applyGameMigration({ snapshot, fromVersion: 0 }, migrate)
    expect(migrate).toHaveBeenCalledWith(snapshot, 0)
    expect(result).toEqual(snapshot)
  })

  it('rejects hook output that fails the snapshot schema', () => {
    const snapshot = sampleSnapshot()
    const migrate = () => ({ garbage: true }) as never
    expect(() => applyGameMigration({ snapshot, fromVersion: 0 }, migrate)).toThrow()
  })

  it('rejects a hook that changes gameId', () => {
    const snapshot = sampleSnapshot()
    const migrate = (input: typeof snapshot) => {
      const out = structuredClone(input)
      out.manifest.gameId = 'other'
      return out
    }
    expect(() => applyGameMigration({ snapshot, fromVersion: 0 }, migrate)).toThrow(/must not change gameid/i)
  })
})
