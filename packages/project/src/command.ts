import { z } from 'zod'
import {
  componentInstanceSchema, entityDocumentSchema, resourceDocumentSchema,
  sceneDocumentSchema, projectSnapshotSchema, projectIdSchema, projectPathSchema
} from './model'
import type { ComponentInstance, EntityDocument, ResourceDocument, SceneDocument, ProjectSnapshot } from './model'

/**
 * The zod-backed command contract.
 *
 * Every authoring mutation — from the editor, the agent, or an MCP client — is
 * expressed as one of these commands so the immutable reducer (`edit.ts`) is the
 * single place that knows how to change a project. The schema doubles as the
 * wire format shared through `@automata/contracts`.
 */

/** Where a property/array edit is applied. */
export const projectTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('manifest') }),
  z.object({ kind: z.literal('scene'), sceneId: projectIdSchema }),
  z.object({ kind: z.literal('entity'), sceneId: projectIdSchema, entityId: projectIdSchema }),
  z.object({ kind: z.literal('component'), sceneId: projectIdSchema, entityId: projectIdSchema, componentId: projectIdSchema }),
  z.object({ kind: z.literal('resource'), resourceId: projectIdSchema })
])

const pointerSchema = z.string()
const arrayIndexSchema = z.number().int().min(0)

export const projectCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('addScene'), scene: sceneDocumentSchema, path: projectPathSchema }),
  z.object({ type: z.literal('removeScene'), sceneId: projectIdSchema }),
  z.object({ type: z.literal('addEntity'), sceneId: projectIdSchema, entity: entityDocumentSchema }),
  z.object({ type: z.literal('removeEntities'), sceneId: projectIdSchema, entityIds: z.array(projectIdSchema) }),
  z.object({ type: z.literal('reparentEntity'), sceneId: projectIdSchema, entityId: projectIdSchema, parentId: projectIdSchema.optional() }),
  z.object({ type: z.literal('addComponent'), sceneId: projectIdSchema, entityId: projectIdSchema, component: componentInstanceSchema }),
  z.object({ type: z.literal('removeComponent'), sceneId: projectIdSchema, entityId: projectIdSchema, componentId: projectIdSchema }),
  z.object({ type: z.literal('addResource'), resource: resourceDocumentSchema, path: projectPathSchema }),
  z.object({ type: z.literal('removeResource'), resourceId: projectIdSchema }),
  z.object({ type: z.literal('setProperty'), target: projectTargetSchema, pointer: pointerSchema, value: z.unknown() }),
  z.object({ type: z.literal('insertArrayItem'), target: projectTargetSchema, pointer: pointerSchema, index: arrayIndexSchema, value: z.unknown() }),
  z.object({ type: z.literal('removeArrayItem'), target: projectTargetSchema, pointer: pointerSchema, index: arrayIndexSchema }),
  z.object({ type: z.literal('moveArrayItem'), target: projectTargetSchema, pointer: pointerSchema, from: arrayIndexSchema, to: arrayIndexSchema }),
  z.object({ type: z.literal('loadSnapshot'), snapshot: projectSnapshotSchema })
])

/** A target for property/array edits, discriminated by `kind`. */
export type ProjectTarget =
  | { kind: 'manifest' }
  | { kind: 'scene'; sceneId: string }
  | { kind: 'entity'; sceneId: string; entityId: string }
  | { kind: 'component'; sceneId: string; entityId: string; componentId: string }
  | { kind: 'resource'; resourceId: string }

/** The closed set of authoring mutations. */
export type ProjectCommand =
  | { type: 'addScene'; scene: SceneDocument; path: string }
  | { type: 'removeScene'; sceneId: string }
  | { type: 'addEntity'; sceneId: string; entity: EntityDocument }
  | { type: 'removeEntities'; sceneId: string; entityIds: string[] }
  | { type: 'reparentEntity'; sceneId: string; entityId: string; parentId?: string }
  | { type: 'addComponent'; sceneId: string; entityId: string; component: ComponentInstance }
  | { type: 'removeComponent'; sceneId: string; entityId: string; componentId: string }
  | { type: 'addResource'; resource: ResourceDocument; path: string }
  | { type: 'removeResource'; resourceId: string }
  | { type: 'setProperty'; target: ProjectTarget; pointer: string; value: unknown }
  | { type: 'insertArrayItem'; target: ProjectTarget; pointer: string; index: number; value: unknown }
  | { type: 'removeArrayItem'; target: ProjectTarget; pointer: string; index: number }
  | { type: 'moveArrayItem'; target: ProjectTarget; pointer: string; from: number; to: number }
  | { type: 'loadSnapshot'; snapshot: ProjectSnapshot }
