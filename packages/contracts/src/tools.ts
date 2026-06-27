import { z } from 'zod'
import {
  addItemSchema,
  moveSelectedSchema,
  setItemFieldSchema,
  setSurfaceSchema,
  setMetadataSchema,
  deleteItemsSchema
} from './command'

export type ToolName =
  | 'addItem'
  | 'moveSelected'
  | 'setItemField'
  | 'setSurface'
  | 'setMetadata'
  | 'deleteItems'
  | 'getDoc'
  | 'listItems'
  | 'validate'
  | 'testPlay'

/** Arg schema per tool. Write tools = command schema minus its `type` discriminant. */
export const toolArgSchemas = {
  addItem: addItemSchema.omit({ type: true }),
  moveSelected: moveSelectedSchema.omit({ type: true }),
  setItemField: setItemFieldSchema.omit({ type: true }),
  setSurface: setSurfaceSchema.omit({ type: true }),
  setMetadata: setMetadataSchema.omit({ type: true }),
  deleteItems: deleteItemsSchema.omit({ type: true }),
  getDoc: z.object({}),
  listItems: z.object({}),
  validate: z.object({}),
  testPlay: z.object({ maxSteps: z.number().int().positive() })
} as const

const TOOL_DESCRIPTIONS: Record<ToolName, string> = {
  addItem: 'Add a placeable item (geometry, archetype, or marker) to the level.',
  moveSelected: 'Move the given items by a delta vector.',
  setItemField: 'Set a single field (by dotted path) on one item.',
  setSurface: 'Set an item\'s surface (color or texture).',
  setMetadata: 'Set a document-level metadata field by dotted path.',
  deleteItems: 'Delete the given items from the level.',
  getDoc: 'Read the current level document.',
  listItems: 'List all placeable items in the current level.',
  validate: 'Validate the current level and return any issues.',
  testPlay: 'Run a deterministic headless play and return TestPlayResult metrics.'
}

export interface ToolDef {
  name: ToolName
  description: string
  /** JSON Schema (from z.toJSONSchema) for the tool's arguments. */
  schema: unknown
}

export interface ToolResult {
  ok: boolean
  content: unknown
  isError?: boolean
}

export type ResourceUri = 'editor://doc' | 'editor://items' | 'editor://validation' | 'editor://baseline'

export const RESOURCE_URIS = {
  doc: 'editor://doc',
  items: 'editor://items',
  validation: 'editor://validation',
  baseline: 'editor://baseline'
} as const satisfies Record<string, ResourceUri>

/** A host that exposes the editor's command/eval surface as tools + resources. */
export interface ToolHost {
  listTools(): ToolDef[]
  executeTool(name: ToolName, args: unknown): Promise<ToolResult>
  readResource(uri: ResourceUri): Promise<unknown>
}

export function toolDefs(): ToolDef[] {
  return (Object.keys(toolArgSchemas) as ToolName[]).map((name) => ({
    name,
    description: TOOL_DESCRIPTIONS[name],
    schema: z.toJSONSchema(toolArgSchemas[name])
  }))
}

export function parseToolArgs(name: ToolName, args: unknown): unknown {
  return toolArgSchemas[name].parse(args)
}
