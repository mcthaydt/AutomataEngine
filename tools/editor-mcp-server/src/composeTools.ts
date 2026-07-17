import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { hashJson, type GuardedRun, type SessionEngine } from '@automata/build-session'
import { parseComposeToolArgs, type CompositionManifest, type GameSpec, type SliceEvidence, type SliceGateResult, type ToolResult } from '@automata/contracts'
import { composeGame, renderSliceReport, type ComposeResult } from '@automata/game-compose'
import { writeComposedFiles } from './composedWriter'
import { designCheckpointStatus } from './specTools'
import { readGameSpec } from './specStore'

export interface ComposeToolDeps {
  repoRoot: string
  ensureEngine(gameId: string): Promise<SessionEngine>
  snapshotContent(gameId: string): Promise<{ hash: string }>
  devPortFor(gameId: string): Promise<number | null>
  writeFiles?: typeof writeComposedFiles
}

const ok = (content: unknown): ToolResult => ({ ok: true, content })
const fail = (content: unknown): ToolResult => ({ ok: false, isError: true, content })
const GATES = [
  { kind: 'build' as const, step: 'check:build' },
  { kind: 'test' as const, step: 'check:test' },
  { kind: 'browser' as const, step: 'check:browser' },
  { kind: 'evaluate' as const, step: 'check:evaluate' }
]

export function sliceCheckpointStatus(engine: SessionEngine, hashes: { specHash: string; compositionHash: string; contentHash: string }): 'pending' | 'approved' | 'rejected' {
  for (let index = engine.session.steps.length - 1; index >= 0; index -= 1) {
    const step = engine.session.steps[index]!
    if (step.kind !== 'checkpoint:slice') continue
    const result = step.result as { decision?: string; specHash?: string; compositionHash?: string; contentHash?: string } | undefined
    if (result?.specHash === hashes.specHash && result.compositionHash === hashes.compositionHash && result.contentHash === hashes.contentHash) {
      return result.decision === 'approve' ? 'approved' : 'rejected'
    }
  }
  return 'pending'
}

class ComposeFailure extends Error {
  constructor(readonly result: ComposeResult) { super('compose failed') }
}

export function createComposeToolRunner(deps: ComposeToolDeps) {
  const writeFiles = deps.writeFiles ?? writeComposedFiles
  const requireSpec = async (gameId: string): Promise<{ spec: GameSpec; engine: SessionEngine } | ToolResult> => {
    const engine = await deps.ensureEngine(gameId)
    const spec = await readGameSpec(deps.repoRoot, gameId)
    return spec ? { spec, engine } : fail(`no gamespec.json for "${gameId}" — call compileGameSpec first`)
  }

  const latestComposition = (engine: SessionEngine, specHash: string): CompositionManifest | null => {
    for (let index = engine.session.steps.length - 1; index >= 0; index -= 1) {
      const step = engine.session.steps[index]!
      const composition = (step.result as { composition?: CompositionManifest } | undefined)?.composition
      if (step.kind === 'compose:game' && step.status === 'completed' && composition?.source?.specHash === specHash) return composition
    }
    return null
  }

  const assembleEvidence = async (gameId: string, spec: GameSpec, engine: SessionEngine): Promise<SliceEvidence | ToolResult> => {
    const specHash = hashJson(spec)
    if (designCheckpointStatus(engine, specHash) !== 'approved') return fail(`the current spec for "${gameId}" does not have an approved design checkpoint`)
    const composition = latestComposition(engine, specHash)
    if (!composition) return fail(`no compose:game step for the current spec of "${gameId}" — call composeGame first`)
    const { hash: contentHash } = await deps.snapshotContent(gameId)
    await engine.noteContentHash(contentHash)
    const gates: SliceGateResult[] = GATES.map(({ kind, step }) => {
      const record = [...engine.session.steps].reverse().find((candidate) => candidate.kind === step)
      if (!record) return { kind, status: 'missing' }
      if (record.status === 'stale') return { kind, status: 'stale', stepId: record.id }
      if (record.status === 'failed') return { kind, status: 'failed', stepId: record.id }
      const result = record.result as { passed?: boolean; outcome?: string; contentHash?: string; scope?: string | null } | undefined
      if (result?.contentHash !== contentHash) return { kind, status: 'stale', stepId: record.id }
      if (kind === 'test' && result.scope !== null) return { kind, status: 'stale', stepId: record.id }
      if (kind === 'evaluate') {
        return { kind, status: result.outcome === 'passed' ? 'passed' : 'failed', stepId: record.id }
      }
      return { kind, status: result.passed === true ? 'passed' : 'failed', stepId: record.id }
    })
    const evalStep = [...engine.session.steps].reverse().find((step) => step.kind === 'check:evaluate' && step.status === 'completed' && (step.result as { contentHash?: string } | undefined)?.contentHash === contentHash)
    const evalResult = evalStep?.result as { metrics?: Record<string, number | string | boolean> } | undefined
    const devPort = await deps.devPortFor(gameId)
    return {
      gameId, specVersion: spec.specVersion, specHash, compositionHash: hashJson(composition),
      seed: composition.source?.seed ?? 0, packIds: composition.packs.map((entry) => entry.id), contentHash,
      gates, acceptance: spec.acceptance, evalMetrics: evalResult?.metrics ?? null,
      howToPlay: {
        devCommand: `npm run dev -w ${gameId}`,
        url: devPort === null ? 'http://127.0.0.1:<devPort>/' : `http://127.0.0.1:${devPort}/`,
        controls: 'WASD/arrows: move · collect every item, then reach the beacon'
      }
    }
  }

  return {
    async execute(name: string, raw: unknown): Promise<ToolResult> {
      if (name === 'composeGame') {
        const { gameId } = parseComposeToolArgs(name, raw) as { gameId: string }
        const found = await requireSpec(gameId)
        if ('ok' in found) return found
        const specHash = hashJson(found.spec)
        if (designCheckpointStatus(found.engine, specHash) !== 'approved') {
          await found.engine.addFinding({ source: 'compose', severity: 'error', code: 'compose-requires-approval', message: 'composeGame requires an approved design checkpoint for the current spec.', inputHash: specHash })
          return fail({ code: 'compose-requires-approval' })
        }
        const gameRoot = join(deps.repoRoot, 'games', gameId)
        let guarded: GuardedRun
        try {
          guarded = await found.engine.runSeededStep('compose:game', { specHash }, async (_rng, seed) => {
            const result = composeGame({ spec: found.spec, seed, specHash })
            if (!result.ok) throw new ComposeFailure(result)
            const output = { composition: result.composition, assetManifest: result.assetManifest, files: result.files, summary: result.summary }
            await writeFiles(gameRoot, output.files)
            return output
          })
          if (guarded.cached) {
            const output = guarded.output as { files: Array<{ path: string; text: string }> }
            await writeFiles(gameRoot, output.files)
          }
        } catch (error) {
          const issue = error instanceof ComposeFailure && !error.result.ok ? error.result.issues[0] : undefined
          const message = issue?.message ?? (error instanceof Error ? error.message : 'compose failed')
          await found.engine.addFinding({ source: 'compose', severity: 'error', code: issue?.code ?? 'compose-failed', message, inputHash: specHash })
          const finding = found.engine.session.findings.at(-1)
          return fail({ code: finding?.code ?? 'compose-failed', message: finding?.message })
        }
        const output = guarded.output as { composition: CompositionManifest; files: Array<{ path: string; text: string }>; summary: { packIds: string[]; itemCount: number; assetIds: string[] } }
        const { hash } = await deps.snapshotContent(gameId)
        await found.engine.noteContentHash(hash)
        await found.engine.autoResolve('compose')
        const compositionHash = hashJson(output.composition)
        return ok({ ...output.summary, compositionHash, files: output.files.map((file) => file.path), cached: guarded.cached, stepId: guarded.step.id, sliceCheckpoint: sliceCheckpointStatus(found.engine, { specHash, compositionHash, contentHash: hash }) })
      }

      const args = parseComposeToolArgs(name, raw) as { gameId: string; decision?: 'approve' | 'reject'; reason?: string }
      const found = await requireSpec(args.gameId)
      if ('ok' in found) return found
      const evidence = await assembleEvidence(args.gameId, found.spec, found.engine)
      if ('ok' in evidence) return evidence
      const evidenceHash = hashJson(evidence)
      if (name === 'renderSliceReport') {
        const guarded = await found.engine.runSeededStep('slice:report', { evidenceHash }, async () => renderSliceReport(evidence))
        const artifact = 'artifacts/slice-report.md'
        await writeFile(join(found.engine.dir, artifact), guarded.output as string)
        return ok({ markdown: guarded.output, cached: guarded.cached, artifact, evidenceHash, gates: evidence.gates })
      }
      if (!found.engine.findCompleted('slice:report', hashJson({ evidenceHash }))) return fail('call renderSliceReport for the current evidence before deciding')
      if (args.decision === 'approve' && !evidence.gates.every((gate) => gate.status === 'passed')) return fail({ code: 'slice-gates-not-passed', gates: evidence.gates })
      const step = await found.engine.journalStep('checkpoint:slice', {
        inputHash: hashJson({ evidenceHash, decision: args.decision, reason: args.reason }),
        result: { decision: args.decision, reason: args.reason, specVersion: evidence.specVersion, specHash: evidence.specHash, compositionHash: evidence.compositionHash, contentHash: evidence.contentHash }
      })
      return ok({ recorded: true, decision: args.decision, specVersion: evidence.specVersion, stepId: step.id })
    }
  }
}
