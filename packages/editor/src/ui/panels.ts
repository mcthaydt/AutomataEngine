import type { EditorCore } from '../host'
import { validateDoc } from '../io/validation'
import { fieldCommand, inspectorFields } from '../tools/inspector'

/** Renders palette, inspector, and validation panels bound to the store. */
export function renderPanels<Doc>(core: EditorCore<Doc>, host: HTMLElement): () => void {
  const definition = core.definition
  const palette = document.createElement('div')
  palette.className = 'panel palette'
  const inspector = document.createElement('div')
  inspector.className = 'panel inspector'
  const validation = document.createElement('div')
  validation.className = 'panel validation'
  validation.setAttribute('data-validation', '')
  host.append(palette, inspector, validation)

  const brushes = [...definition.palette.geometry, ...definition.palette.archetypes, ...definition.palette.markers]
  for (const brush of brushes) {
    const button = document.createElement('button')
    button.textContent = brush.label
    button.setAttribute('data-brush', brush.id)
    button.addEventListener('click', () => {
      core.store.dispatch({ type: 'setTool', tool: { brushId: brush.id, mode: 'place' } })
    })
    palette.append(button)
  }

  function renderInspectorAndValidation(): void {
    const state = core.store.getState()
    inspector.replaceChildren()
    for (const field of inspectorFields(definition, state.document.doc, state.selection)) {
      const input = document.createElement('input')
      input.value = String(field.value)
      input.setAttribute('data-field', field.path)
      input.addEventListener('change', () => {
        const value = field.type === 'number' ? Number(input.value) : input.value
        core.store.dispatch({ type: 'command', command: fieldCommand(state.selection, field, value) })
      })
      const label = document.createElement('label')
      label.textContent = field.label
      label.append(input)
      inspector.append(label)
    }

    const result = validateDoc(definition, state.document.doc)
    validation.textContent = result.exportable ? 'Valid' : result.issues.join(' · ')
  }

  renderInspectorAndValidation()
  const unsubscribe = core.store.subscribe(renderInspectorAndValidation)
  return () => {
    unsubscribe()
    palette.remove()
    inspector.remove()
    validation.remove()
  }
}
