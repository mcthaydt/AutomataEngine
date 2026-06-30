import { createProjectToolHost } from '@automata/editor/headless'
import { describe, expect, it, vi } from 'vitest'
import { defaultChatDeps, mountChatOverlay, type ChatOverlayDeps } from '../src/chatOverlay'
import type { AgentSettings } from '../src/settings'
import { createFakeProjectEditor, fakeSnapshot } from './fixtures/fakeProject'

const makeSettings = (): AgentSettings => ({
  provider: 'anthropic',
  apiKeys: { anthropic: 'k', openai: '', deepseek: '' },
  models: { anthropic: 'claude-opus-4-8', openai: 'gpt-5', deepseek: 'deepseek-chat' }
})

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
const entity = (id: string) => ({ id, name: id, enabled: true, components: [] })

describe('chat overlay', () => {
  it('previews generic changes and applies one project command batch', async () => {
    const editor = createFakeProjectEditor()
    const parent = document.createElement('div')
    const settings = makeSettings()
    const run = vi.fn(async (snapshot) => {
      const host = createProjectToolHost({ registration: editor.registration, initialSnapshot: snapshot })
      await host.executeTool('addEntity', { sceneId: 'arena', entity: entity('new-spawn') })
      return {
        result: { finalText: 'added a spawn', messages: [], executed: [], stoppedBy: 'end' as const },
        host
      }
    })
    const deps: ChatOverlayDeps = {
      loadSettings: () => settings,
      saveSettings: () => {},
      run
    }
    const panel = mountChatOverlay(editor, parent, deps)
    panel.update(editor.store.getState())

    const input = parent.querySelector<HTMLTextAreaElement>('.ed-chat-input')!
    input.value = 'add a spawn'
    parent.querySelector<HTMLButtonElement>('.ed-chat-send')!.click()
    await flush()

    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({ manifest: expect.objectContaining({ id: 'fake-project' }) }),
      'add a spawn',
      editor,
      settings
    )
    const log = parent.querySelector('.ed-chat-log')!.textContent ?? ''
    expect(log).toContain('added a spawn')
    expect(log).toContain('added entity:arena/new-spawn')
    expect(editor.store.getState().snapshot.scenes.arena!.entities).toHaveLength(1)

    const pastBefore = editor.store.getState().past.length
    parent.querySelector<HTMLButtonElement>('.ed-chat-apply')!.click()
    expect(editor.store.getState().snapshot.scenes.arena!.entities).toHaveLength(2)
    expect(editor.store.getState().past).toHaveLength(pastBefore + 1)
    editor.store.dispatch({ type: 'undo' })
    expect(editor.store.getState().snapshot.scenes.arena!.entities).toHaveLength(1)
    panel.dispose()
  })

  it('lets the project store reconcile stale selection when applying a proposal', async () => {
    const editor = createFakeProjectEditor()
    editor.store.dispatch({
      type: 'select',
      selection: { kind: 'entity', sceneId: 'arena', entityIds: ['spawn-east'] }
    })
    const parent = document.createElement('div')
    const settings = makeSettings()
    const panel = mountChatOverlay(editor, parent, {
      loadSettings: () => settings,
      saveSettings: () => {},
      run: async (snapshot) => {
        const host = createProjectToolHost({ registration: editor.registration, initialSnapshot: snapshot })
        await host.executeTool('removeEntities', { sceneId: 'arena', entityIds: ['spawn-east'] })
        return {
          result: { finalText: 'removed', messages: [], executed: [], stoppedBy: 'end' },
          host
        }
      }
    })
    panel.update(editor.store.getState())

    parent.querySelector<HTMLTextAreaElement>('.ed-chat-input')!.value = 'remove it'
    parent.querySelector<HTMLButtonElement>('.ed-chat-send')!.click()
    await flush()
    parent.querySelector<HTMLButtonElement>('.ed-chat-apply')!.click()

    expect(editor.store.getState().selection).toEqual({ kind: 'scene', sceneId: 'arena' })
    panel.dispose()
  })

  it('runs a tuning pass and shows its generic diff and score', async () => {
    const editor = createFakeProjectEditor()
    const parent = document.createElement('div')
    const settings = makeSettings()
    const tune = vi.fn(async () => {
      const host = createProjectToolHost({
        registration: editor.registration,
        initialSnapshot: editor.store.getState().snapshot
      })
      await host.executeTool('addEntity', { sceneId: 'arena', entity: entity('tuned') })
      return {
        snapshot: host.snapshot,
        commands: [...host.commands],
        score: 0.87,
        iterations: 2,
        accepted: 1
      }
    })
    const panel = mountChatOverlay(editor, parent, {
      loadSettings: () => settings,
      saveSettings: () => {},
      run: vi.fn(),
      tune
    })
    panel.update(editor.store.getState())

    expect(parent.querySelector<HTMLButtonElement>('.ed-chat-tune')!.hidden).toBe(false)
    parent.querySelector<HTMLButtonElement>('.ed-chat-tune')!.click()
    await flush()

    const log = parent.querySelector('.ed-chat-log')!.textContent ?? ''
    expect(log).toContain('score 0.87')
    expect(log).toContain('added entity:arena/tuned')
    parent.querySelector<HTMLButtonElement>('.ed-chat-apply')!.click()
    expect(editor.store.getState().snapshot.scenes.arena!.entities).toHaveLength(2)
    panel.dispose()
  })

  it('shows Tune only when both tuning and project evaluation are available', () => {
    const editor = createFakeProjectEditor({ evaluation: false })
    const parent = document.createElement('div')
    const settings = makeSettings()
    const panel = mountChatOverlay(editor, parent, {
      loadSettings: () => settings,
      saveSettings: () => {},
      run: vi.fn(),
      tune: vi.fn()
    })

    expect(parent.querySelector<HTMLButtonElement>('.ed-chat-tune')!.hidden).toBe(true)
    panel.dispose()
  })

  it('renders incomplete agent runs and thrown errors in the chat log', async () => {
    const settings = makeSettings()

    const incompleteEditor = createFakeProjectEditor()
    const incompleteParent = document.createElement('div')
    const incomplete = mountChatOverlay(incompleteEditor, incompleteParent, {
      loadSettings: () => settings,
      saveSettings: () => {},
      run: async (snapshot) => ({
        result: { finalText: 'partial reply', messages: [], executed: [], stoppedBy: 'max-turns' },
        host: createProjectToolHost({ registration: incompleteEditor.registration, initialSnapshot: snapshot })
      })
    })
    incomplete.update(incompleteEditor.store.getState())
    incompleteParent.querySelector<HTMLTextAreaElement>('.ed-chat-input')!.value = 'try'
    incompleteParent.querySelector<HTMLButtonElement>('.ed-chat-send')!.click()
    await flush()
    expect(incompleteParent.querySelector('.ed-chat-log')!.textContent).toContain('maximum turn limit')
    incomplete.dispose()

    const errorEditor = createFakeProjectEditor()
    const errorParent = document.createElement('div')
    const errored = mountChatOverlay(errorEditor, errorParent, {
      loadSettings: () => settings,
      saveSettings: () => {},
      run: vi.fn(async () => { throw new Error('network down') })
    })
    errored.update(errorEditor.store.getState())
    errorParent.querySelector<HTMLTextAreaElement>('.ed-chat-input')!.value = 'try'
    errorParent.querySelector<HTMLButtonElement>('.ed-chat-send')!.click()
    await flush()
    expect(errorParent.querySelector('.ed-chat-log')!.textContent).toContain('network down')
    errored.dispose()
  })

  it('renders tune errors in the chat log', async () => {
    const editor = createFakeProjectEditor()
    const parent = document.createElement('div')
    const settings = makeSettings()
    const panel = mountChatOverlay(editor, parent, {
      loadSettings: () => settings,
      saveSettings: () => {},
      run: vi.fn(),
      tune: vi.fn(async () => { throw new Error('no valid proposal') })
    })
    panel.update(editor.store.getState())

    parent.querySelector<HTMLButtonElement>('.ed-chat-tune')!.click()
    await flush()
    expect(parent.querySelector('.ed-chat-log')!.textContent).toContain('no valid proposal')
    panel.dispose()
  })

  it('persists provider, model, and API key changes', () => {
    const editor = createFakeProjectEditor()
    const parent = document.createElement('div')
    const settings = makeSettings()
    const saveSettings = vi.fn()
    const panel = mountChatOverlay(editor, parent, {
      loadSettings: () => settings,
      saveSettings,
      run: vi.fn()
    })

    const provider = parent.querySelector<HTMLSelectElement>('.ed-chat-provider')!
    provider.value = 'openai'
    provider.dispatchEvent(new Event('change'))
    expect(saveSettings).toHaveBeenLastCalledWith(expect.objectContaining({ provider: 'openai' }))

    const model = parent.querySelector<HTMLInputElement>('.ed-chat-model')!
    model.value = 'gpt-custom'
    model.dispatchEvent(new Event('change'))
    expect(saveSettings).toHaveBeenLastCalledWith(
      expect.objectContaining({ models: expect.objectContaining({ openai: 'gpt-custom' }) })
    )

    const key = parent.querySelector<HTMLInputElement>('.ed-chat-key')!
    key.value = 'new-secret'
    key.dispatchEvent(new Event('change'))
    expect(saveSettings).toHaveBeenLastCalledWith(
      expect.objectContaining({ apiKeys: expect.objectContaining({ openai: 'new-secret' }) })
    )
    panel.dispose()
  })

  it('defaultChatDeps wires a project sandbox through the injected provider and runner', async () => {
    const editor = createFakeProjectEditor()
    const settings = makeSettings()
    const fakeProvider = { id: 'anthropic' as const, defaultModel: 'm', send: vi.fn() }
    const runAgentFn = vi.fn(async () => ({
      finalText: 'ok', messages: [], executed: [], stoppedBy: 'end' as const
    }))
    const deps = defaultChatDeps({ createProviderFor: () => fakeProvider, runAgentFn })
    const output = await deps.run(fakeSnapshot(), 'go', editor, settings)

    expect(runAgentFn).toHaveBeenCalledOnce()
    expect(output.result.finalText).toBe('ok')
    expect(output.host.snapshot.scenes.arena!.entities).toHaveLength(1)
  })

  it('default dependencies persist settings and delegate tuning with target score one', async () => {
    localStorage.clear()
    const editor = createFakeProjectEditor()
    const settings = makeSettings()
    const tuneResult = {
      snapshot: fakeSnapshot(), commands: [], score: 1, iterations: 0, accepted: 0
    }
    const runTuningFn = vi.fn(async () => tuneResult)
    const deps = defaultChatDeps({
      createProviderFor: () => ({ id: 'anthropic', defaultModel: 'm', send: vi.fn() }),
      runTuningFn
    })

    expect(deps.loadSettings()).toMatchObject({ provider: 'anthropic' })
    deps.saveSettings(settings)
    expect(deps.loadSettings()).toEqual(settings)
    await expect(deps.tune!('tune', editor, settings)).resolves.toBe(tuneResult)
    expect(runTuningFn).toHaveBeenCalledWith(expect.objectContaining({
      core: editor, prompt: 'tune', targetScore: 1
    }))
  })

  it('ignores empty/duplicate submissions and renders a zero-change no-reply proposal', async () => {
    const editor = createFakeProjectEditor()
    const parent = document.createElement('div')
    const settings = makeSettings()
    let finish: ((value: Awaited<ReturnType<ChatOverlayDeps['run']>>) => void) | undefined
    const run = vi.fn(() => new Promise<Awaited<ReturnType<ChatOverlayDeps['run']>>>((resolve) => {
      finish = resolve
    }))
    const tune = vi.fn()
    const panel = mountChatOverlay(editor, parent, {
      loadSettings: () => settings,
      saveSettings: () => {},
      run,
      tune
    })
    const input = parent.querySelector<HTMLTextAreaElement>('.ed-chat-input')!
    const send = parent.querySelector<HTMLButtonElement>('.ed-chat-send')!

    send.click()
    expect(run).not.toHaveBeenCalled()
    input.value = 'inspect'
    send.click()
    send.click()
    parent.querySelector<HTMLButtonElement>('.ed-chat-tune')!.click()
    expect(run).toHaveBeenCalledOnce()
    expect(tune).not.toHaveBeenCalled()

    finish!({
      result: { finalText: '', messages: [], executed: [], stoppedBy: 'end' },
      host: createProjectToolHost({
        registration: editor.registration,
        initialSnapshot: editor.store.getState().snapshot
      })
    })
    await flush()
    const log = parent.querySelector('.ed-chat-log')!.textContent ?? ''
    expect(log).toContain('(no reply)')
    expect(log).toContain('No changes proposed.')
    panel.dispose()
  })

  it('renders provider stops and non-Error failures', async () => {
    const editor = createFakeProjectEditor()
    const parent = document.createElement('div')
    const settings = makeSettings()
    const run = vi.fn()
      .mockResolvedValueOnce({
        result: { finalText: 'stopped', messages: [], executed: [], stoppedBy: 'provider-stop' },
        host: createProjectToolHost({
          registration: editor.registration,
          initialSnapshot: editor.store.getState().snapshot
        })
      })
      .mockRejectedValueOnce('string failure')
    const panel = mountChatOverlay(editor, parent, {
      loadSettings: () => settings,
      saveSettings: () => {},
      run,
      tune: vi.fn(async () => { throw 'tune string failure' })
    })
    const input = parent.querySelector<HTMLTextAreaElement>('.ed-chat-input')!
    input.value = 'first'
    parent.querySelector<HTMLButtonElement>('.ed-chat-send')!.click()
    await flush()
    input.value = 'second'
    parent.querySelector<HTMLButtonElement>('.ed-chat-send')!.click()
    await flush()
    parent.querySelector<HTMLButtonElement>('.ed-chat-tune')!.click()
    await flush()

    const log = parent.querySelector('.ed-chat-log')!.textContent ?? ''
    expect(log).toContain('provider stop')
    expect(log).toContain('string failure')
    expect(log).toContain('tune string failure')
    panel.dispose()
  })
})
