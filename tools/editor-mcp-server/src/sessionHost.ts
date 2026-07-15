import { access, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ENGINE_VERSION } from '@automata/engine/data'
import { createSessionEngine, diffFiles, hashJson, nodeSpawner, runCheck, snapshotFiles, type CommandSpawner, type SessionEngine } from '@automata/build-session'
import { composeToolDefs, sessionToolDefs, specToolDefs, splitClientStepId, workspaceToolDefs, writeToolNames, type McpToolHost, type ToolResult } from '@automata/contracts'
import { createNewGameWriter, nodeScaffoldFs, type ScaffoldFs } from '@automata/scaffold'
import { createHeadlessHost, type HeadlessHost } from './headlessHost'
import { discoverGames } from './projectCatalog'
import { writeProjectFiles } from './projectWriter'
import { createSpecToolRunner } from './specTools'
import { createComposeToolRunner, type ComposeToolDeps } from './composeTools'

export interface SessionHostOptions {
  repoRoot: string; fs?: ScaffoldFs; spawner?: CommandSpawner; sessionsRoot?: string
  projectDirFor?: (gameId: string) => string; openHeadless?: (projectDir: string) => Promise<HeadlessHost>
  now?: () => string; seedSource?: () => number; lock?: boolean; writeFiles?: ComposeToolDeps['writeFiles']
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
  const specTools = createSpecToolRunner({ repoRoot, ensureEngine })
  const contentSnapshot = async (gameId: string) => { const files = await snapshotFiles([{ label: 'game', dir: join(repoRoot, 'games', gameId) }]); return { files, hash: hashJson(files) } }
  const composeTools = createComposeToolRunner({
    repoRoot, ensureEngine,
    snapshotContent: contentSnapshot,
    ...(options.writeFiles ? { writeFiles: options.writeFiles } : {}),
    devPortFor: async (gameId) => {
      try {
        const pkg = JSON.parse(await readFile(join(repoRoot, 'games', gameId, 'package.json'), 'utf8')) as { automata?: { devPort?: number } }
        return pkg.automata?.devPort ?? null
      } catch { return null }
    }
  })
  const handleOpen = async (gameId: string): Promise<ToolResult> => {
    const available = await discoverGames(repoRoot); if (!available.includes(gameId)) return fail(`Unknown game "${gameId}". Available: ${available.join(', ')}`)
    const projectDir = projectDirFor(gameId); const engine = await ensureEngine(gameId); const headless = await openHeadless(projectDir); open = { gameId, projectDir, headless, engine }
    const { files, hash } = await contentSnapshot(gameId); let outOfBandChanges = false
    if (engine.session.baseline === null) { engine.session.baseline = { contentHash: hash, files }; engine.session.formatVersion = headless.snapshot.manifest.formatVersion; await engine.noteContentHash(hash) } else outOfBandChanges = await engine.detectOutOfBand(hash)
    return ok({ opened: gameId, outOfBandChanges, session: engine.summary() })
  }
  const handleWrite = async (state: OpenState, name: string, args: unknown): Promise<ToolResult> => {
    const { clientStepId, rest } = splitClientStepId(args); const kind = `author:${name}`
    if (clientStepId) { const existing = state.engine.findByClientStepId(kind, clientStepId); if (existing) return ok({ ...(existing.result as object), stepId: existing.id, deduped: true }) }
    const result = await state.headless.host.executeTool(name as never, rest); if (!result.ok) return result
    const content = result.content as { changed?: boolean }; if (!content.changed) return result
    await writeProjectFiles(state.projectDir, state.headless.host.snapshot); const { hash } = await contentSnapshot(state.gameId)
    const step = await state.engine.journalStep(kind, { inputHash: hashJson({ name, args: rest }), result: content, ...(clientStepId ? { clientStepId } : {}) }); await state.engine.noteContentHash(hash)
    return ok({ ...content, stepId: step.id })
  }
  const spawner = options.spawner ?? nodeSpawner
  const needsInstall = async (gameId: string): Promise<boolean> => {
    try { await access(join(repoRoot, 'node_modules', gameId)); return false } catch { return true }
  }
  const executeCheckTool = async (name: string, args: unknown): Promise<ToolResult> => {
    if (name === 'changedFiles') {
      if (!open) return fail('no project open — call openProject first')
      if (!open.engine.session.baseline) return fail('session has no baseline yet')
      const current = await contentSnapshot(open.gameId)
      return ok(diffFiles(open.engine.session.baseline.files, current.files))
    }
    const requestedGameId = (args as { gameId?: string }).gameId
    const gameId = requestedGameId ?? open?.gameId
    if (!gameId) return fail('no project open and no gameId given')
    const engine = await ensureEngine(gameId)
    const kind = name === 'runBuild' ? 'build' : name === 'runTests' ? 'test' : 'browser'
    const { hash } = await contentSnapshot(gameId)
    await engine.noteContentHash(hash)
    const outcome = await runCheck(engine, spawner, repoRoot, kind, gameId, hash, {
      ...(kind === 'build' ? { needsInstall: await needsInstall(gameId) } : {}),
      ...(kind === 'test' ? { scope: (args as { scope?: string }).scope } : {})
    })
    return 'refused' in outcome ? { ok: false, isError: true, content: { code: 'budget-exhausted', kind: outcome.kind } } : ok(outcome)
  }
  const handleEvaluate = async (state: OpenState, args: unknown): Promise<ToolResult> => {
    const { hash } = await contentSnapshot(state.gameId); const input = { args, contentHash: hash }
    await state.engine.noteContentHash(hash)
    if (!state.engine.findCompleted('check:evaluate', hashJson(input))) {
      if (!state.engine.spendBudget('evaluate').ok) { await state.engine.addFinding({ source: 'session', severity: 'error', code: 'budget-exhausted', message: 'Attempt budget for evaluate is exhausted.', inputHash: hash }); return { ok: false, isError: true, content: { code: 'budget-exhausted', kind: 'evaluate' } } }
    }
    const guarded = await state.engine.runGuarded('check:evaluate', input, async () => {
      const result = await state.headless.host.executeTool('evaluate', args as never)
      const content = result.content
      const output = typeof content === 'object' && content !== null ? { ...content, contentHash: hash } : { value: content, contentHash: hash }
      return { ok: result.ok, output }
    })
    const output = guarded.output as { outcome?: string }
    if (!guarded.cached) { if (output?.outcome === 'passed') await state.engine.autoResolve('eval'); else await state.engine.addFinding({ source: 'eval', severity: 'error', code: 'evaluation-failed', message: JSON.stringify(output).slice(0, 4000), inputHash: hash }) }
    return ok({ ...(typeof output === 'object' && output !== null ? output : { value: output }), cached: guarded.cached })
  }
  const host: SessionMcpHost & { executeCheckTool(name: string, args: unknown): Promise<ToolResult> } = {
    listTools: () => [...workspaceToolDefs(), ...sessionToolDefs(), ...specToolDefs(), ...composeToolDefs(), ...(open ? open.headless.host.listTools() : [])],
    async executeTool(name, args) {
      try {
        if (name === 'listGames') return ok({ games: await discoverGames(repoRoot) })
        if (name === 'createGame') { const input = args as { name: string; port?: number }; const existing = await discoverGames(repoRoot); const engine = await ensureEngine(input.name); if (existing.includes(input.name)) return ok({ gameDir: `games/${input.name}`, alreadyExisted: true, session: engine.summary() }); const seeded = await engine.runSeededStep('scaffold', { name: input.name, port: input.port ?? null }, async () => { const plan = await writeGame(repoRoot, input.name, input.port); return { gameDir: `games/${plan.name}`, devPort: plan.port } }); return ok({ ...(seeded.output as object), alreadyExisted: false, cached: seeded.cached, session: engine.summary(), nextSteps: [`Call runBuild with gameId "${input.name}"`, `Call openProject with gameId "${input.name}"`] }) }
        if (name === 'openProject') return handleOpen((args as { gameId: string }).gameId)
        if (name === 'getSession') return open ? ok(open.engine.summary()) : fail('no project open — call openProject first')
        if (name === 'setResumePoint') { if (!open) return fail('no project open — call openProject first'); await open.engine.setResumePoint((args as { nextAction: string }).nextAction); return ok({ recorded: true }) }
        if (name === 'runBuild' || name === 'runTests' || name === 'runBrowserEval' || name === 'changedFiles') return executeCheckTool(name, args)
        if (name === 'compileGameSpec' || name === 'getGameSpec' || name === 'renderDesignBrief' || name === 'recordDesignDecision') return specTools.execute(name, args)
        if (name === 'composeGame' || name === 'renderSliceReport' || name === 'recordSliceDecision') return composeTools.execute(name, args)
        if (!open) return fail('no project open — call openProject first')
        if (WRITE_TOOLS.has(name)) return handleWrite(open, name, args)
        if (name === 'evaluate') return handleEvaluate(open, args)
        if (name === 'validate') { const result = await open.headless.host.executeTool('validate', {}); if (result.ok) { const errors = (result.content as Array<{ severity: string }>).filter((issue) => issue.severity === 'error'); if (errors.length) await open.engine.addFinding({ source: 'validate', severity: 'error', code: 'validation-errors', message: JSON.stringify(errors).slice(0, 4000), inputHash: open.engine.session.lastKnownContentHash ?? '' }); else await open.engine.autoResolve('validate') }; return result }
        return open.headless.host.executeTool(name as never, args)
      } catch (error) { return fail(error instanceof Error ? error.message : String(error)) }
    },
    async executeCheckTool(name, args) { return executeCheckTool(name, args) },
    async readResource(uri) { if (!open) throw new Error(`No project open (requested ${uri})`); return open.headless.host.readResource(uri as never) },
    async dispose() { for (const engine of engines.values()) await engine.dispose(); engines.clear(); open = null }
  }
  return host
}
