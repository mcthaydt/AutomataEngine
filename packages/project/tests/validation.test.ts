import { describe, expect, it } from 'vitest'
import { validateProject } from '../src'
import type { GameProjectDefinition } from '../src'
import { sampleDefinition, sampleSnapshot } from './fixtures/sampleProject'

const codes = (issues: ReadonlyArray<{ code: string }>) => issues.map((issue) => issue.code)

describe('project validation', () => {
  it('reports no issues for a well-formed project', () => {
    expect(validateProject(sampleDefinition, sampleSnapshot())).toEqual([])
  })

  it('flags a missing entry scene', () => {
    const snapshot = sampleSnapshot()
    snapshot.manifest.entrySceneId = 'ghost'
    expect(codes(validateProject(sampleDefinition, snapshot))).toContain('manifest.entryScene')
  })

  it('flags manifest/map mismatches', () => {
    const snapshot = sampleSnapshot()
    snapshot.manifest.scenes.push({ id: 'extra', path: 'scenes/extra.scene.json' })
    expect(codes(validateProject(sampleDefinition, snapshot))).toContain('manifest.sceneMismatch')
  })

  it('flags path traversal in manifest paths', () => {
    const snapshot = sampleSnapshot()
    snapshot.manifest.scenes[0]!.path = '../escape.json'
    expect(codes(validateProject(sampleDefinition, snapshot))).toContain('manifest.path')
  })

  it('flags duplicate entity IDs', () => {
    const snapshot = sampleSnapshot()
    snapshot.scenes.main!.entities.push({ id: 'root', name: 'Dup', enabled: true, components: [] })
    expect(codes(validateProject(sampleDefinition, snapshot))).toContain('entity.duplicateId')
  })

  it('flags missing parents and cycles', () => {
    const missing = sampleSnapshot()
    missing.scenes.main!.entities[1]!.parentId = 'ghost'
    expect(codes(validateProject(sampleDefinition, missing))).toContain('entity.missingParent')

    const cyclic = sampleSnapshot()
    cyclic.scenes.main!.entities[0]!.parentId = 'spawn'
    expect(codes(validateProject(sampleDefinition, cyclic))).toContain('entity.cycle')
  })

  it('flags unknown component types, duplicate component IDs, and cardinality', () => {
    const unknown = sampleSnapshot()
    unknown.scenes.main!.entities[1]!.components.push({ id: 'x', typeId: 'fake.nope', data: {} })
    expect(codes(validateProject(sampleDefinition, unknown))).toContain('component.unknownType')

    const cardinality = sampleSnapshot()
    cardinality.scenes.main!.entities[1]!.components.push({ id: 'c2', typeId: 'fake.spawn', data: { team: 'blue' } })
    expect(codes(validateProject(sampleDefinition, cardinality))).toContain('component.cardinality')

    const dupComponent = sampleSnapshot()
    dupComponent.scenes.main!.entities[1]!.components.push({ id: 'c-spawn', typeId: 'fake.spawn', data: { team: 'blue' } })
    expect(codes(validateProject(sampleDefinition, dupComponent))).toContain('component.duplicateId')
  })

  it('flags invalid component property data with a pointer', () => {
    const snapshot = sampleSnapshot()
    ;(snapshot.scenes.main!.entities[1]!.components[0]!.data as { team: string }).team = 'green'
    const issues = validateProject(sampleDefinition, snapshot)
    expect(issues.some((issue) => issue.code === 'enum.value' && issue.pointer === '/team')).toBe(true)
  })

  it('flags references to missing resources and wrong types', () => {
    const missing = sampleSnapshot()
    ;(missing.scenes.main!.entities[1]!.components[0]!.data as { tuning: string }).tuning = 'nope'
    expect(codes(validateProject(sampleDefinition, missing))).toContain('reference.missing')
  })

  it('includes game validation issues and compile preflight failures', () => {
    const withGameIssue: GameProjectDefinition<{ ok: true }> = {
      ...sampleDefinition,
      validate: () => [{ severity: 'error', code: 'game.custom', message: 'nope', sceneId: 'main' }]
    }
    expect(codes(validateProject(withGameIssue, sampleSnapshot()))).toContain('game.custom')

    const withCompileError: GameProjectDefinition<{ ok: true }> = {
      ...sampleDefinition,
      compile: () => { throw new Error('boom') }
    }
    expect(codes(validateProject(withCompileError, sampleSnapshot()))).toContain('compile.failed')
  })

  it('returns errors sorted deterministically before warnings', () => {
    const snapshot = sampleSnapshot()
    snapshot.manifest.entrySceneId = 'ghost'
    snapshot.scenes.main!.entities[1]!.parentId = 'ghost'
    const severities = validateProject(sampleDefinition, snapshot).map((issue) => issue.severity)
    expect(severities).toEqual([...severities].sort((a, b) => (a === b ? 0 : a === 'error' ? -1 : 1)))
  })
})
