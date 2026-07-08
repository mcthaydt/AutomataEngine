import { join } from 'node:path'
import {
  parseSessionToolArgs,
  sessionToolDefs,
  type McpToolHost,
  type ToolDef,
  type ToolResult
} from '@automata/contracts'
import type { ProjectSnapshot } from '@automata/project'
import { createHeadlessHost } from '../headlessHost'
import { createProjectDirectoryWriter } from '../projectWriter'
import { createWorkspaceHost } from '../workspaceHost'
import { createRunner, type BrowserSmokeFn, type ExecFn, type Runner, type Step } from './runner'
import { openSessionStore, type SessionStore } from './store'
import { createWriteThroughHost } from './writeThroughHost'

export interface SessionHost extends McpToolHost {
  bindNotifications(notify: () => void): void
  close(): Promise<void>
}
export interface SessionHostOptions {
  repoRoot: string
  exec: ExecFn
  browserSmoke: BrowserSmokeFn
  now?: () => number
  /** Overrides where session metadata lives; defaults to <repoRoot>/.automata/session. */
  stateDir?: string
}

const SESSION_CONTROL = new Set(['openProject', 'closeProject', 'sessionStatus'])
const RUN_STEPS: Record<string, Step> = { runBuild: 'build', runTests: 'test', browserSmoke: 'browser' }
const STEPS: Step[] = ['build', 'test', 'browser', 'evaluate']

interface ActiveProject {
  gameId: string
  // The wrapped project host, viewed the way the session uses it: a string-keyed
  // McpToolHost (matching the MCP wire) that also exposes the live snapshot for
  // the runner. The write-through host (an EditorProjectToolHost) satisfies this.
  host: McpToolHost & { readonly snapshot: ProjectSnapshot }
  runner: Runner
}

const fail = (error: unknown): ToolResult => ({ ok: false, isError: true, content: error instanceof Error ? error.message : String(error) })

export async function createSessionHost(options: SessionHostOptions): Promise<SessionHost> {
  const { repoRoot } = options
  const workspace = createWorkspaceHost({ repoRoot })
  const storeOpts: { now?: () => number; stateDir?: string } = {}
  if (options.now) storeOpts.now = options.now
  if (options.stateDir) storeOpts.stateDir = options.stateDir
  const store: SessionStore = await openSessionStore(repoRoot, storeOpts)
  let active: ActiveProject | null = null
  let notify: () => void = () => {}

  const openProject = async (gameId: string): Promise<ToolResult> => {
    const projectDir = join(repoRoot, 'games', gameId, 'public', 'project')
    const opened = await createHeadlessHost({ projectDir, repoRoot })
    const writer = createProjectDirectoryWriter(projectDir)
    const host = createWriteThroughHost(opened.host, writer)
    const runner = createRunner({
      repoRoot, gameId, store,
      snapshot: () => host.snapshot,
      exec: options.exec,
      browserSmoke: options.browserSmoke,
      evaluate: (evalOptions) => host.executeTool('evaluate', evalOptions),
      ...(options.now ? { now: options.now } : {})
    })
    active = { gameId, host, runner }
    await store.setActiveProject(gameId)
    return { ok: true, content: { openedProject: gameId } }
  }

  // Rehydrate the last active project from disk, if any; clear the pointer on failure
  // so sessionStatus never reports an active project whose tools are absent.
  if (store.state.activeProjectId) {
    await openProject(store.state.activeProjectId).catch(async () => {
      active = null
      await store.setActiveProject(null)
    })
  }

  const sessionStatus = async (): Promise<ToolResult> => {
    const steps: Record<string, string> = {}
    if (active) for (const step of STEPS) steps[step] = await active.runner.freshness(step)
    return {
      ok: true,
      content: {
        activeProjectId: active?.gameId ?? null,
        steps,
        findings: store.state.findings,
        budgets: store.state.budgets
      }
    }
  }

  const listTools = (): ToolDef[] => {
    const defs = [...workspace.listTools(), ...sessionToolDefs().filter((d) => SESSION_CONTROL.has(d.name))]
    if (!active) return defs
    const runDefs = sessionToolDefs().filter((d) => d.name in RUN_STEPS)
    return [...defs, ...active.host.listTools(), ...runDefs]
  }

  const host: SessionHost = {
    listTools,
    bindNotifications(fn) { notify = fn },
    async close() { await store.release() },
    async readResource(uri) {
      if (active) return active.host.readResource(uri)
      throw new Error(`No project open (requested ${uri})`)
    },
    async executeTool(name, args) {
      try {
        await store.appendLog({ tool: name })
        if (name === 'createGame' || name === 'listGames') return await workspace.executeTool(name, args)
        if (SESSION_CONTROL.has(name)) {
          const input = parseSessionToolArgs(name, args)
          if (name === 'openProject') {
            const result = await openProject((input as { gameId: string }).gameId)
            notify()
            return result
          }
          if (name === 'closeProject') {
            active = null
            await store.setActiveProject(null)
            notify()
            return { ok: true, content: { closed: true } }
          }
          return await sessionStatus()
        }
        if (name in RUN_STEPS) {
          if (!active) return fail(new Error(`Cannot ${name}: no project open. Call openProject first.`))
          const { force } = parseSessionToolArgs(name, args) as { force?: boolean }
          return await active.runner.run(RUN_STEPS[name]!, force === true)
        }
        if (name === 'evaluate') {
          if (!active) return fail(new Error('Cannot evaluate: no project open.'))
          // Honor caller options (e.g. maxSteps); default the required bound if omitted.
          const evalOptions = { maxSteps: 1000, ...((args as Record<string, unknown> | null) ?? {}) }
          return await active.runner.run('evaluate', false, evalOptions)
        }
        if (!active) return fail(new Error(`Cannot ${name}: no project open. Call openProject first.`))
        return await active.host.executeTool(name, args)
      } catch (error) {
        return fail(error)
      }
    }
  }
  return host
}
