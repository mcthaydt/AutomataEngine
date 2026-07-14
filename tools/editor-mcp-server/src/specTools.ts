import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { hashJson, type SessionEngine } from '@automata/build-session'
import { parseSpecToolArgs, type GameSpec, type SpecTranslation, type ToolResult } from '@automata/contracts'
import { nextSpecVersion, normalizeGameSpec, renderDesignBrief, validateGameSpec } from '@automata/game-spec'
import { discoverGames } from './projectCatalog'
import { readGameSpec, writeGameSpec } from './specStore'

export interface SpecToolDeps {
  repoRoot: string
  ensureEngine(gameId: string): Promise<SessionEngine>
}

const ok = (content: unknown): ToolResult => ({ ok: true, content })
const fail = (content: unknown): ToolResult => ({ ok: false, isError: true, content })

/** Latest checkpoint decision recorded for this exact normalized spec. */
export function designCheckpointStatus(engine: SessionEngine, specHash: string): 'pending' | 'approved' | 'rejected' {
  for (let index = engine.session.steps.length - 1; index >= 0; index -= 1) {
    const step = engine.session.steps[index]!
    if (step.kind !== 'checkpoint:design') continue
    const result = step.result as { decision?: string; specHash?: string } | undefined
    if (result?.specHash === specHash) return result.decision === 'approve' ? 'approved' : 'rejected'
  }
  return 'pending'
}

export function createSpecToolRunner(deps: SpecToolDeps) {
  const requireSpec = async (gameId: string): Promise<{ spec: GameSpec; engine: SessionEngine } | ToolResult> => {
    const engine = await deps.ensureEngine(gameId)
    const spec = await readGameSpec(deps.repoRoot, gameId)
    return spec ? { spec, engine } : fail(`no gamespec.json for "${gameId}" — call compileGameSpec first`)
  }

  const compile = async (raw: unknown): Promise<ToolResult> => {
    const args = parseSpecToolArgs('compileGameSpec', raw) as {
      gameId: string; draft: unknown; prompt: string; translations: SpecTranslation[]; changeReason?: string
    }
    const available = await discoverGames(deps.repoRoot)
    if (!available.includes(args.gameId)) return fail(`Unknown game "${args.gameId}". Available: ${available.join(', ')}`)

    const engine = await deps.ensureEngine(args.gameId)
    const validated = validateGameSpec(args.draft, { gameId: args.gameId })
    if (!validated.ok) {
      await engine.addFinding({ source: 'spec', severity: 'error', code: 'spec-invalid', message: JSON.stringify(validated.issues).slice(0, 4000), inputHash: hashJson(args.draft) })
      return fail({ code: 'spec-invalid', issues: validated.issues })
    }

    const current = await readGameSpec(deps.repoRoot, args.gameId)
    const approved = current !== null && designCheckpointStatus(engine, hashJson(current)) === 'approved'
    const stamped = nextSpecVersion({ current, currentApproved: approved, draft: validated.draft, prompt: args.prompt, translations: args.translations, changeReason: args.changeReason })
    if (!stamped.ok) {
      await engine.addFinding({ source: 'spec', severity: 'error', code: stamped.issue.code, message: stamped.issue.message, inputHash: hashJson(validated.draft) })
      return fail({ code: stamped.issue.code, issues: [stamped.issue] })
    }

    const spec = normalizeGameSpec(stamped.spec)
    const specHash = hashJson(spec)
    if (current !== null && hashJson(current) === specHash) {
      const prior = [...engine.session.steps].reverse().find((step) => step.kind === 'spec:compile' && step.status === 'completed')
      if (prior) return ok({ specVersion: spec.specVersion, cached: true, checkpoint: designCheckpointStatus(engine, specHash), stepId: prior.id })
    }
    const guarded = await engine.runSeededStep('spec:compile', { draft: normalizeGameSpec(validated.draft), prompt: args.prompt, translations: args.translations, changeReason: args.changeReason ?? null, currentVersion: current?.specVersion ?? null, currentApproved: approved }, async () => spec)
    await writeGameSpec(deps.repoRoot, args.gameId, guarded.output as GameSpec)
    await engine.autoResolve('spec')
    return ok({ specVersion: (guarded.output as GameSpec).specVersion, cached: guarded.cached, checkpoint: designCheckpointStatus(engine, specHash), stepId: guarded.step.id })
  }

  const get = async (raw: unknown): Promise<ToolResult> => {
    const args = parseSpecToolArgs('getGameSpec', raw) as { gameId: string }
    const found = await requireSpec(args.gameId)
    if ('ok' in found) return found
    return ok({ spec: found.spec, specVersion: found.spec.specVersion, checkpoint: designCheckpointStatus(found.engine, hashJson(found.spec)) })
  }

  const brief = async (raw: unknown): Promise<ToolResult> => {
    const args = parseSpecToolArgs('renderDesignBrief', raw) as { gameId: string }
    const found = await requireSpec(args.gameId)
    if ('ok' in found) return found
    const specHash = hashJson(found.spec)
    const guarded = await found.engine.runSeededStep('spec:brief', { specHash }, async () => renderDesignBrief(found.spec))
    const artifact = 'artifacts/design-brief.md'
    await writeFile(join(found.engine.dir, artifact), guarded.output as string)
    return ok({ markdown: guarded.output, cached: guarded.cached, artifact })
  }

  const decide = async (raw: unknown): Promise<ToolResult> => {
    const args = parseSpecToolArgs('recordDesignDecision', raw) as { gameId: string; decision: 'approve' | 'reject'; reason: string }
    const found = await requireSpec(args.gameId)
    if ('ok' in found) return found
    const specHash = hashJson(found.spec)
    if (!found.engine.findCompleted('spec:brief', hashJson({ specHash }))) return fail('the design brief for the current spec has not been rendered — call renderDesignBrief, present it, then decide')
    const step = await found.engine.journalStep('checkpoint:design', {
      inputHash: hashJson({ specHash, decision: args.decision, reason: args.reason }),
      result: { decision: args.decision, reason: args.reason, specVersion: found.spec.specVersion, specHash }
    })
    return ok({ recorded: true, decision: args.decision, specVersion: found.spec.specVersion, stepId: step.id })
  }

  return { async execute(name: string, args: unknown): Promise<ToolResult> { if (name === 'compileGameSpec') return compile(args); if (name === 'getGameSpec') return get(args); if (name === 'renderDesignBrief') return brief(args); if (name === 'recordDesignDecision') return decide(args); return fail(`Unknown spec tool "${name}"`) } }
}
