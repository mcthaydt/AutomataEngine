import type { GameDefinition } from '../model/gameDefinition'
import type { Field, SceneCommand } from '../model/types'

export function inspectorFields<Doc>(
  definition: GameDefinition<Doc>,
  doc: Doc,
  selection: string[]
): Field[] {
  if (selection.length !== 1) return definition.scene.metadataFields(doc)
  const item = definition.scene.listItems(doc).find((candidate) => candidate.id === selection[0])
  if (!item) return definition.scene.metadataFields(doc)

  const position = item.transform.position
  const fields: Field[] = [
    { path: 'pos.x', label: 'X', type: 'number', value: position.x },
    { path: 'pos.y', label: 'Y', type: 'number', value: position.y },
    { path: 'pos.z', label: 'Z', type: 'number', value: position.z }
  ]

  if (item.shape.type === 'box') {
    fields.push(
      { path: 'size.x', label: 'Width', type: 'number', value: item.shape.size.x },
      { path: 'size.y', label: 'Height', type: 'number', value: item.shape.size.y },
      { path: 'size.z', label: 'Depth', type: 'number', value: item.shape.size.z }
    )
  } else if (item.shape.type === 'cylinder') {
    fields.push(
      { path: 'radius', label: 'Radius', type: 'number', value: item.shape.radius },
      { path: 'height', label: 'Height', type: 'number', value: item.shape.height }
    )
  }

  return fields
}

export function fieldCommand(selection: string[], field: Field, value: number | string): SceneCommand {
  if (
    selection.length === 1 &&
    (
      field.path.startsWith('pos.') ||
      field.path.startsWith('size.') ||
      field.path === 'radius' ||
      field.path === 'height'
    )
  ) {
    return { type: 'setItemField', id: selection[0]!, path: field.path, value }
  }
  return { type: 'setMetadata', path: field.path, value }
}
