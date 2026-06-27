import {
  RESOURCE_URIS,
  parseToolArgs,
  toolDefs,
  type ResourceUri,
  type SceneCommand,
  type ToolDef,
  type ToolHost,
  type ToolName,
  type ToolResult
} from '@automata/contracts'
import { validateDoc } from '../io/validation'
import type { GameDefinition } from '../model/gameDefinition'

export interface EditorToolHostOptions<Doc> {
  definition: GameDefinition<Doc>
  /** The doc to seed the sandbox from; copied-on-write via SceneModel.apply, never mutated. */
  initialDoc: Doc
  /** Returned by readResource('editor://baseline'); defaults to null. */
  baseline?: unknown
}

export interface EditorToolHost<Doc> extends ToolHost {
  /** Sandbox doc after applied write tools - never the live store. */
  readonly doc: Doc
  /** Write commands applied to the sandbox, in order; the batch a UI host can preview/apply. */
  readonly commands: SceneCommand[]
}

const WRITE_TOOLS = new Set<ToolName>([
  'addItem',
  'moveSelected',
  'setItemField',
  'setSurface',
  'setMetadata',
  'deleteItems'
])

function errorResult(error: unknown): ToolResult {
  return { ok: false, isError: true, content: error instanceof Error ? error.message : String(error) }
}

export function createEditorToolHost<Doc>(opts: EditorToolHostOptions<Doc>): EditorToolHost<Doc> {
  const { definition } = opts
  let doc = opts.initialDoc
  const commands: SceneCommand[] = []

  return {
    get doc() {
      return doc
    },
    get commands() {
      return commands
    },
    listTools(): ToolDef[] {
      return toolDefs()
    },
    async executeTool(name: ToolName, args: unknown): Promise<ToolResult> {
      let parsed: unknown
      try {
        parsed = parseToolArgs(name, args)
      } catch (error) {
        return errorResult(error)
      }

      if (WRITE_TOOLS.has(name)) {
        const command = { type: name, ...(parsed as object) } as SceneCommand
        try {
          const next = definition.scene.apply(doc, command)
          const changed = next !== doc
          if (changed) {
            doc = next
            commands.push(command)
          }
          return {
            ok: true,
            content: { applied: name, changed, items: definition.scene.listItems(doc).length }
          }
        } catch (error) {
          return errorResult(error)
        }
      }

      switch (name) {
        case 'getDoc':
          return { ok: true, content: doc }
        case 'listItems':
          return { ok: true, content: definition.scene.listItems(doc) }
        case 'validate':
          return { ok: true, content: validateDoc(definition, doc) }
        case 'testPlay': {
          if (!definition.play) return { ok: false, isError: true, content: 'this game has no test-play support' }
          const { maxSteps } = parsed as { maxSteps: number }
          const result = await definition.play.runHeadlessPlay(doc, { maxSteps })
          return { ok: true, content: result }
        }
        default:
          return { ok: false, isError: true, content: `unknown tool ${name}` }
      }
    },
    async readResource(uri: ResourceUri): Promise<unknown> {
      switch (uri) {
        case RESOURCE_URIS.doc:
          return doc
        case RESOURCE_URIS.items:
          return definition.scene.listItems(doc)
        case RESOURCE_URIS.validation:
          return validateDoc(definition, doc)
        case RESOURCE_URIS.baseline:
          return opts.baseline ?? null
        default:
          return null
      }
    }
  }
}
