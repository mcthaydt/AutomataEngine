import { describe, expect, it } from 'vitest'
import {
  RESOURCE_URIS,
  parseToolArgs,
  toolDefs,
  type ToolName
} from '../src/tools'

const expected: ToolName[] = [
  'addEntity', 'removeEntities', 'reparentEntity', 'addComponent', 'removeComponent',
  'addResource', 'removeResource', 'setProperty', 'insertArrayItem', 'removeArrayItem',
  'moveArrayItem', 'getProject', 'getHierarchy', 'getResources', 'validate', 'evaluate'
]

describe('project tools', () => {
  it('locks generic tool order, descriptions, and JSON schemas', () => {
    const definitions = toolDefs()
    expect(definitions.map((tool) => tool.name)).toEqual(expected)
    for (const tool of definitions) {
      expect(tool.description).not.toMatch(/ball|banana|level item/i)
      expect(tool.schema).toMatchObject({ type: 'object' })
    }
  })

  it('parses valid write, read, and evaluation arguments', () => {
    expect(parseToolArgs('addEntity', {
      sceneId: 'main',
      entity: { id: 'box', name: 'Box', enabled: true, components: [] }
    })).toMatchObject({ sceneId: 'main', entity: { id: 'box' } })
    expect(parseToolArgs('setProperty', {
      target: { kind: 'resource', resourceId: 'tuning' }, pointer: '/speed', value: 8
    })).toEqual({ target: { kind: 'resource', resourceId: 'tuning' }, pointer: '/speed', value: 8 })
    expect(parseToolArgs('getHierarchy', {})).toEqual({})
    expect(parseToolArgs('evaluate', { maxSteps: 180 })).toEqual({ maxSteps: 180 })
  })

  it('rejects missing IDs, invalid pointers, negative indices, and unknown tools', () => {
    expect(() => parseToolArgs('removeComponent', { sceneId: 'main', entityId: 'box' })).toThrow()
    expect(() => parseToolArgs('setProperty', {
      target: { kind: 'resource', resourceId: 'tuning' }, pointer: 'speed', value: 8
    })).toThrow()
    expect(() => parseToolArgs('setProperty', {
      target: { kind: 'resource', resourceId: 'tuning' }, pointer: '/bad~2escape', value: 8
    })).toThrow()
    expect(() => parseToolArgs('removeArrayItem', {
      target: { kind: 'resource', resourceId: 'waves' }, pointer: '/waves', index: -1
    })).toThrow()
    expect(() => parseToolArgs('missing' as ToolName, {})).toThrow(/unknown project tool/i)
  })

  it('locks project resource URIs', () => {
    expect(Object.values(RESOURCE_URIS)).toEqual([
      'editor://project',
      'editor://hierarchy',
      'editor://resources',
      'editor://validation',
      'editor://baseline'
    ])
  })
})
