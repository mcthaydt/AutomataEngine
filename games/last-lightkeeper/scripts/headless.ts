import { runHeadlessScenario, type HeadlessMode } from '../src/sim/headless.ts'

const mode = process.argv[2] as HeadlessMode | undefined
if (mode !== 'victory' && mode !== 'failure') {
  console.error('Usage: npm run headless -w last-lightkeeper -- <victory|failure>')
  process.exitCode = 2
} else {
  const result = runHeadlessScenario(mode)
  const expected = mode === 'victory' ? 'victory' : 'defeat'
  console.log(JSON.stringify({
    mode,
    outcome: result.state.outcome,
    reason: result.state.terminalReason,
    rescues: result.state.rescues,
    score: result.state.score,
    trace: result.trace
  }))
  if (result.state.outcome !== expected) process.exitCode = 1
}
