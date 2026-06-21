import type { EditorCore } from '../host'
import type { Field } from '../model/types'
import type { EditorState } from '../state/store'
import { fieldCommand, inspectorFields } from '../tools/inspector'
import type { PanelHandle } from './panel'

const TRANSFORM = new Set(['pos.x', 'pos.y', 'pos.z'])

function display(value: number | string): string {
  if (typeof value === 'string') return value
  return String(Math.round(value * 100) / 100)
}

function groupOf(field: Field): string {
  if (field.type !== 'number') return 'Metadata'
  return TRANSFORM.has(field.path) ? 'Transform' : 'Size'
}

export function mountInspector<Doc>(core: EditorCore<Doc>, parent: HTMLElement): PanelHandle<Doc> {
  const root = document.createElement('div')
  root.className = 'ed-panel ed-inspector'
  parent.append(root)

  function fieldRow(state: EditorState<Doc>, field: Field, step: number): HTMLElement {
    const row = document.createElement('label')
    row.className = 'ed-field'
    const name = document.createElement('span')
    name.className = 'ed-field-label'
    name.textContent = field.label
    const input = document.createElement('input')
    input.className = 'ed-field-num'
    input.dataset.field = field.path
    input.value = display(field.value)
    const commit = (value: number | string): void =>
      core.store.dispatch({ type: 'command', command: fieldCommand(state.selection, field, value) })
    input.addEventListener('change', () =>
      commit(field.type === 'number' ? Number(input.value) : input.value))
    row.append(name, input)

    if (field.type === 'number') {
      const steppers = document.createElement('span')
      steppers.className = 'ed-stepper'
      const up = document.createElement('button')
      up.type = 'button'
      up.dataset.step = 'up'
      up.textContent = '▲'
      const down = document.createElement('button')
      down.type = 'button'
      down.dataset.step = 'down'
      down.textContent = '▼'
      up.addEventListener('click', () => commit(Number(field.value) + step))
      down.addEventListener('click', () => commit(Number(field.value) - step))
      steppers.append(up, down)
      row.append(steppers)
    }
    return row
  }

  function update(state: EditorState<Doc>): void {
    root.replaceChildren()
    const head = document.createElement('div')
    head.className = 'ed-panel-head'
    const items = core.definition.scene.listItems(state.document.doc)
    if (state.selection.length === 1) {
      const item = items.find((candidate) => candidate.id === state.selection[0])
      head.textContent = item ? `${item.kind} · ${item.id}` : 'Inspector'
    } else if (state.selection.length > 1) {
      head.textContent = `${state.selection.length} selected`
    } else {
      head.textContent = 'Inspector'
    }
    root.append(head)

    // Snap-off still needs a useful numeric nudge in the inspector.
    const step = state.ui.snap > 0 ? state.ui.snap : 0.25
    const fields = inspectorFields(core.definition, state.document.doc, state.selection)
    let groupName = ''
    let group: HTMLDivElement | null = null
    for (const field of fields) {
      const name = groupOf(field)
      if (name !== groupName) {
        groupName = name
        const label = document.createElement('div')
        label.className = 'ed-group-label'
        label.textContent = name
        root.append(label)
        group = document.createElement('div')
        group.className = 'ed-field-group'
        root.append(group)
      }
      group!.append(fieldRow(state, field, step))
    }

    if (state.selection.length === 0) {
      const hint = document.createElement('p')
      hint.className = 'ed-hint'
      hint.textContent = 'Pick a tool and click the map to place - or click an item to select it.'
      root.append(hint)
    }
  }

  update(core.store.getState())
  return {
    update,
    dispose() { root.remove() }
  }
}
