import { describe, expect, it } from 'vitest'
import { mountPropertyTable } from '../../../src/ui/project/propertyTable'
import type { ArrayProperty, ProjectCommand, PropertySchema } from '@automata/project'

const target = { kind: 'resource', resourceId: 'waves' } as const

const wavesSchema: ArrayProperty = {
  kind: 'array', key: 'waves', label: 'Waves', presentation: 'table',
  item: { kind: 'object', fields: [
    { key: 'rammer', label: 'Rammer', kind: 'number', required: true, min: 0 },
    { key: 'shooter', label: 'Shooter', kind: 'number', required: true, min: 0 },
    { key: 'boss', label: 'Boss', kind: 'number', required: true, min: 0 }
  ] }
}

function mount(value: unknown[]) {
  const parent = document.createElement('div')
  const dispatched: ProjectCommand[] = []
  const handle = mountPropertyTable(parent, { schema: wavesSchema, value, pointer: '/waves', target, dispatch: (command) => dispatched.push(command) })
  return { parent, dispatched, handle }
}

describe('property table', () => {
  it('adds a default row at the end', () => {
    const { parent, dispatched } = mount([{ rammer: 3, shooter: 0, boss: 0 }, { rammer: 3, shooter: 1, boss: 0 }])
    parent.querySelector<HTMLButtonElement>('[data-table-add]')!.click()
    expect(dispatched).toEqual([{
      type: 'insertArrayItem', target, pointer: '/waves', index: 2, value: { rammer: 0, shooter: 0, boss: 0 }
    }])
  })

  it('removes and reorders rows by index', () => {
    const { parent, dispatched } = mount([{ rammer: 1, shooter: 0, boss: 0 }, { rammer: 2, shooter: 0, boss: 0 }])
    parent.querySelectorAll<HTMLButtonElement>('[data-row-remove]')[1]!.click()
    expect(dispatched.at(-1)).toEqual({ type: 'removeArrayItem', target, pointer: '/waves', index: 1 })
    parent.querySelectorAll<HTMLButtonElement>('[data-row-down]')[0]!.click()
    expect(dispatched.at(-1)).toEqual({ type: 'moveArrayItem', target, pointer: '/waves', from: 0, to: 1 })
    parent.querySelectorAll<HTMLButtonElement>('[data-row-up]')[1]!.click()
    expect(dispatched.at(-1)).toEqual({ type: 'moveArrayItem', target, pointer: '/waves', from: 1, to: 0 })

    const count = dispatched.length
    parent.querySelectorAll<HTMLButtonElement>('[data-row-up]')[0]!.click()
    parent.querySelectorAll<HTMLButtonElement>('[data-row-down]')[1]!.click()
    expect(dispatched).toHaveLength(count)
  })

  it('edits a cell with an index-scoped pointer', () => {
    const { parent, dispatched } = mount([{ rammer: 1, shooter: 0, boss: 0 }])
    const cell = parent.querySelector<HTMLInputElement>('[data-cell="/waves/0/shooter"] input')!
    cell.value = '5'; cell.dispatchEvent(new Event('change'))
    expect(dispatched).toEqual([{ type: 'setProperty', target, pointer: '/waves/0/shooter', value: 5 }])
  })

  it('summarizes nested table cells and tolerates null rows or keyless fields', () => {
    const schema: ArrayProperty = {
      kind: 'array', presentation: 'table',
      item: {
        kind: 'object', fields: [
          { key: 'items', label: 'Items', kind: 'array', presentation: 'list', item: { kind: 'string' } },
          { key: 'nested', label: 'Nested', kind: 'object', fields: [] },
          { kind: 'string', label: 'Decoration' }
        ]
      }
    }
    const parent = document.createElement('div')
    const handle = mountPropertyTable(parent, {
      schema, value: [{ items: ['a'], nested: {} }, null], pointer: '/rows', target, dispatch: () => {}
    })
    expect(parent.querySelector('[data-cell="/rows/0/items"]')?.textContent).toBe('[1]')
    expect(parent.querySelector('[data-cell="/rows/0/nested"]')?.textContent).toBe('{…}')
    expect(parent.querySelector('[data-cell="/rows/1/items"]')?.textContent).toBe('[0]')
    handle.dispose()
    expect(parent.children).toHaveLength(0)
  })

  it('builds list-item defaults for every property kind', () => {
    const cases: Array<[PropertySchema, unknown]> = [
      [{ kind: 'number', min: 2 }, 2],
      [{ kind: 'number' }, 0],
      [{ kind: 'string' }, ''],
      [{ kind: 'boolean' }, false],
      [{ kind: 'enum', values: ['first'] }, 'first'],
      [{ kind: 'enum', values: [] }, ''],
      [{ kind: 'color' }, '#ffffff'],
      [{ kind: 'vec3' }, { x: 0, y: 0, z: 0 }],
      [{ kind: 'reference', target: 'resource' }, ''],
      [{ kind: 'object', fields: [{ key: 'name', kind: 'string' }] }, { name: '' }],
      [{ kind: 'array', presentation: 'list', item: { kind: 'string' } }, []]
    ]

    for (const [item, expected] of cases) {
      const parent = document.createElement('div')
      const dispatched: ProjectCommand[] = []
      mountPropertyTable(parent, {
        schema: { kind: 'array', presentation: 'list', item },
        value: [], pointer: '/items', target, dispatch: (command) => dispatched.push(command)
      })
      parent.querySelector<HTMLButtonElement>('[data-table-add]')!.click()
      expect(dispatched[0]).toEqual({
        type: 'insertArrayItem', target, pointer: '/items', index: 0, value: expected
      })
    }
  })

  it('renders and removes scalar list rows', () => {
    const parent = document.createElement('div')
    const dispatched: ProjectCommand[] = []
    mountPropertyTable(parent, {
      schema: { kind: 'array', presentation: 'list', item: { kind: 'string' } },
      value: ['a'], pointer: '/items', target, dispatch: (command) => dispatched.push(command)
    })
    expect(parent.querySelector('[data-cell="/items/0"]')).not.toBeNull()
    parent.querySelector<HTMLButtonElement>('[data-row-remove]')!.click()
    expect(dispatched).toEqual([{ type: 'removeArrayItem', target, pointer: '/items', index: 0 }])
  })
})
