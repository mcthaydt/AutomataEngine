import {
  escapePointerToken,
  type ObjectSchema, type ProjectCommand, type ProjectTarget, type PropertySchema, type ReferenceProperty
} from '@automata/project'
import { mountPropertyTable } from './propertyTable'

/**
 * Schema-generated property controls.
 *
 * Every control is produced solely from a `PropertySchema`, so the editor never
 * knows about any game. A leaf change emits exactly one `setProperty` command at
 * the field's JSON Pointer; objects recurse into nested groups (extending the
 * pointer) and arrays delegate to the table/list control.
 */

export interface ReferenceOption { id: string; label: string }

export interface PropertyControlOptions {
  schema: PropertySchema | ObjectSchema
  value: unknown
  pointer: string
  target: ProjectTarget
  dispatch: (command: ProjectCommand) => void
  referenceOptions?: (field: ReferenceProperty) => ReferenceOption[]
  /** Suppress the field label (used inside table cells). */
  hideLabel?: boolean
}

export interface PropertyControlHandle {
  element: HTMLElement
  dispose(): void
}

export function mountPropertyControl(parent: HTMLElement, options: PropertyControlOptions): PropertyControlHandle {
  const element = build(options)
  parent.append(element)
  return { element, dispose() { element.remove() } }
}

function build(options: PropertyControlOptions): HTMLElement {
  const { schema } = options
  switch (schema.kind) {
    case 'number': return field(options, numberInput(options, schema))
    case 'string': return field(options, stringInput(options, schema))
    case 'boolean': return field(options, booleanInput(options))
    case 'enum': return field(options, enumInput(options, schema))
    case 'color': return field(options, colorInput(options))
    case 'reference': return field(options, referenceInput(options, schema))
    case 'vec3': return vec3Group(options)
    case 'object': return objectGroup(options, schema)
    case 'array': return arrayControl(options, schema)
  }
}

function emit(options: PropertyControlOptions, pointer: string, value: unknown): void {
  options.dispatch({ type: 'setProperty', target: options.target, pointer, value })
}

/** A labelled row wrapper carrying the field's pointer for tests/styling. */
function field(options: PropertyControlOptions, control: HTMLElement): HTMLElement {
  const wrap = document.createElement('label')
  wrap.className = 'ed-field'
  wrap.dataset.prop = options.pointer
  const label = options.hideLabel ? undefined : labelOf(options.schema)
  if (label) {
    const span = document.createElement('span')
    span.className = 'ed-field-label'
    span.textContent = label
    wrap.append(span)
  }
  wrap.append(control)
  return wrap
}

function labelOf(schema: PropertySchema | ObjectSchema): string | undefined {
  return 'label' in schema ? schema.label : undefined
}

function numberInput(options: PropertyControlOptions, schema: Extract<PropertySchema, { kind: 'number' }>): HTMLInputElement {
  const input = document.createElement('input')
  input.type = 'text'
  input.inputMode = 'decimal'
  input.className = 'ed-field-num'
  input.value = String(options.value ?? '')
  input.addEventListener('change', () => {
    const raw = Number(input.value.trim())
    if (input.value.trim() === '' || !Number.isFinite(raw)) {
      input.setAttribute('aria-invalid', 'true')
      return
    }
    input.removeAttribute('aria-invalid')
    let value = raw
    if (schema.min !== undefined) value = Math.max(schema.min, value)
    if (schema.max !== undefined) value = Math.min(schema.max, value)
    emit(options, options.pointer, value)
  })
  return input
}

function stringInput(options: PropertyControlOptions, schema: Extract<PropertySchema, { kind: 'string' }>): HTMLElement {
  const input = schema.multiline ? document.createElement('textarea') : document.createElement('input')
  if (input instanceof HTMLInputElement) input.type = 'text'
  input.className = 'ed-field-text'
  input.value = String(options.value ?? '')
  input.addEventListener('change', () => emit(options, options.pointer, input.value))
  return input
}

function booleanInput(options: PropertyControlOptions): HTMLInputElement {
  const input = document.createElement('input')
  input.type = 'checkbox'
  input.checked = options.value === true
  input.addEventListener('change', () => emit(options, options.pointer, input.checked))
  return input
}

function enumInput(options: PropertyControlOptions, schema: Extract<PropertySchema, { kind: 'enum' }>): HTMLSelectElement {
  const select = document.createElement('select')
  for (const value of schema.values) {
    const option = document.createElement('option')
    option.value = value
    option.textContent = value
    select.append(option)
  }
  select.value = String(options.value ?? '')
  select.addEventListener('change', () => emit(options, options.pointer, select.value))
  return select
}

function colorInput(options: PropertyControlOptions): HTMLInputElement {
  const input = document.createElement('input')
  input.type = 'color'
  input.value = String(options.value ?? '#000000')
  input.addEventListener('change', () => emit(options, options.pointer, input.value))
  return input
}

function referenceInput(options: PropertyControlOptions, schema: ReferenceProperty): HTMLSelectElement {
  const select = document.createElement('select')
  if (!schema.required) {
    const blank = document.createElement('option')
    blank.value = ''
    blank.textContent = '(none)'
    select.append(blank)
  }
  for (const choice of options.referenceOptions?.(schema) ?? []) {
    const option = document.createElement('option')
    option.value = choice.id
    option.textContent = choice.label
    select.append(option)
  }
  select.value = String(options.value ?? '')
  select.addEventListener('change', () => emit(options, options.pointer, select.value))
  return select
}

function vec3Group(options: PropertyControlOptions): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'ed-field ed-vec3'
  wrap.dataset.prop = options.pointer
  const label = options.hideLabel ? undefined : labelOf(options.schema)
  if (label) {
    const span = document.createElement('span')
    span.className = 'ed-field-label'
    span.textContent = label
    wrap.append(span)
  }
  const value = (options.value ?? { x: 0, y: 0, z: 0 }) as { x?: number; y?: number; z?: number }
  for (const axis of ['x', 'y', 'z'] as const) {
    const input = document.createElement('input')
    input.type = 'text'
    input.inputMode = 'decimal'
    input.className = 'ed-field-num'
    input.dataset.axis = axis
    input.value = String(value[axis] ?? 0)
    input.addEventListener('change', () => {
      const raw = Number(input.value.trim())
      if (input.value.trim() === '' || !Number.isFinite(raw)) {
        input.setAttribute('aria-invalid', 'true')
        return
      }
      input.removeAttribute('aria-invalid')
      emit(options, `${options.pointer}/${axis}`, raw)
    })
    wrap.append(input)
  }
  return wrap
}

function objectGroup(options: PropertyControlOptions, schema: ObjectSchema): HTMLElement {
  const group = document.createElement('div')
  group.className = 'ed-prop-group'
  group.dataset.prop = options.pointer
  const value = (options.value ?? {}) as Record<string, unknown>
  for (const child of schema.fields) {
    if (child.key === undefined) continue
    group.append(build({
      ...options,
      schema: child,
      value: value[child.key],
      pointer: `${options.pointer}/${escapePointerToken(child.key)}`,
      hideLabel: false
    }))
  }
  return group
}

function arrayControl(options: PropertyControlOptions, schema: Extract<PropertySchema, { kind: 'array' }>): HTMLElement {
  const wrap = document.createElement('div')
  wrap.dataset.prop = options.pointer
  mountPropertyTable(wrap, {
    schema,
    value: Array.isArray(options.value) ? options.value : [],
    pointer: options.pointer,
    target: options.target,
    dispatch: options.dispatch,
    referenceOptions: options.referenceOptions
  })
  return wrap
}
