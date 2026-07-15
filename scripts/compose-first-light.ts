import { execSync } from 'node:child_process'
import { resolve } from 'node:path'
import { firstLightGameSpecDraft } from '@automata/contracts'
import { createSessionHost } from '../tools/editor-mcp-server/src/sessionHost'

/** Drive the Phase 3 slice over the same MCP host agents use; safe to re-run. */
const repoRoot = resolve(import.meta.dirname, '..')
const host = createSessionHost({ repoRoot })
const call = async (name: string, args: unknown): Promise<Record<string, unknown>> => {
  const result = await host.executeTool(name as never, args)
  if (!result.ok) throw new Error(`${name} failed: ${JSON.stringify(result.content)}`)
  process.stdout.write(`${name}: ${JSON.stringify(result.content).slice(0, 200)}\n`)
  return result.content as Record<string, unknown>
}

const [decision, ...reasonParts] = process.argv.slice(2)
try {
  const scaffold = await call('createGame', { name: 'first-light' })
  if (scaffold.alreadyExisted !== true) execSync('npm install --no-audit --no-fund', { cwd: repoRoot, stdio: 'inherit' })
  await call('compileGameSpec', {
    gameId: 'first-light', draft: firstLightGameSpecDraft(),
    prompt: 'A tiny night-harbor game: gather the beacon\'s two scattered light cells, then relight it.', translations: []
  })
  await call('renderDesignBrief', { gameId: 'first-light' })
  await call('recordDesignDecision', { gameId: 'first-light', decision: 'approve', reason: 'Phase 3 slice design approved' })
  await call('composeGame', { gameId: 'first-light' })
  await call('openProject', { gameId: 'first-light' })
  await call('runBuild', { gameId: 'first-light' })
  await call('runTests', { gameId: 'first-light' })
  await call('runBrowserEval', { gameId: 'first-light' })
  await call('evaluate', { maxSteps: 4000 })
  const report = await call('renderSliceReport', { gameId: 'first-light' })
  process.stdout.write(`\n${String(report.markdown)}\n`)
  if (decision === 'approve' || decision === 'reject') {
    await call('recordSliceDecision', { gameId: 'first-light', decision, reason: reasonParts.join(' ') || 'recorded via compose-first-light script' })
  } else process.stdout.write('\nRead the report above, then re-run with: approve|reject <reason>\n')
} finally {
  await host.dispose()
}
