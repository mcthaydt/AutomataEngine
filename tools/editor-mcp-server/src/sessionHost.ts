import { join } from 'node:path'
import { ENGINE_VERSION } from '@automata/engine'
import { createSessionEngine, hashJson, snapshotFiles, type CommandSpawner, type SessionEngine } from '@automata/build-session'
import { sessionToolDefs, splitClientStepId, workspaceToolDefs, writeToolNames, type McpToolHost, type ToolResult } from '@automata/contracts'
import { createNewGameWriter, nodeScaffoldFs, type ScaffoldFs } from '@automata/scaffold'
import { createHeadlessHost, type HeadlessHost } from './headlessHost'
import { discoverGames } from './projectCatalog'
import { writeProjectFiles } from './projectWriter'

export interface SessionHostOptions {
  repoRoot: string; fs?: ScaffoldFs; spawner?: CommandSpawner; sessionsRoot?: string
  projectDirFor?: (gameId: string) => string; openHeadless?: (projectDir: string) => Promise<HeadlessHost>
  now?: () => string; seedSource?: () => number; lock?: boolean
}
export interface SessionMcpHost extends McpToolHost { dispose(): Promise<void> }
interface OpenState { gameId: string; projectDir: string; headless: HeadlessHost; engine: SessionEngine }
const WRITE_TOOLS = new Set<string>(writeToolNames)
const ok = (content: unknown): ToolResult => ({ ok: true, content })
const fail = (content: string): ToolResult => ({ ok: false, isError: true, content })

export function createSessionHost(options: SessionHostOptions): SessionMcpHost {
  const repoRoot = options.repoRoot; const sessionsRoot = options.sessionsRoot ?? join(repoRoot, '.automata', 'sessions')
  const projectDirFor = options.projectDirFor ?? ((gameId: string) => join(repoRoot, 'games', gameId, 'public', 'project'))
  const openHeadless = options.openHeadless ?? ((projectDir: string) => createHeadlessHost({ projectDir, repoRoot }))
  const writeGame = createNewGameWriter(options.fs ?? nodeScaffoldFs); const engines = new Map<string, SessionEngine>(); let open: OpenState | null = null
  const ensureEngine = async (gameId: string): Promise<SessionEngine> => {
    const existing = engines.get(gameId); if (existing) return existing
    const { engine } = await createSessionEngine({ sessionsRoot, gameId, projectDir: projectDirFor(gameId), engineVersion: ENGINE_VERSION, now: options.now, seedSource: options.seedSource, lock: options.lock })
    engines.set(gameId, engine); return engine
  }
  const contentSnapshot = async (gameId: string, projectDir: string) => { const files = await snapshotFiles([{ label: 'src', dir: join(repoRoot, 'games', gameId, 'src') }, { label: 'project', dir: projectDir }]); return { files, hash: hashJson(files) } }
  const requireOpen = (): OpenState | null => open
  const handleOpen = async (gameId: string): Promise<ToolResult> => {
    const available = await discoverGames(repoRoot); if (!available.includes(gameId)) return fail(`Unknown game "${gameId}". Available: ${available.join(', ')}`)
    const projectDir = projectDirFor(gameId); const engine = await ensureEngine(gameId); const headless = await openHeadless(projectDir); open = { gameId, projectDir, headless, engine }
    const { files, hash } = await contentSnapshot(gameId, projectDir); let outOfBandChanges = false
    if (engine.session.baseline === null) { engine.session.baseline = { contentHash: hash, files }; engine.session.formatVersion = headless.snapshot.manifest.formatVersion; await engine.noteContentHash(hash) } else outOfBandChanges = await engine.detectOutOfBand(hash)
    return ok({ opened: gameId, outOfBandChanges, session: engine.summary() })
  }
  const handleWrite = async (state: OpenState, name: string, args: unknown): Promise<ToolResult> => {
    const { clientStepId, rest } = splitClientStepId(args); const kind = `author:${name}`
    if (clientStepId) { const existing = state.engine.findByClientStepId(kind, clientStepId); if (existing) return ok({ ...(existing.result as object), stepId: existing.id, deduped: true }) }
    const result = await state.headless.host.executeTool(name as never, rest); if (!result.ok) return result
    const content = result.content as { changed?: boolean }; if (!content.changed) return result
    await writeProjectFiles(state.projectDir, state.headless.host.snapshot); const { hash } = await contentSnapshot(state.gameId, state.projectDir)
    const step = await state.engine.journalStep(kind, { inputHash: hashJson({ name, args: rest }), result: content, ...(clientStepId ? { clientStepId } : {}) }); await state.engine.noteContentHash(hash)
    return ok({ ...content, stepId: step.id })
  }
  const host: SessionMcpHost & { executeCheckTool(name: string, args: unknown): Promise<ToolResult> } = {
    listTools: () => [...workspaceToolDefs(), ...sessionToolDefs(), ...(open ? open.headless.host.listTools() : [])],
    async executeTool(name, args) {
      try {
        if (name === 'listGames') return ok({ games: await discoverGames(repoRoot) })
        if (name === 'createGame') { const input = args as { name: string; port?: number }; const existing = await discoverGames(repoRoot); const engine = await ensureEngine(input.name); if (existing.includes(input.name)) return ok({ gameDir: `games/${input.name}`, alreadyExisted: true, session: engine.summary() }); const seeded = await engine.runSeededStep('scaffold', { name: input.name, port: input.port ?? null }, async () => { const plan = await writeGame(repoRoot, input.name, input.port); return { gameDir: `games/${plan.name}`, devPort: plan.port } }); return ok({ ...(seeded.output as object), alreadyExisted: false, cached: seeded.cached, session: engine.summary(), nextSteps: [`Call runBuild with gameId "${input.name}"`, `Call openProject with gameId "${input.name}"`] }) }
        if (name === 'openProject') return handleOpen((args as { gameId: string }).gameId)
        if (name === 'getSession') return open ? ok(open.engine.summary()) : fail('no project open — call openProject first')
        if (name === 'setResumePoint') { if (!open) return fail('no project open — call openProject first'); await open.engine.setResumePoint((args as { nextAction: string }).nextAction); return ok({ recorded: true }) }
        if (name === 'runBuild' || name === 'runTests' || name === 'runBrowserEval' || name === 'changedFiles') return host.executeCheckTool(name, args)
        if (!open) return fail('no project open — call openProject first')
        if (WRITE_TOOLS.has(name)) return handleWrite(open, name, args)
        if (name === 'validate') { const result = await open.headless.host.executeTool('validate', {}); if (result.ok) { const errors = (result.content as Array<{ severity: string }>).filter((issue) => issue.severity === 'error'); if (errors.length) await open.engine.addFinding({ source: 'validate', severity: 'error', code: 'validation-errors', message: JSON.stringify(errors).slice(0, 4000), inputHash: open.engine.session.lastKnownContentHash ?? '' }); else await open.engine.autoResolve('validate') }; return result }
        return open.headless.host.executeTool(name as never, args)
      } catch (error) { return fail(error instanceof Error ? error.message : String(error)) }
    },
    async executeCheckTool() { return fail('checks land in the next task') },
    async readResource(uri) { if (!open) throw new Error(`No project open (requested ${uri})`); return open.headless.host.readResource(uri as never) },
    async dispose() { for (const engine of engines.values()) await engine.dispose(); engines.clear(); open = null }
  }
  return host
}
