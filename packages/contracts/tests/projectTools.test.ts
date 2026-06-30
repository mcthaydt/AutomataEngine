import { describe, expect, it } from 'vitest'
import {
  PROJECT_RESOURCE_URIS,
  parseProjectToolArgs,
  projectToolDefs,
  type ProjectToolName
} from '../src/projectTools'

const expected: ProjectToolName[] = [
  'addEntity', 'removeEntities', 'reparentEntity', 'addComponent', 'removeComponent',
  'addResource', 'removeResource', 'setProperty', 'insertArrayItem', 'removeArrayItem',
  'moveArrayItem', 'getProject', 'getHierarchy', 'getResources', 'validate', 'evaluate'
]

describe('project tools', () => {
  it('locks generic tool order, descriptions, and JSON schemas', () => {
    const definitions = projectToolDefs()
    expect(definitions.map((tool) => tool.name)).toEqual(expected)
    for (const tool of definitions) {
      expect(tool.description).not.toMatch(/ball|banana|level item/i)
      expect(tool.schema).toMatchObject({ type: 'object' })
    }
  })

  it('parses valid write, read, and evaluation arguments', () => {
    expect(parseProjectToolArgs('addEntity', {
      sceneId: 'main',
      entity: { id: 'box', name: 'Box', enabled: true, components: [] }
    })).toMatchObject({ sceneId: 'main', entity: { id: 'box' } })
    expect(parseProjectToolArgs('setProperty', {
      target: { kind: 'resource', resourceId: 'tuning' }, pointer: '/speed', value: 8
    })).toEqual({ target: { kind: 'resource', resourceId: 'tuning' }, pointer: '/speed', value: 8 })
    expect(parseProjectToolArgs('getHierarchy', {})).toEqual({})
    expect(parseProjectToolArgs('evaluate', { maxSteps: 180 })).toEqual({ maxSteps: 180 })
  })

  it('rejects missing IDs, invalid pointers, negative indices, and unknown tools', () => {
    expect(() => parseProjectToolArgs('removeComponent', { sceneId: 'main', entityId: 'box' })).toThrow()
    expect(() => parseProjectToolArgs('setProperty', {
      target: { kind: 'resource', resourceId: 'tuning' }, pointer: 'speed', value: 8
    })).toThrow()
    expect(() => parseProjectToolArgs('setProperty', {
      target: { kind: 'resource', resourceId: 'tuning' }, pointer: '/bad~2escape', value: 8
    })).toThrow()
    expect(() => parseProjectToolArgs('removeArrayItem', {
      target: { kind: 'resource', resourceId: 'waves' }, pointer: '/waves', index: -1
    })).toThrow()
    expect(() => parseProjectToolArgs('missing' as ProjectToolName, {})).toThrow(/unknown project tool/i)
  })

  it('locks project resource URIs', () => {
    expect(Object.values(PROJECT_RESOURCE_URIS)).toEqual([
      'editor://project',
      'editor://hierarchy',
      'editor://resources',
      'editor://validation',
      'editor://baseline'
    ])
  })
})
