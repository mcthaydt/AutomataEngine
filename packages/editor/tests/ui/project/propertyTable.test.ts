import { describe, expect, it } from 'vitest'
import { mountPropertyTable } from '../../../src/ui/project/propertyTable'
import type { ArrayProperty, ProjectCommand } from '@automata/project'

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
  })

  it('edits a cell with an index-scoped pointer', () => {
    const { parent, dispatched } = mount([{ rammer: 1, shooter: 0, boss: 0 }])
    const cell = parent.querySelector<HTMLInputElement>('[data-cell="/waves/0/shooter"] input')!
    cell.value = '5'; cell.dispatchEvent(new Event('change'))
    expect(dispatched).toEqual([{ type: 'setProperty', target, pointer: '/waves/0/shooter', value: 5 }])
  })
})
