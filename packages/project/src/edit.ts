import {
  componentInstanceSchema, entityDocumentSchema, projectManifestSchema,
  sceneDocumentSchema, resourceDocumentSchema, projectSnapshotSchema
} from './model'
import type { EntityDocument, ResourceDocument, SceneDocument, ProjectSnapshot } from './model'
import { indexComponents, indexResources } from './core'
import { collectReferences, validateProperty } from './schema'
import type { ObjectSchema } from './schema'
import type { GameProjectDefinition } from './registration'
import { insertAtPointer, moveAtPointer, removeAtPointer, setAtPointer } from './pointer'
import type { ProjectCommand, ProjectTarget } from './command'
import type { ZodType } from 'zod'

/**
 * The single immutable command reducer.
 *
 * `applyProjectCommand` locates targets by stable ID, enforces structural rules
 * (cardinality, cycles, entry-scene/reference protection), validates touched
 * component/resource data against its registered schema, and preserves the
 * original references for no-ops. Expected failures throw `ProjectCommandError`
 * with a stable `code` plus the offending `target`; because every input is
 * treated immutably, a thrown command never leaves a partially-mutated result.
 */

/** Thrown for an expected, located command failure. */
export class ProjectCommandError extends Error {
  constructor(message: string, readonly code: string, readonly target?: ProjectTarget) {
    super(message)
    this.name = 'ProjectCommandError'
  }
}

type AnyDefinition = GameProjectDefinition<unknown>

function formatIssues(issues: ReadonlyArray<{ pointer: string; code: string }>): string {
  return issues.map((issue) => `${issue.pointer || '/'} ${issue.code}`).join(', ')
}

function findScene(snapshot: ProjectSnapshot, sceneId: string): SceneDocument {
  const scene = snapshot.scenes[sceneId]
  if (!scene) throw new ProjectCommandError(`Unknown scene "${sceneId}"`, 'scene.missing')
  return scene
}

function replaceScene(snapshot: ProjectSnapshot, sceneId: string, scene: SceneDocument): ProjectSnapshot {
  return { ...snapshot, scenes: { ...snapshot.scenes, [sceneId]: scene } }
}

function findEntity(scene: SceneDocument, entityId: string): EntityDocument {
  const entity = scene.entities.find((candidate) => candidate.id === entityId)
  if (!entity) throw new ProjectCommandError(`Unknown entity "${entityId}"`, 'entity.missing')
  return entity
}

function findResource(snapshot: ProjectSnapshot, resourceId: string): ResourceDocument {
  const resource = snapshot.resources[resourceId]
  if (!resource) throw new ProjectCommandError(`Unknown resource "${resourceId}"`, 'resource.missing')
  return resource
}

function parseOrThrow<T>(schema: ZodType<T>, value: unknown, code: string, target?: ProjectTarget): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new ProjectCommandError(`Invalid ${code}: ${result.error.issues.map((i) => i.message).join('; ')}`, `${code}.invalid`, target)
  return result.data
}

/** Collect entity IDs strictly below `rootId` in the scene hierarchy. */
function descendantsOf(scene: SceneDocument, rootId: string): Set<string> {
  const childrenByParent = new Map<string, string[]>()
  for (const entity of scene.entities) {
    if (entity.parentId === undefined) continue
    const siblings = childrenByParent.get(entity.parentId) ?? []
    siblings.push(entity.id)
    childrenByParent.set(entity.parentId, siblings)
  }
  const out = new Set<string>()
  const queue = [rootId]
  while (queue.length > 0) {
    const current = queue.shift()!
    for (const child of childrenByParent.get(current) ?? []) {
      if (!out.has(child)) {
        out.add(child)
        queue.push(child)
      }
    }
  }
  return out
}

/** Resolve a property/array target into its editable base plus write-back/validate hooks. */
interface TargetView {
  base: unknown
  writeBack: (next: unknown) => ProjectSnapshot
  validate: (next: unknown) => void
}

function resolveTarget(definition: AnyDefinition, snapshot: ProjectSnapshot, target: ProjectTarget): TargetView {
  switch (target.kind) {
    case 'manifest':
      return {
        base: snapshot.manifest,
        writeBack: (next) => ({ ...snapshot, manifest: parseOrThrow(projectManifestSchema, next, 'manifest', target) }),
        validate: (next) => { parseOrThrow(projectManifestSchema, next, 'manifest', target) }
      }
    case 'scene': {
      const scene = findScene(snapshot, target.sceneId)
      return {
        base: scene,
        writeBack: (next) => replaceScene(snapshot, target.sceneId, parseOrThrow(sceneDocumentSchema, next, 'scene', target)),
        validate: (next) => { parseOrThrow(sceneDocumentSchema, next, 'scene', target) }
      }
    }
    case 'entity': {
      const scene = findScene(snapshot, target.sceneId)
      const entity = findEntity(scene, target.entityId)
      return {
        base: entity,
        writeBack: (next) => {
          const parsed = parseOrThrow(entityDocumentSchema, next, 'entity', target)
          return replaceScene(snapshot, target.sceneId, { ...scene, entities: scene.entities.map((e) => (e.id === entity.id ? parsed : e)) })
        },
        validate: (next) => { parseOrThrow(entityDocumentSchema, next, 'entity', target) }
      }
    }
    case 'component': {
      const scene = findScene(snapshot, target.sceneId)
      const entity = findEntity(scene, target.entityId)
      const component = entity.components.find((c) => c.id === target.componentId)
      if (!component) throw new ProjectCommandError(`Unknown component "${target.componentId}"`, 'component.missing', target)
      const registration = indexComponents(definition).get(component.typeId)
      return {
        base: component.data,
        writeBack: (next) => {
          const components = entity.components.map((c) => (c.id === component.id ? { ...c, data: next } : c))
          return replaceScene(snapshot, target.sceneId, { ...scene, entities: scene.entities.map((e) => (e.id === entity.id ? { ...entity, components } : e)) })
        },
        validate: (next) => assertSchemaData(registration?.schema, next, 'component', component.typeId, target)
      }
    }
    case 'resource': {
      const resource = findResource(snapshot, target.resourceId)
      const registration = indexResources(definition).get(resource.typeId)
      return {
        base: resource.data,
        writeBack: (next) => ({ ...snapshot, resources: { ...snapshot.resources, [resource.id]: { ...resource, data: next } } }),
        validate: (next) => assertSchemaData(registration?.schema, next, 'resource', resource.typeId, target)
      }
    }
  }
}

function assertSchemaData(schema: ObjectSchema | undefined, data: unknown, label: string, typeId: string, target: ProjectTarget): void {
  if (!schema) return
  const issues = validateProperty(schema, data)
  if (issues.length > 0) throw new ProjectCommandError(`Invalid ${label} data for "${typeId}": ${formatIssues(issues)}`, `${label}.invalid`, target)
}

function assertComponentData(definition: AnyDefinition, component: { typeId: string; data: unknown }, code: string): void {
  const registration = indexComponents(definition).get(component.typeId)
  if (!registration) return
  const issues = validateProperty(registration.schema, component.data)
  if (issues.length > 0) throw new ProjectCommandError(`Invalid component data for "${component.typeId}": ${formatIssues(issues)}`, code)
}

function assertResourceData(definition: AnyDefinition, resource: ResourceDocument, code: string): void {
  const registration = indexResources(definition).get(resource.typeId)
  if (!registration) return
  const issues = validateProperty(registration.schema, resource.data)
  if (issues.length > 0) throw new ProjectCommandError(`Invalid resource data for "${resource.typeId}": ${formatIssues(issues)}`, code)
}

/** All resource IDs referenced by any component or resource in the snapshot. */
function referencedResourceIds(definition: AnyDefinition, snapshot: ProjectSnapshot): Set<string> {
  const components = indexComponents(definition)
  const resources = indexResources(definition)
  const refs = new Set<string>()
  for (const scene of Object.values(snapshot.scenes)) {
    for (const entity of scene.entities) {
      for (const component of entity.components) {
        const registration = components.get(component.typeId)
        if (registration) for (const id of collectReferences(registration.schema, component.data, 'resource')) refs.add(id)
      }
    }
  }
  for (const resource of Object.values(snapshot.resources)) {
    const registration = resources.get(resource.typeId)
    if (registration) for (const id of collectReferences(registration.schema, resource.data, 'resource')) refs.add(id)
  }
  return refs
}

/** Apply one command to a snapshot, returning a new (or identical, for no-ops) snapshot. */
export function applyProjectCommand(definition: AnyDefinition, snapshot: ProjectSnapshot, command: ProjectCommand): ProjectSnapshot {
  switch (command.type) {
    case 'addScene': {
      if (snapshot.scenes[command.scene.id]) throw new ProjectCommandError(`Duplicate scene "${command.scene.id}"`, 'scene.duplicate')
      const scene = parseOrThrow(sceneDocumentSchema, command.scene, 'scene')
      return {
        ...snapshot,
        manifest: { ...snapshot.manifest, scenes: [...snapshot.manifest.scenes, { id: scene.id, path: command.path }] },
        scenes: { ...snapshot.scenes, [scene.id]: scene }
      }
    }
    case 'removeScene': {
      if (command.sceneId === snapshot.manifest.entrySceneId) throw new ProjectCommandError(`Cannot remove the entry scene "${command.sceneId}"`, 'scene.entryProtected')
      findScene(snapshot, command.sceneId)
      const scenes = { ...snapshot.scenes }
      delete scenes[command.sceneId]
      return {
        ...snapshot,
        manifest: { ...snapshot.manifest, scenes: snapshot.manifest.scenes.filter((entry) => entry.id !== command.sceneId) },
        scenes
      }
    }
    case 'addEntity': {
      const scene = findScene(snapshot, command.sceneId)
      const entity = parseOrThrow(entityDocumentSchema, command.entity, 'entity')
      if (scene.entities.some((e) => e.id === entity.id)) throw new ProjectCommandError(`Duplicate entity "${entity.id}"`, 'entity.duplicate')
      if (entity.parentId !== undefined && !scene.entities.some((e) => e.id === entity.parentId)) {
        throw new ProjectCommandError(`Unknown parent "${entity.parentId}"`, 'entity.missingParent')
      }
      assertEntityComponents(definition, entity)
      return replaceScene(snapshot, command.sceneId, { ...scene, entities: [...scene.entities, entity] })
    }
    case 'removeEntities': {
      const scene = findScene(snapshot, command.sceneId)
      if (command.entityIds.length === 0) return snapshot
      const remove = new Set<string>()
      for (const id of command.entityIds) {
        findEntity(scene, id)
        remove.add(id)
        for (const descendant of descendantsOf(scene, id)) remove.add(descendant)
      }
      return replaceScene(snapshot, command.sceneId, { ...scene, entities: scene.entities.filter((e) => !remove.has(e.id)) })
    }
    case 'reparentEntity': {
      const scene = findScene(snapshot, command.sceneId)
      const entity = findEntity(scene, command.entityId)
      if (command.parentId === entity.parentId) return snapshot
      if (command.parentId !== undefined) {
        if (command.parentId === command.entityId) throw new ProjectCommandError('An entity cannot parent itself (cycle)', 'entity.cycle')
        if (!scene.entities.some((e) => e.id === command.parentId)) throw new ProjectCommandError(`Unknown parent "${command.parentId}"`, 'entity.missingParent')
        if (descendantsOf(scene, command.entityId).has(command.parentId)) throw new ProjectCommandError('Reparenting would create a cycle', 'entity.cycle')
      }
      const next: EntityDocument = { ...entity, parentId: command.parentId }
      if (command.parentId === undefined) delete next.parentId
      return replaceScene(snapshot, command.sceneId, { ...scene, entities: scene.entities.map((e) => (e.id === entity.id ? next : e)) })
    }
    case 'addComponent': {
      const scene = findScene(snapshot, command.sceneId)
      const entity = findEntity(scene, command.entityId)
      const component = parseOrThrow(componentInstanceSchema, command.component, 'component')
      if (entity.components.some((c) => c.id === component.id)) throw new ProjectCommandError(`Duplicate component "${component.id}"`, 'component.duplicate')
      const registration = indexComponents(definition).get(component.typeId)
      if (registration) {
        const count = entity.components.filter((c) => c.typeId === component.typeId).length
        if (count + 1 > registration.cardinality.max) throw new ProjectCommandError(`Component "${component.typeId}" exceeds cardinality`, 'component.cardinality')
      }
      assertComponentData(definition, component, 'component.invalid')
      return replaceScene(snapshot, command.sceneId, { ...scene, entities: scene.entities.map((e) => (e.id === entity.id ? { ...entity, components: [...entity.components, component] } : e)) })
    }
    case 'removeComponent': {
      const scene = findScene(snapshot, command.sceneId)
      const entity = findEntity(scene, command.entityId)
      const component = entity.components.find((c) => c.id === command.componentId)
      if (!component) throw new ProjectCommandError(`Unknown component "${command.componentId}"`, 'component.missing')
      const registration = indexComponents(definition).get(component.typeId)
      if (registration) {
        const count = entity.components.filter((c) => c.typeId === component.typeId).length
        if (count - 1 < registration.cardinality.min) throw new ProjectCommandError(`Component "${component.typeId}" below minimum cardinality`, 'component.cardinality')
      }
      return replaceScene(snapshot, command.sceneId, { ...scene, entities: scene.entities.map((e) => (e.id === entity.id ? { ...entity, components: entity.components.filter((c) => c.id !== component.id) } : e)) })
    }
    case 'addResource': {
      if (snapshot.resources[command.resource.id]) throw new ProjectCommandError(`Duplicate resource "${command.resource.id}"`, 'resource.duplicate')
      const resource = parseOrThrow(resourceDocumentSchema, command.resource, 'resource')
      const registration = indexResources(definition).get(resource.typeId)
      if (registration?.singleton && Object.values(snapshot.resources).some((r) => r.typeId === resource.typeId)) {
        throw new ProjectCommandError(`Resource "${resource.typeId}" is a singleton`, 'resource.singleton')
      }
      assertResourceData(definition, resource, 'resource.invalid')
      return {
        ...snapshot,
        manifest: { ...snapshot.manifest, resources: [...snapshot.manifest.resources, { id: resource.id, typeId: resource.typeId, path: command.path }] },
        resources: { ...snapshot.resources, [resource.id]: resource }
      }
    }
    case 'removeResource': {
      findResource(snapshot, command.resourceId)
      if (referencedResourceIds(definition, snapshot).has(command.resourceId)) {
        throw new ProjectCommandError(`Resource "${command.resourceId}" is still referenced`, 'resource.referenced')
      }
      const resources = { ...snapshot.resources }
      delete resources[command.resourceId]
      return {
        ...snapshot,
        manifest: { ...snapshot.manifest, resources: snapshot.manifest.resources.filter((entry) => entry.id !== command.resourceId) },
        resources
      }
    }
    case 'setProperty': {
      const view = resolveTarget(definition, snapshot, command.target)
      const next = setAtPointer(view.base, command.pointer, command.value)
      if (next === view.base) return snapshot
      view.validate(next)
      return view.writeBack(next)
    }
    case 'insertArrayItem': {
      const view = resolveTarget(definition, snapshot, command.target)
      const next = insertAtPointer(view.base, command.pointer, command.index, command.value)
      view.validate(next)
      return view.writeBack(next)
    }
    case 'removeArrayItem': {
      const view = resolveTarget(definition, snapshot, command.target)
      const next = removeAtPointer(view.base, command.pointer, command.index)
      view.validate(next)
      return view.writeBack(next)
    }
    case 'moveArrayItem': {
      const view = resolveTarget(definition, snapshot, command.target)
      const next = moveAtPointer(view.base, command.pointer, command.from, command.to)
      if (next === view.base) return snapshot
      view.validate(next)
      return view.writeBack(next)
    }
    case 'loadSnapshot':
      return parseOrThrow(projectSnapshotSchema, command.snapshot, 'snapshot')
  }
}

function assertEntityComponents(definition: AnyDefinition, entity: EntityDocument): void {
  const counts = new Map<string, number>()
  const registry = indexComponents(definition)
  for (const component of entity.components) {
    counts.set(component.typeId, (counts.get(component.typeId) ?? 0) + 1)
    const registration = registry.get(component.typeId)
    if (registration) {
      if ((counts.get(component.typeId) ?? 0) > registration.cardinality.max) {
        throw new ProjectCommandError(`Component "${component.typeId}" exceeds cardinality`, 'component.cardinality')
      }
      const issues = validateProperty(registration.schema, component.data)
      if (issues.length > 0) throw new ProjectCommandError(`Invalid component data for "${component.typeId}": ${formatIssues(issues)}`, 'component.invalid')
    }
  }
}

/** Reduce a list of commands; throws on the first failure, leaving inputs untouched. */
export function applyProjectCommands(definition: AnyDefinition, snapshot: ProjectSnapshot, commands: readonly ProjectCommand[]): ProjectSnapshot {
  return commands.reduce((current, command) => applyProjectCommand(definition, current, command), snapshot)
}
