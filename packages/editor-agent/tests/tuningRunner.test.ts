import { describe, expect, it, vi } from 'vitest'
import { createNullRenderer, type PhysicsPort } from '@automata/engine'
import type { AgentRunOptions, AgentRunResult, ProviderAdapter } from '@automata/agent-core'
import type { TestPlayResult } from '@automata/contracts'
import { createEditor } from '@automata/editor'
import { runTuning } from '../src/tuningRunner'
import { boxItem, markerItem, playableDefinition, type FakeDoc } from './fixtures/fakeDefinition'

const nullPhysics = (): PhysicsPort =>
  ({
    addBody() {},
    removeBody() {},
    setGravity() {},
    step: () => [],
    readPose: () => null,
    readLinearVelocity: () => ({ x: 0, y: 0, z: 0 }),
    applyImpulse() {},
    setKinematicTarget() {},
    get bodyCount() {
      return 0
    },
    dispose() {}
  }) as PhysicsPort

const provider: ProviderAdapter = { id: 'anthropic', defaultModel: 'm', send: vi.fn() }

function definitionScoring(scores: number[]) {
  let i = 0
  return {
    ...playableDefinition,
    play: {
      ...playableDefinition.play!,
      runHeadlessPlay: async (): Promise<TestPlayResult> => ({
        outcome: 'completed',
        timeMs: 0,
        fallCount: 0,
        bananas: 0,
        steps: scores[i++] ?? 0
      })
    }
  }
}

describe('runTuning', () => {
  it('keeps a proposal that beats the baseline and returns its cumulative commands + score', async () => {
    const definition = definitionScoring([1800, 600, 1800])
    const editor = createEditor<FakeDoc>({ definition, render: createNullRenderer().port, physics: nullPhysics() })
    editor.store.dispatch({
      type: 'loadDoc',
      doc: { title: 'lvl', items: [boxItem('a'), markerItem('start')] }
    })

    const runAgentFn = vi.fn(async ({ host }: AgentRunOptions): Promise<AgentRunResult> => {
      await host.executeTool('addItem', { item: boxItem(`b${runAgentFn.mock.calls.length}`) })
      return { finalText: '', messages: [], executed: [], stoppedBy: 'end' as const }
    })

    const result = await runTuning<FakeDoc>({
      core: editor,
      provider,
      prompt: 'make it easier',
      target: { minSteps: 300, maxSteps: 900 },
      maxIterations: 2,
      runAgentFn
    })

    expect(runAgentFn).toHaveBeenCalled()
    expect(result.accepted).toBe(1)
    expect(result.score).toBe(1)
    expect(result.commands).toHaveLength(1)
    expect(playableDefinition.scene.listItems(result.doc)).toHaveLength(3)
    expect(playableDefinition.scene.listItems(editor.store.getState().document.doc)).toHaveLength(2)
  })

  it('stops proposing once the target score is reached', async () => {
    const definition = definitionScoring([1800, 600, 600, 600])
    const editor = createEditor<FakeDoc>({ definition, render: createNullRenderer().port, physics: nullPhysics() })
    editor.store.dispatch({
      type: 'loadDoc',
      doc: { title: 'lvl', items: [boxItem('a'), markerItem('start')] }
    })
    const runAgentFn = vi.fn(async ({ host }: AgentRunOptions): Promise<AgentRunResult> => {
      await host.executeTool('addItem', { item: boxItem(`target-${runAgentFn.mock.calls.length}`) })
      return { finalText: '', messages: [], executed: [], stoppedBy: 'end' as const }
    })

    const result = await runTuning<FakeDoc>({
      core: editor,
      provider,
      prompt: 'make it easier',
      target: { minSteps: 300, maxSteps: 900 },
      targetScore: 1,
      maxIterations: 5,
      runAgentFn
    })

    expect(result.score).toBe(1)
    expect(result.accepted).toBe(1)
    expect(result.iterations).toBe(1)
    expect(runAgentFn).toHaveBeenCalledOnce()
  })

  it('rejects incomplete agent proposals even when they mutated the sandbox', async () => {
    const definition = definitionScoring([1800])
    const editor = createEditor<FakeDoc>({ definition, render: createNullRenderer().port, physics: nullPhysics() })
    editor.store.dispatch({
      type: 'loadDoc',
      doc: { title: 'lvl', items: [boxItem('a'), markerItem('start')] }
    })
    const runAgentFn = vi.fn(async ({ host }: AgentRunOptions): Promise<AgentRunResult> => {
      await host.executeTool('addItem', { item: boxItem('partial') })
      return { finalText: 'still working', messages: [], executed: [], stoppedBy: 'max-turns' as const }
    })

    await expect(
      runTuning<FakeDoc>({
        core: editor,
        provider,
        prompt: 'make it easier',
        target: { minSteps: 300, maxSteps: 900 },
        maxIterations: 1,
        runAgentFn
      })
    ).rejects.toThrow('agent stopped before completing')
    expect(playableDefinition.scene.listItems(editor.store.getState().document.doc)).toHaveLength(2)
  })

  it('throws when the definition has no test-play support', async () => {
    const { play, ...noPlay } = playableDefinition
    void play
    const editor = createEditor<FakeDoc>({ definition: noPlay, render: createNullRenderer().port, physics: nullPhysics() })
    await expect(
      runTuning<FakeDoc>({ core: editor, provider, prompt: 'x', target: { minSteps: 1, maxSteps: 2 } })
    ).rejects.toThrow()
  })

  it('uses the default agent loop when no runAgentFn is injected', async () => {
    const definition = definitionScoring([1800, 1800])
    const editor = createEditor<FakeDoc>({ definition, render: createNullRenderer().port, physics: nullPhysics() })
    editor.store.dispatch({
      type: 'loadDoc',
      doc: { title: 'lvl', items: [boxItem('a'), markerItem('start')] }
    })
    const localProvider: ProviderAdapter = {
      id: 'anthropic',
      defaultModel: 'm',
      send: vi.fn(async () => ({ text: 'done', toolCalls: [], stopReason: 'end' as const }))
    }

    const result = await runTuning<FakeDoc>({
      core: editor,
      provider: localProvider,
      prompt: 'make it easier',
      target: { minSteps: 300, maxSteps: 900 },
      maxIterations: 1
    })

    expect(localProvider.send).toHaveBeenCalledOnce()
    expect(result.accepted).toBe(0)
  })
})
