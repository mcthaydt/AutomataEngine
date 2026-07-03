import { indexComponents, indexResources } from './core'
import { escapePointerToken } from './pointer'
import { isSafeProjectPath } from './files'
import type { ObjectSchema, PropertySchema, ReferenceProperty } from './schema'
import type { ProjectSnapshot, SceneDocument } from './model'
import { validateSpecData } from './registration'
import type { ComponentTypeRegistration, GameProjectDefinition, ResourceTypeRegistration, ValidationIssue } from './registration'

/**
 * Layered project validation.
 *
 * Runs in a fixed order so issues are stable and informative: format/identity
 * and path checks first, then schema/registration checks, then hierarchy and
 * reference resolution, then the game's own `validate`, and finally a compile
 * preflight (only attempted when nothing else errored). Issues are sorted by
 * severity, then location IDs, then pointer and code for deterministic UI/tests.
 */
export function validateProject<Compiled>(definition: GameProjectDefinition<Compiled>, snapshot: ProjectSnapshot): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const components = indexComponents(definition)
  const resources = indexResources(definition)

  validateManifest(snapshot, definition, issues)
  validateRegistration(snapshot, components, resources, issues)
  validateHierarchyAndReferences(snapshot, components, resources, issues)
  issues.push(...definition.validate(snapshot))

  if (!issues.some((issue) => issue.severity === 'error')) {
    try {
      definition.compile(snapshot)
    } catch (error) {
      issues.push({ severity: 'error', code: 'compile.failed', message: error instanceof Error ? error.message : String(error) })
    }
  }

  return issues.sort(compareIssues)
}

// --- Layer 1: format / identity / paths -------------------------------------

function validateManifest(snapshot: ProjectSnapshot, definition: GameProjectDefinition<unknown>, issues: ValidationIssue[]): void {
  const { manifest } = snapshot
  if (manifest.gameId !== definition.gameId) {
    issues.push({ severity: 'error', code: 'manifest.gameId', message: `Manifest gameId "${manifest.gameId}" does not match "${definition.gameId}"` })
  }
  if (!snapshot.scenes[manifest.entrySceneId] || !manifest.scenes.some((entry) => entry.id === manifest.entrySceneId)) {
    issues.push({ severity: 'error', code: 'manifest.entryScene', message: `Entry scene "${manifest.entrySceneId}" is missing` })
  }

  reconcile(manifest.scenes, Object.keys(snapshot.scenes), 'Scene', 'manifest.sceneMismatch', 'manifest.duplicateScene', issues)
  reconcile(manifest.resources, Object.keys(snapshot.resources), 'Resource', 'manifest.resourceMismatch', 'manifest.duplicateResource', issues)

  for (const entry of [...manifest.scenes, ...manifest.resources]) {
    if (!isSafeProjectPath(entry.path)) issues.push({ severity: 'error', code: 'manifest.path', message: `Unsafe manifest path "${entry.path}"` })
  }
  for (const entry of manifest.resources) {
    const resource = snapshot.resources[entry.id]
    if (resource && resource.typeId !== entry.typeId) {
      issues.push({ severity: 'error', code: 'manifest.resourceMismatch', message: `Resource "${entry.id}" type "${resource.typeId}" differs from manifest "${entry.typeId}"`, resourceId: entry.id })
    }
  }
}

function reconcile(entries: ReadonlyArray<{ id: string }>, mapKeys: string[], label: string, mismatchCode: string, duplicateCode: string, issues: ValidationIssue[]): void {
  const seen = new Set<string>()
  const manifestIds = new Set<string>()
  for (const entry of entries) {
    if (seen.has(entry.id)) issues.push({ severity: 'error', code: duplicateCode, message: `${label} "${entry.id}" listed twice in the manifest` })
    seen.add(entry.id)
    manifestIds.add(entry.id)
    if (!mapKeys.includes(entry.id)) issues.push({ severity: 'error', code: mismatchCode, message: `${label} "${entry.id}" is in the manifest but has no document` })
  }
  for (const key of mapKeys) {
    if (!manifestIds.has(key)) issues.push({ severity: 'error', code: mismatchCode, message: `${label} "${key}" has a document but is not in the manifest` })
  }
}

// --- Layer 2: schema / registration -----------------------------------------

function validateRegistration(
  snapshot: ProjectSnapshot,
  components: Map<string, ComponentTypeRegistration>,
  resources: Map<string, ResourceTypeRegistration>,
  issues: ValidationIssue[]
): void {
  for (const [sceneId, scene] of Object.entries(snapshot.scenes)) {
    const entityIds = new Set<string>()
    for (const entity of scene.entities) {
      if (entityIds.has(entity.id)) issues.push({ severity: 'error', code: 'entity.duplicateId', message: `Duplicate entity id "${entity.id}"`, sceneId, entityId: entity.id })
      entityIds.add(entity.id)

      const componentIds = new Set<string>()
      const typeCounts = new Map<string, number>()
      for (const component of entity.components) {
        if (componentIds.has(component.id)) issues.push({ severity: 'error', code: 'component.duplicateId', message: `Duplicate component id "${component.id}"`, sceneId, entityId: entity.id, componentId: component.id })
        componentIds.add(component.id)

        const registration = components.get(component.typeId)
        if (!registration) {
          issues.push({ severity: 'error', code: 'component.unknownType', message: `Unknown component type "${component.typeId}"`, sceneId, entityId: entity.id, componentId: component.id })
          continue
        }
        typeCounts.set(component.typeId, (typeCounts.get(component.typeId) ?? 0) + 1)
        for (const issue of validateSpecData(registration, component.data)) {
          issues.push({ severity: 'error', code: issue.code, message: issue.message, sceneId, entityId: entity.id, componentId: component.id, pointer: issue.pointer })
        }
      }
      for (const [typeId, count] of typeCounts) {
        const registration = components.get(typeId)!
        if (count > registration.cardinality.max) {
          issues.push({ severity: 'error', code: 'component.cardinality', message: `Entity has ${count} "${typeId}" components (max ${registration.cardinality.max})`, sceneId, entityId: entity.id })
        }
      }
    }
  }

  const resourceTypeCounts = new Map<string, number>()
  for (const [resourceId, resource] of Object.entries(snapshot.resources)) {
    const registration = resources.get(resource.typeId)
    if (!registration) {
      issues.push({ severity: 'error', code: 'resource.unknownType', message: `Unknown resource type "${resource.typeId}"`, resourceId })
      continue
    }
    resourceTypeCounts.set(resource.typeId, (resourceTypeCounts.get(resource.typeId) ?? 0) + 1)
    for (const issue of validateSpecData(registration, resource.data)) {
      issues.push({ severity: 'error', code: issue.code, message: issue.message, resourceId, pointer: issue.pointer })
    }
  }
  for (const [typeId, count] of resourceTypeCounts) {
    if (resources.get(typeId)?.singleton && count > 1) {
      issues.push({ severity: 'error', code: 'resource.singleton', message: `Singleton resource type "${typeId}" has ${count} documents` })
    }
  }
}

// --- Layer 3: hierarchy / references ----------------------------------------

function validateHierarchyAndReferences(
  snapshot: ProjectSnapshot,
  components: Map<string, ComponentTypeRegistration>,
  resources: Map<string, ResourceTypeRegistration>,
  issues: ValidationIssue[]
): void {
  for (const [sceneId, scene] of Object.entries(snapshot.scenes)) {
    const sceneEntityIds = new Set(scene.entities.map((entity) => entity.id))
    for (const entity of scene.entities) {
      if (entity.parentId !== undefined && !sceneEntityIds.has(entity.parentId)) {
        issues.push({ severity: 'error', code: 'entity.missingParent', message: `Entity "${entity.id}" references missing parent "${entity.parentId}"`, sceneId, entityId: entity.id })
      }
    }
    for (const entityId of cyclicEntities(scene)) {
      issues.push({ severity: 'error', code: 'entity.cycle', message: `Entity "${entityId}" is part of a parent cycle`, sceneId, entityId })
    }
    for (const entity of scene.entities) {
      for (const component of entity.components) {
        const registration = components.get(component.typeId)
        if (!registration) continue
        forEachReference(registration.schema, component.data, '', (pointer, field, value) => {
          resolveReference(field, value, snapshot, sceneEntityIds, issues, { sceneId, entityId: entity.id, componentId: component.id, pointer })
        })
      }
    }
  }

  const entryEntityIds = new Set((snapshot.scenes[snapshot.manifest.entrySceneId]?.entities ?? []).map((entity) => entity.id))
  for (const [resourceId, resource] of Object.entries(snapshot.resources)) {
    const registration = resources.get(resource.typeId)
    if (!registration) continue
    forEachReference(registration.schema, resource.data, '', (pointer, field, value) => {
      resolveReference(field, value, snapshot, entryEntityIds, issues, { resourceId, pointer })
    })
  }
}

function cyclicEntities(scene: SceneDocument): string[] {
  const byId = new Map(scene.entities.map((entity) => [entity.id, entity]))
  const cyclic: string[] = []
  for (const start of scene.entities) {
    const seen = new Set<string>()
    let current = byId.get(start.id)
    while (current?.parentId !== undefined) {
      if (seen.has(current.id)) { cyclic.push(start.id); break }
      seen.add(current.id)
      const parent = byId.get(current.parentId)
      if (!parent) break
      if (parent.id === start.id) { cyclic.push(start.id); break }
      current = parent
    }
  }
  return cyclic
}

type ReferenceVisitor = (pointer: string, field: ReferenceProperty, value: string) => void

function forEachReference(schema: ObjectSchema | PropertySchema, value: unknown, pointer: string, visit: ReferenceVisitor): void {
  switch (schema.kind) {
    case 'reference':
      if (typeof value === 'string') visit(pointer, schema, value)
      return
    case 'object':
      if (typeof value !== 'object' || value === null) return
      for (const field of schema.fields) {
        if (field.key !== undefined && field.key in (value as Record<string, unknown>)) {
          forEachReference(field, (value as Record<string, unknown>)[field.key], `${pointer}/${escapePointerToken(field.key)}`, visit)
        }
      }
      return
    case 'array':
      if (!Array.isArray(value)) return
      value.forEach((item, index) => forEachReference(schema.item, item, `${pointer}/${index}`, visit))
      return
    default:
      return
  }
}

interface ReferenceLocation {
  sceneId?: string
  entityId?: string
  componentId?: string
  resourceId?: string
  pointer: string
}

function resolveReference(
  field: ReferenceProperty,
  value: string,
  snapshot: ProjectSnapshot,
  sceneEntityIds: Set<string>,
  issues: ValidationIssue[],
  location: ReferenceLocation
): void {
  if (value === '') return // empty references are governed by `required` in schema validation
  if (field.target === 'resource') {
    const resource = snapshot.resources[value]
    if (!resource) {
      issues.push({ severity: 'error', code: 'reference.missing', message: `Reference to unknown resource "${value}"`, ...location })
      return
    }
    if (field.typeIds && !field.typeIds.includes(resource.typeId)) {
      issues.push({ severity: 'error', code: 'reference.type', message: `Resource "${value}" type "${resource.typeId}" is not allowed here`, ...location })
    }
    return
  }
  if (!sceneEntityIds.has(value)) {
    issues.push({ severity: 'error', code: 'reference.missing', message: `Reference to unknown entity "${value}"`, ...location })
  }
}

// --- Deterministic ordering -------------------------------------------------

function compareIssues(a: ValidationIssue, b: ValidationIssue): number {
  if (a.severity !== b.severity) return a.severity === 'error' ? -1 : 1
  const keys: Array<keyof ValidationIssue> = ['sceneId', 'entityId', 'componentId', 'resourceId', 'pointer', 'code']
  for (const key of keys) {
    const diff = (a[key] ?? '').localeCompare(b[key] ?? '')
    if (diff !== 0) return diff
  }
  return 0
}
