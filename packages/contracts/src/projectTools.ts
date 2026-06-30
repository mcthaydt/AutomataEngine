import { projectCommandSchema } from '@automata/project'
import { z } from 'zod'
import { projectEvaluationOptionsSchema } from './projectEval'
import type { ToolResult } from './tools'

export type ProjectToolName =
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

const PROJECT_TOOL_NAMES: readonly ProjectToolName[] = [
  'addEntity', 'removeEntities', 'reparentEntity', 'addComponent', 'removeComponent',
  'addResource', 'removeResource', 'setProperty', 'insertArrayItem', 'removeArrayItem',
  'moveArrayItem', 'getProject', 'getHierarchy', 'getResources', 'validate', 'evaluate'
]

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
export const projectToolArgSchemas = {
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
} as const satisfies Record<ProjectToolName, z.ZodType>

const PROJECT_TOOL_DESCRIPTIONS: Record<ProjectToolName, string> = {
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

export interface ProjectToolDef {
  name: ProjectToolName
  description: string
  schema: unknown
}

export type ProjectResourceUri =
  | 'editor://project'
  | 'editor://hierarchy'
  | 'editor://resources'
  | 'editor://validation'
  | 'editor://baseline'

export const PROJECT_RESOURCE_URIS = {
  project: 'editor://project',
  hierarchy: 'editor://hierarchy',
  resources: 'editor://resources',
  validation: 'editor://validation',
  baseline: 'editor://baseline'
} as const satisfies Record<string, ProjectResourceUri>

/** Generic project host consumed by providers and protocol adapters. */
export interface ProjectToolHost {
  listTools(): ProjectToolDef[]
  executeTool(name: ProjectToolName, args: unknown): Promise<ToolResult>
  readResource(uri: ProjectResourceUri): Promise<unknown>
}

export function projectToolDefs(): ProjectToolDef[] {
  return PROJECT_TOOL_NAMES.map((name) => ({
    name,
    description: PROJECT_TOOL_DESCRIPTIONS[name],
    schema: z.toJSONSchema(projectToolArgSchemas[name])
  }))
}

export function parseProjectToolArgs(name: ProjectToolName, args: unknown): unknown {
  const schema: z.ZodType | undefined = projectToolArgSchemas[name]
  if (!schema) throw new Error(`Unknown project tool "${name}"`)
  return schema.parse(args)
}
