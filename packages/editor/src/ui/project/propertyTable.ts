import {
  defaultObject, escapePointerToken,
  type ObjectSchema, type ProjectCommand, type ProjectTarget, type PropertySchema
} from '@automata/project'
import { mountPropertyControl, type ReferenceOption } from './propertyControl'

/**
 * Editable array controls.
 *
 * Object-item arrays render as a table of scalar cells; everything else renders
 * as a list of nested controls. Add uses schema defaults; remove/reorder emit
 * generic array commands. Row keys are the current index because array identity
 * is command/pointer-based in v1.
 */
export interface PropertyTableOptions {
  schema: Extract<PropertySchema, { kind: 'array' }>
  value: unknown[]
  pointer: string
  target: ProjectTarget
  dispatch: (command: ProjectCommand) => void
  referenceOptions?: (field: Extract<PropertySchema, { kind: 'reference' }>) => ReferenceOption[]
}

export interface PropertyTableHandle {
  element: HTMLElement
  dispose(): void
}

export function mountPropertyTable(parent: HTMLElement, options: PropertyTableOptions): PropertyTableHandle {
  const isTable = options.schema.presentation === 'table' && options.schema.item.kind === 'object'
  const element = isTable ? tableElement(options, options.schema.item as ObjectSchema) : listElement(options)
  parent.append(element)
  return { element, dispose() { element.remove() } }
}

function tableElement(options: PropertyTableOptions, item: ObjectSchema): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'ed-table'
  wrap.dataset.prop = options.pointer

  const table = document.createElement('table')
  const head = document.createElement('tr')
  for (const fieldDef of item.fields) {
    const th = document.createElement('th')
    th.textContent = fieldDef.label ?? fieldDef.key ?? ''
    head.append(th)
  }
  head.append(document.createElement('th'))
  const thead = document.createElement('thead')
  thead.append(head)
  table.append(thead)

  const body = document.createElement('tbody')
  options.value.forEach((row, index) => body.append(rowElement(options, item, row, index)))
  table.append(body)
  wrap.append(table)

  wrap.append(actionButton('Add', 'data-table-add', () =>
    options.dispatch({ type: 'insertArrayItem', target: options.target, pointer: options.pointer, index: options.value.length, value: defaultObject(item) })))
  return wrap
}

function rowElement(options: PropertyTableOptions, item: ObjectSchema, row: unknown, index: number): HTMLElement {
  const tr = document.createElement('tr')
  const record = (row ?? {}) as Record<string, unknown>
  for (const fieldDef of item.fields) {
    if (fieldDef.key === undefined) continue
    const td = document.createElement('td')
    const pointer = `${options.pointer}/${index}/${escapePointerToken(fieldDef.key)}`
    td.dataset.cell = pointer
    mountCell(td, options, fieldDef, record[fieldDef.key], pointer)
    tr.append(td)
  }
  const actions = document.createElement('td')
  actions.append(
    actionButton('▲', 'data-row-up', () => { if (index > 0) options.dispatch({ type: 'moveArrayItem', target: options.target, pointer: options.pointer, from: index, to: index - 1 }) }),
    actionButton('▼', 'data-row-down', () => { if (index < options.value.length - 1) options.dispatch({ type: 'moveArrayItem', target: options.target, pointer: options.pointer, from: index, to: index + 1 }) }),
    actionButton('✕', 'data-row-remove', () => options.dispatch({ type: 'removeArrayItem', target: options.target, pointer: options.pointer, index }))
  )
  tr.append(actions)
  return tr
}

/** Scalar cells get a control; nested arrays/objects show a read-only summary. */
function mountCell(td: HTMLElement, options: PropertyTableOptions, field: PropertySchema, value: unknown, pointer: string): void {
  if (field.kind === 'object' || field.kind === 'array') {
    const span = document.createElement('span')
    span.className = 'ed-cell-summary'
    span.textContent = field.kind === 'array' ? `[${(value as unknown[] | undefined)?.length ?? 0}]` : '{…}'
    td.append(span)
    return
  }
  mountPropertyControl(td, { schema: field, value, pointer, target: options.target, dispatch: options.dispatch, referenceOptions: options.referenceOptions, hideLabel: true })
}

function listElement(options: PropertyTableOptions): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'ed-list'
  wrap.dataset.prop = options.pointer
  options.value.forEach((value, index) => {
    const rowDiv = document.createElement('div')
    rowDiv.className = 'ed-list-row'
    rowDiv.dataset.cell = `${options.pointer}/${index}`
    mountPropertyControl(rowDiv, { schema: options.schema.item, value, pointer: `${options.pointer}/${index}`, target: options.target, dispatch: options.dispatch, referenceOptions: options.referenceOptions, hideLabel: true })
    rowDiv.append(actionButton('✕', 'data-row-remove', () => options.dispatch({ type: 'removeArrayItem', target: options.target, pointer: options.pointer, index })))
    wrap.append(rowDiv)
  })
  wrap.append(actionButton('Add', 'data-table-add', () =>
    options.dispatch({ type: 'insertArrayItem', target: options.target, pointer: options.pointer, index: options.value.length, value: itemDefault(options.schema.item) })))
  return wrap
}

function itemDefault(item: PropertySchema): unknown {
  switch (item.kind) {
    case 'object': return defaultObject(item)
    case 'number': return item.min ?? 0
    case 'string': return ''
    case 'boolean': return false
    case 'enum': return item.values[0] ?? ''
    case 'color': return '#ffffff'
    case 'vec3': return { x: 0, y: 0, z: 0 }
    case 'reference': return ''
    case 'array': return []
  }
}

function actionButton(label: string, attribute: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.setAttribute(attribute, '')
  button.textContent = label
  button.addEventListener('click', onClick)
  return button
}
