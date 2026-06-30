import {
  RESOURCE_URIS,
  parseToolArgs,
  toolDefs,
  type ResourceUri,
  type ToolDef,
  type ToolHost,
  type ToolName,
  type ToolResult
} from '@automata/contracts'
import {
  applyProjectCommand,
  type ProjectCommand,
  type ProjectSnapshot,
  type ValidationIssue
} from '@automata/project'
import type { RegisteredEditorProject } from './registration'

export interface ProjectToolHostOptions {
  registration: RegisteredEditorProject
  /** Snapshot copied on write inside the sandbox; the live editor store is never touched. */
  initialSnapshot: ProjectSnapshot
  /** Returned by editor://baseline; defaults to null. */
  baseline?: unknown
}

export interface EditorProjectToolHost extends ToolHost {
  readonly snapshot: ProjectSnapshot
  readonly commands: readonly ProjectCommand[]
}

const WRITE_TOOLS = new Set<ToolName>([
  'addEntity', 'removeEntities', 'reparentEntity', 'addComponent', 'removeComponent',
  'addResource', 'removeResource', 'setProperty', 'insertArrayItem', 'removeArrayItem',
  'moveArrayItem'
])

function errorResult(error: unknown): ToolResult {
  return {
    ok: false,
    isError: true,
    content: error instanceof Error ? error.message : String(error)
  }
}

/** Create an isolated command/read/evaluation surface over one project snapshot. */
export function createProjectToolHost(options: ProjectToolHostOptions): EditorProjectToolHost {
  const { registration } = options
  let snapshot = options.initialSnapshot
  const commands: ProjectCommand[] = []

  const hierarchy = () => ({
    scenes: snapshot.manifest.scenes.map((entry) => {
      const scene = snapshot.scenes[entry.id]
      return {
        id: entry.id,
        name: scene?.name ?? entry.id,
        entities: (scene?.entities ?? []).map((entity) => ({
          id: entity.id,
          name: entity.name,
          enabled: entity.enabled,
          ...(entity.parentId ? { parentId: entity.parentId } : {}),
          componentTypeIds: entity.components.map((component) => component.typeId)
        }))
      }
    })
  })
  const resources = () => snapshot.manifest.resources.flatMap((entry) => {
    const resource = snapshot.resources[entry.id]
    return resource ? [resource] : []
  })
  const validation = (): ValidationIssue[] => registration.validate(snapshot)

  return {
    get snapshot() { return snapshot },
    get commands() { return commands },
    listTools(): ToolDef[] {
      return toolDefs()
    },
    async executeTool(name, args): Promise<ToolResult> {
      let parsed: unknown
      try {
        parsed = parseToolArgs(name, args)
      } catch (error) {
        return errorResult(error)
      }

      if (WRITE_TOOLS.has(name)) {
        const command = { type: name, ...(parsed as object) } as ProjectCommand
        try {
          const next = applyProjectCommand(registration.project, snapshot, command)
          const changed = next !== snapshot
          if (changed) {
            snapshot = next
            commands.push(command)
          }
          return { ok: true, content: { applied: name, changed } }
        } catch (error) {
          return errorResult(error)
        }
      }

      switch (name) {
        case 'getProject':
          return { ok: true, content: snapshot }
        case 'getHierarchy':
          return { ok: true, content: hierarchy() }
        case 'getResources':
          return { ok: true, content: resources() }
        case 'validate':
          return { ok: true, content: validation() }
        case 'evaluate': {
          const issues = validation()
          if (issues.some((issue) => issue.severity === 'error')) {
            return { ok: false, isError: true, content: { message: 'project validation failed', issues } }
          }
          if (!registration.evaluate) {
            return { ok: false, isError: true, content: 'this project has no evaluation adapter' }
          }
          try {
            return {
              ok: true,
              content: await registration.evaluate(snapshot, parsed as { maxSteps: number })
            }
          } catch (error) {
            return errorResult(error)
          }
        }
        default:
          return { ok: false, isError: true, content: `unknown project tool ${name}` }
      }
    },
    async readResource(uri: ResourceUri): Promise<unknown> {
      switch (uri) {
        case RESOURCE_URIS.project: return snapshot
        case RESOURCE_URIS.hierarchy: return hierarchy()
        case RESOURCE_URIS.resources: return resources()
        case RESOURCE_URIS.validation: return validation()
        case RESOURCE_URIS.baseline: return options.baseline ?? null
        default: return null
      }
    }
  }
}
