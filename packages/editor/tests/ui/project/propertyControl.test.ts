import { describe, expect, it } from 'vitest'
import { mountPropertyControl } from '../../../src/ui/project/propertyControl'
import type { ProjectCommand, PropertySchema } from '@automata/project'

const target = { kind: 'resource', resourceId: 'tuning' } as const

function mount(schema: PropertySchema, value: unknown, pointer: string, referenceOptions?: () => Array<{ id: string; label: string }>) {
  const parent = document.createElement('div')
  const dispatched: ProjectCommand[] = []
  const handle = mountPropertyControl(parent, { schema, value, pointer, target, dispatch: (command) => dispatched.push(command), referenceOptions })
  return { parent, dispatched, handle }
}

const change = (element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): void => {
  element.dispatchEvent(new Event('change'))
}

describe('property control', () => {
  it('emits a clamped number and rejects non-finite input', () => {
    const { parent, dispatched } = mount({ kind: 'number', key: 'speed', label: 'Speed', required: true, min: 0, max: 20, step: 0.5 }, 4, '/speed')
    const input = parent.querySelector('input')!
    input.value = '8'; change(input)
    expect(dispatched).toEqual([{ type: 'setProperty', target, pointer: '/speed', value: 8 }])
    input.value = '50'; change(input)
    expect(dispatched.at(-1)).toEqual({ type: 'setProperty', target, pointer: '/speed', value: 20 })
    input.value = 'abc'; change(input)
    expect(dispatched).toHaveLength(2)
    expect(input.getAttribute('aria-invalid')).toBe('true')

    const unclamped = mount({ kind: 'number' }, null, '/plain')
    const plain = unclamped.parent.querySelector('input')!
    expect(plain.value).toBe('')
    plain.value = '-2'; change(plain)
    expect(unclamped.dispatched.at(-1)).toMatchObject({ value: -2 })
    plain.value = ''; change(plain)
    expect(plain.getAttribute('aria-invalid')).toBe('true')
  })

  it('emits string, multiline, boolean, enum, and color values', () => {
    const s = mount({ kind: 'string', key: 's', label: 'S', required: true }, 'hi', '/s')
    const input = s.parent.querySelector('input')!
    input.value = 'hello'; change(input)
    expect(s.dispatched).toEqual([{ type: 'setProperty', target, pointer: '/s', value: 'hello' }])

    const multi = mount({ kind: 'string', key: 'm', label: 'M', required: true, multiline: true }, '', '/m')
    expect(multi.parent.querySelector('textarea')).not.toBeNull()

    const b = mount({ kind: 'boolean', key: 'b', label: 'B', required: true }, false, '/b')
    const checkbox = b.parent.querySelector('input')!
    checkbox.checked = true; change(checkbox)
    expect(b.dispatched).toEqual([{ type: 'setProperty', target, pointer: '/b', value: true }])

    const e = mount({ kind: 'enum', key: 'e', label: 'E', required: true, values: ['chase', 'kite'] }, 'chase', '/e')
    const select = e.parent.querySelector('select')!
    select.value = 'kite'; change(select)
    expect(e.dispatched).toEqual([{ type: 'setProperty', target, pointer: '/e', value: 'kite' }])

    const c = mount({ kind: 'color', key: 'c', label: 'C', required: true }, '#ffffff', '/c')
    const color = c.parent.querySelector('input')!
    color.value = '#00ff00'; change(color)
    expect(c.dispatched).toEqual([{ type: 'setProperty', target, pointer: '/c', value: '#00ff00' }])

    expect(mount({ kind: 'string' }, null, '/empty').parent.querySelector<HTMLInputElement>('input')!.value).toBe('')
    expect(mount({ kind: 'enum', values: [] }, null, '/enum').parent.querySelector<HTMLSelectElement>('select')!.value).toBe('')
    expect(mount({ kind: 'color' }, null, '/color').parent.querySelector<HTMLInputElement>('input')!.value).toBe('#000000')
  })

  it('emits a per-axis pointer for vec3 edits', () => {
    const { parent, dispatched } = mount({ kind: 'vec3', key: 'p', label: 'P', required: true }, { x: 1, y: 2, z: 3 }, '/position')
    const x = parent.querySelector<HTMLInputElement>('[data-axis="x"]')!
    x.value = '5'; change(x)
    expect(dispatched).toEqual([{ type: 'setProperty', target, pointer: '/position/x', value: 5 }])

    const empty = mount({ kind: 'vec3' }, null, '/empty')
    expect(empty.parent.querySelector<HTMLInputElement>('[data-axis="z"]')!.value).toBe('0')
    const invalid = empty.parent.querySelector<HTMLInputElement>('[data-axis="y"]')!
    invalid.value = ''; change(invalid)
    expect(invalid.getAttribute('aria-invalid')).toBe('true')
  })

  it('renders a reference select with a blank option for optional fields', () => {
    const { parent, dispatched } = mount(
      { kind: 'reference', key: 'r', label: 'R', required: false, target: 'resource', typeIds: ['fake.tuning'] },
      '', '/r', () => [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]
    )
    const select = parent.querySelector('select')!
    expect(select.options[0]!.value).toBe('')
    select.value = 'a'; change(select)
    expect(dispatched).toEqual([{ type: 'setProperty', target, pointer: '/r', value: 'a' }])

    const required = mount({ kind: 'reference', required: true, target: 'entity' }, null, '/target')
    expect(required.parent.querySelector('select')!.options).toHaveLength(0)
  })

  it('renders nested object groups with extended pointers', () => {
    const schema: PropertySchema = {
      kind: 'object', fields: [{ key: 'inner', label: 'Inner', kind: 'object', required: true, fields: [{ key: 'a', label: 'A', kind: 'number', required: true }] }]
    }
    const { parent, dispatched } = mount(schema, { inner: { a: 1 } }, '')
    const input = parent.querySelector<HTMLInputElement>('[data-prop="/inner/a"] input')!
    input.value = '7'; change(input)
    expect(dispatched).toEqual([{ type: 'setProperty', target, pointer: '/inner/a', value: 7 }])

    const keyless: PropertySchema = { kind: 'object', fields: [{ kind: 'string', label: 'Skipped' }, { key: 'name', kind: 'string' }] }
    expect(mount(keyless, null, '').parent.querySelectorAll('input')).toHaveLength(1)
  })

  it('falls back to an empty array and supports hidden labels and disposal', () => {
    const parent = document.createElement('div')
    const handle = mountPropertyControl(parent, {
      schema: { kind: 'array', presentation: 'list', item: { kind: 'string' } },
      value: 'bad', pointer: '/items', target, dispatch: () => {}, hideLabel: true
    })
    expect(parent.querySelectorAll('[data-cell]')).toHaveLength(0)
    handle.dispose()
    expect(parent.children).toHaveLength(0)

    const hidden = document.createElement('div')
    mountPropertyControl(hidden, {
      schema: { kind: 'number', label: 'Hidden' }, value: 1, pointer: '/n', target,
      dispatch: () => {}, hideLabel: true
    })
    expect(hidden.querySelector('.ed-field-label')).toBeNull()
  })
})
