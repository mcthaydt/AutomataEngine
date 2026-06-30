import { projectCommandSchema } from '@automata/project'
import { z } from 'zod'
import { projectEvaluationOptionsSchema } from './eval'

export type ToolName =
  | 'addEntity'
  | 'removeEntities'
  | 'reparentEntity'
  | 'addComponent'
  | 'removeComponent'
  | 'addResource'
  | 'removeResource'
  | 'setProperty'
  | 'insertArrayItem'
  | 'removeArrayItem'
  | 'moveArrayItem'
  | 'getProject'
  | 'getHierarchy'
  | 'getResources'
  | 'validate'
  | 'evaluate'

/** RFC 6901 pointer, including the empty pointer for a document root. */
const jsonPointerSchema = z.string().regex(/^(?:|(?:\/(?:[^~]|~[01])*)*)$/)

function commandArgs(type: string): z.ZodObject {
  // The discriminated union holds heterogeneous object shapes. Erase that
  // option union only after selecting by its literal discriminator so Zod's
  // generic `omit` overload has one callable object-schema signature.
  const schema = projectCommandSchema.options.find(
    (option) => option.shape.type.value === type
  ) as z.ZodObject | undefined
  if (!schema) throw new Error(`Missing project command schema for "${type}"`)
  return schema.omit({ type: true })
}

function pointerCommandArgs(type: string): z.ZodObject {
  return commandArgs(type).extend({ pointer: jsonPointerSchema })
}

/** Argument schemas stay derived from project commands while omitting wire discriminants. */
export const toolArgSchemas = {
  addEntity: commandArgs('addEntity'),
  removeEntities: commandArgs('removeEntities'),
  reparentEntity: commandArgs('reparentEntity'),
  addComponent: commandArgs('addComponent'),
  removeComponent: commandArgs('removeComponent'),
  addResource: commandArgs('addResource'),
  removeResource: commandArgs('removeResource'),
  setProperty: pointerCommandArgs('setProperty'),
  insertArrayItem: pointerCommandArgs('insertArrayItem'),
  removeArrayItem: pointerCommandArgs('removeArrayItem'),
  moveArrayItem: pointerCommandArgs('moveArrayItem'),
  getProject: z.object({}),
  getHierarchy: z.object({}),
  getResources: z.object({}),
  validate: z.object({}),
  evaluate: projectEvaluationOptionsSchema
} as const satisfies Record<ToolName, z.ZodType>

/** Derived from the schema map so a new tool can never be silently left unadvertised. */
const TOOL_NAMES = Object.keys(toolArgSchemas) as ToolName[]

const TOOL_DESCRIPTIONS: Record<ToolName, string> = {
  addEntity: 'Add an entity to a project scene.',
  removeEntities: 'Remove entities and their descendants from a project scene.',
  reparentEntity: 'Change an entity parent within a project scene.',
  addComponent: 'Add a typed component to an entity.',
  removeComponent: 'Remove a component from an entity.',
  addResource: 'Add a typed resource document to the project.',
  removeResource: 'Remove an unreferenced resource document from the project.',
  setProperty: 'Set a property on a project, scene, entity, component, or resource target.',
  insertArrayItem: 'Insert an item into an array property.',
  removeArrayItem: 'Remove an item from an array property.',
  moveArrayItem: 'Reorder an item within an array property.',
  getProject: 'Read the current project snapshot.',
  getHierarchy: 'Read scenes, entities, and component type IDs in stable project order.',
  getResources: 'Read resource documents in manifest order.',
  validate: 'Validate the current project and return structured issues.',
  evaluate: 'Evaluate the current project and return normalized score metrics.'
}

export interface ToolDef {
  name: ToolName
  description: string
  schema: unknown
}

export interface ToolResult {
  ok: boolean
  content: unknown
  isError?: boolean
}

export type ResourceUri =
  | 'editor://project'
  | 'editor://hierarchy'
  | 'editor://resources'
  | 'editor://validation'
  | 'editor://baseline'

export const RESOURCE_URIS = {
  project: 'editor://project',
  hierarchy: 'editor://hierarchy',
  resources: 'editor://resources',
  validation: 'editor://validation',
  baseline: 'editor://baseline'
} as const satisfies Record<string, ResourceUri>

/** Generic project host consumed by providers and protocol adapters. */
export interface ToolHost {
  listTools(): ToolDef[]
  executeTool(name: ToolName, args: unknown): Promise<ToolResult>
  readResource(uri: ResourceUri): Promise<unknown>
}

export function toolDefs(): ToolDef[] {
  return TOOL_NAMES.map((name) => ({
    name,
    description: TOOL_DESCRIPTIONS[name],
    schema: z.toJSONSchema(toolArgSchemas[name])
  }))
}

export function parseToolArgs(name: ToolName, args: unknown): unknown {
  const schema: z.ZodType | undefined = toolArgSchemas[name]
  if (!schema) throw new Error(`Unknown project tool "${name}"`)
  return schema.parse(args)
}
