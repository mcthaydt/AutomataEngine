import type { AgentRunResult, ProviderAdapter } from '@automata/agent-core'
import type { ProjectToolHost } from '@automata/contracts'
import { describe, expect, it, vi } from 'vitest'
import { runTuning } from '../src/tuningRunner'
import { createFakeProjectEditor } from './fixtures/fakeProject'

const provider: ProviderAdapter = { id: 'anthropic', defaultModel: 'm', send: vi.fn() }

const complete = (): AgentRunResult => ({
  finalText: '', messages: [], executed: [], stoppedBy: 'end'
})

const entity = (id: string) => ({ id, name: id, enabled: true, components: [] })

describe('runTuning', () => {
  it('keeps only improving project proposals and never mutates the live store', async () => {
    const editor = createFakeProjectEditor({ scores: [0.2, 0.8, 0.5] })
    const runAgentFn = vi.fn(async ({ host }: { host: ProjectToolHost }) => {
      await host.executeTool('addEntity', {
        sceneId: 'arena',
        entity: entity(`proposal-${runAgentFn.mock.calls.length}`)
      })
      return complete()
    })

    const result = await runTuning({
      core: editor,
      provider,
      prompt: 'improve the project',
      maxSteps: 240,
      maxIterations: 2,
      runAgentFn
    })

    expect(result).toMatchObject({ score: 0.8, accepted: 1, iterations: 2 })
    expect(result.commands).toEqual([
      expect.objectContaining({ type: 'addEntity', sceneId: 'arena' })
    ])
    expect(result.snapshot.scenes.arena!.entities).toHaveLength(2)
    expect(editor.store.getState().snapshot.scenes.arena!.entities).toHaveLength(1)
  })

  it('stops proposing once the normalized target score is reached', async () => {
    const editor = createFakeProjectEditor({ scores: [0.2, 1] })
    const runAgentFn = vi.fn(async ({ host }: { host: ProjectToolHost }) => {
      await host.executeTool('addEntity', { sceneId: 'arena', entity: entity('winner') })
      return complete()
    })

    const result = await runTuning({
      core: editor,
      provider,
      prompt: 'improve',
      targetScore: 1,
      maxIterations: 5,
      runAgentFn
    })

    expect(result).toMatchObject({ score: 1, accepted: 1, iterations: 1 })
    expect(runAgentFn).toHaveBeenCalledOnce()
  })

  it('rejects project snapshots with validation errors before evaluating them', async () => {
    const editor = createFakeProjectEditor({ scores: [0.2, 1] })
    const evaluate = vi.spyOn(editor.registration, 'evaluate')
    const runAgentFn = vi.fn(async ({ host }: { host: ProjectToolHost }) => {
      await host.executeTool('setProperty', {
        target: { kind: 'manifest' }, pointer: '/entrySceneId', value: 'missing'
      })
      return complete()
    })

    const result = await runTuning({
      core: editor,
      provider,
      prompt: 'break it',
      maxIterations: 1,
      runAgentFn
    })

    expect(result).toMatchObject({ score: 0.2, accepted: 0 })
    expect(evaluate).toHaveBeenCalledOnce()
    expect(result.commands).toHaveLength(0)
  })

  it.each([
    ['max-turns', 'maximum turn limit'],
    ['provider-stop', 'provider stop']
  ] as const)('reports %s agent termination explicitly', async (stoppedBy, message) => {
    const editor = createFakeProjectEditor({ scores: [0.2] })
    const runAgentFn = vi.fn(async () => ({ ...complete(), stoppedBy }))

    await expect(runTuning({
      core: editor,
      provider,
      prompt: 'improve',
      maxIterations: 1,
      runAgentFn
    })).rejects.toThrow(message)
  })

  it('throws explicitly when the project has no evaluation adapter', async () => {
    const editor = createFakeProjectEditor({ evaluation: false })
    await expect(runTuning({
      core: editor,
      provider,
      prompt: 'improve'
    })).rejects.toThrow('this project has no evaluation adapter')
  })

  it('uses the default agent loop when no runner is injected', async () => {
    const editor = createFakeProjectEditor({ scores: [0.2, 0.2] })
    const localProvider: ProviderAdapter = {
      id: 'anthropic',
      defaultModel: 'm',
      send: vi.fn(async () => ({ text: 'done', toolCalls: [], stopReason: 'end' as const }))
    }

    const result = await runTuning({
      core: editor,
      provider: localProvider,
      prompt: 'improve',
      maxIterations: 1
    })

    expect(localProvider.send).toHaveBeenCalledOnce()
    expect(result.accepted).toBe(0)
  })
})
