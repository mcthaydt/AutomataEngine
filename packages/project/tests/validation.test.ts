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

  it('flags a mismatched game ID', () => {
    const snapshot = sampleSnapshot()
    snapshot.manifest.gameId = 'other'
    expect(codes(validateProject(sampleDefinition, snapshot))).toContain('manifest.gameId')
  })

  it('flags manifest/map mismatches', () => {
    const snapshot = sampleSnapshot()
    snapshot.manifest.scenes.push({ id: 'extra', path: 'scenes/extra.scene.json' })
    expect(codes(validateProject(sampleDefinition, snapshot))).toContain('manifest.sceneMismatch')

    const unlisted = sampleSnapshot()
    unlisted.scenes.extra = { formatVersion: 1, id: 'extra', name: 'Extra', entities: [] }
    expect(codes(validateProject(sampleDefinition, unlisted))).toContain('manifest.sceneMismatch')
  })

  it('flags duplicate manifest entries and resource type disagreement', () => {
    const snapshot = sampleSnapshot()
    snapshot.manifest.scenes.push({ ...snapshot.manifest.scenes[0]! })
    snapshot.manifest.resources.push({ ...snapshot.manifest.resources[0]! })
    snapshot.manifest.resources[0]!.typeId = 'other.type'
    const result = codes(validateProject(sampleDefinition, snapshot))
    expect(result).toContain('manifest.duplicateScene')
    expect(result).toContain('manifest.duplicateResource')
    expect(result).toContain('manifest.resourceMismatch')
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

  it('flags unknown, invalid, and duplicate singleton resources', () => {
    const unknown = sampleSnapshot()
    unknown.resources.tuning!.typeId = 'fake.unknown'
    unknown.manifest.resources[0]!.typeId = 'fake.unknown'
    expect(codes(validateProject(sampleDefinition, unknown))).toContain('resource.unknownType')

    const invalid = sampleSnapshot()
    ;(invalid.resources.tuning!.data as { speed: unknown }).speed = -1
    expect(codes(validateProject(sampleDefinition, invalid))).toContain('number.min')

    const duplicate = sampleSnapshot()
    duplicate.resources.other = { formatVersion: 1, id: 'other', typeId: 'fake.tuning', data: { speed: 2 } }
    duplicate.manifest.resources.push({ id: 'other', typeId: 'fake.tuning', path: 'resources/other.resource.json' })
    expect(codes(validateProject(sampleDefinition, duplicate))).toContain('resource.singleton')
  })

  it('flags references to missing resources and wrong types', () => {
    const missing = sampleSnapshot()
    ;(missing.scenes.main!.entities[1]!.components[0]!.data as { tuning: string }).tuning = 'nope'
    expect(codes(validateProject(sampleDefinition, missing))).toContain('reference.missing')

    const wrongType = sampleSnapshot()
    wrongType.resources.other = { formatVersion: 1, id: 'other', typeId: 'fake.other', data: {} }
    wrongType.manifest.resources.push({ id: 'other', typeId: 'fake.other', path: 'resources/other.resource.json' })
    ;(wrongType.scenes.main!.entities[1]!.components[0]!.data as { tuning: string }).tuning = 'other'
    const definition: GameProjectDefinition<{ ok: true }> = {
      ...sampleDefinition,
      resources: [
        ...sampleDefinition.resources,
        { typeId: 'fake.other', label: 'Other', schema: { kind: 'object', fields: [] }, defaultData: {} }
      ]
    }
    expect(codes(validateProject(definition, wrongType))).toContain('reference.type')
  })

  it('resolves entity references in components and resources', () => {
    const definition: GameProjectDefinition<{ ok: true }> = {
      ...sampleDefinition,
      components: [{
        ...sampleDefinition.components[0]!,
        schema: {
          kind: 'object',
          fields: [
            ...sampleDefinition.components[0]!.schema.fields,
            { key: 'target', label: 'Target', kind: 'reference', required: false, target: 'entity' }
          ]
        }
      }],
      resources: [
        ...sampleDefinition.resources,
        {
          typeId: 'fake.links', label: 'Links',
          schema: { kind: 'object', fields: [{ key: 'target', kind: 'reference', target: 'entity' }] },
          defaultData: { target: '' }
        }
      ]
    }
    const valid = sampleSnapshot()
    ;(valid.scenes.main!.entities[1]!.components[0]!.data as Record<string, unknown>).target = 'root'
    valid.resources.links = { formatVersion: 1, id: 'links', typeId: 'fake.links', data: { target: 'spawn' } }
    valid.manifest.resources.push({ id: 'links', typeId: 'fake.links', path: 'resources/links.resource.json' })
    expect(validateProject(definition, valid)).toEqual([])

    ;(valid.scenes.main!.entities[1]!.components[0]!.data as Record<string, unknown>).target = 'ghost'
    ;(valid.resources.links!.data as Record<string, unknown>).target = 'ghost'
    expect(codes(validateProject(definition, valid)).filter((code) => code === 'reference.missing')).toHaveLength(2)
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

    const withStringCompileError: GameProjectDefinition<{ ok: true }> = {
      ...sampleDefinition,
      compile: () => { throw 'string failure' }
    }
    expect(validateProject(withStringCompileError, sampleSnapshot()).find((issue) => issue.code === 'compile.failed')?.message).toBe('string failure')
  })

  it('returns errors sorted deterministically before warnings', () => {
    const snapshot = sampleSnapshot()
    snapshot.manifest.entrySceneId = 'ghost'
    snapshot.scenes.main!.entities[1]!.parentId = 'ghost'
    const severities = validateProject(sampleDefinition, snapshot).map((issue) => issue.severity)
    expect(severities).toEqual([...severities].sort((a, b) => (a === b ? 0 : a === 'error' ? -1 : 1)))
  })

  it('sorts same-severity issues by location and code', () => {
    const definition: GameProjectDefinition<{ ok: true }> = {
      ...sampleDefinition,
      validate: () => [
        { severity: 'warning', code: 'z.last', message: 'last', sceneId: 'z' },
        { severity: 'warning', code: 'a.first', message: 'first', sceneId: 'a' },
        { severity: 'warning', code: 'b.code', message: 'code b', sceneId: 'a' }
      ]
    }
    expect(validateProject(definition, sampleSnapshot()).map((issue) => issue.code)).toEqual([
      'a.first', 'b.code', 'z.last'
    ])
  })
})
