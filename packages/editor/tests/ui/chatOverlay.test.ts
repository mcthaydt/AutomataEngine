import { createNullRenderer, type PhysicsPort } from '@automata/engine'
import { describe, expect, it, vi } from 'vitest'
import { createEditor } from '../../src/host'
import { createEditorToolHost } from '../../src/agent/editorToolHost'
import { defaultChatDeps, mountChatOverlay, type ChatOverlayDeps } from '../../src/ui/chatOverlay'
import type { AgentSettings } from '../../src/agent/settings'
import { boxItem, playableDefinition, type FakeDoc } from '../fixtures/fakeDefinition'

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
    get bodyCount() { return 0 },
    dispose() {}
  }) as PhysicsPort

function makeEditor() {
  const editor = createEditor<FakeDoc>({
    definition: playableDefinition,
    render: createNullRenderer().port,
    physics: nullPhysics()
  })
  editor.store.dispatch({ type: 'loadDoc', doc: { title: 'lvl', items: [boxItem('a')] } })
  return editor
}

const makeSettings = (): AgentSettings => ({
  provider: 'anthropic',
  apiKeys: { anthropic: 'k', openai: '', deepseek: '' },
  models: { anthropic: 'claude-opus-4-8', openai: 'gpt-5', deepseek: 'deepseek-chat' }
})

const flush = () => new Promise((r) => setTimeout(r, 0))

describe('chat overlay', () => {
  it('sends a prompt and renders the assistant reply + proposed-change count', async () => {
    const editor = makeEditor()
    const parent = document.createElement('div')
    const settings = makeSettings()
    const run = vi.fn(async (doc: FakeDoc) => {
      const host = createEditorToolHost({ definition: playableDefinition, initialDoc: doc })
      await host.executeTool('addItem', { item: boxItem('b') })
      return { result: { finalText: 'added a box', messages: [], executed: [], stoppedBy: 'end' as const }, host }
    })
    const deps: ChatOverlayDeps<FakeDoc> = {
      loadSettings: () => settings,
      saveSettings: () => {},
      run
    }
    const panel = mountChatOverlay(editor, parent, deps)
    panel.update(editor.store.getState())

    const input = parent.querySelector<HTMLTextAreaElement>('.ed-chat-input')!
    input.value = 'add a box near the goal'
    parent.querySelector<HTMLButtonElement>('.ed-chat-send')!.click()
    await flush()

    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({ items: [expect.objectContaining({ id: 'a' })] }),
      'add a box near the goal',
      editor,
      settings
    )
    const log = parent.querySelector('.ed-chat-log')!.textContent ?? ''
    expect(log).toContain('add a box near the goal')
    expect(log).toContain('added a box')
    expect(log).toContain('1 proposed change')
    expect(playableDefinition.scene.listItems(editor.store.getState().document.doc)).toHaveLength(1)
    panel.dispose()
  })

  it('persists a provider change through saveSettings', () => {
    const editor = makeEditor()
    const parent = document.createElement('div')
    const settings = makeSettings()
    const saveSettings = vi.fn()
    const panel = mountChatOverlay(editor, parent, {
      loadSettings: () => settings,
      saveSettings,
      run: vi.fn()
    })
    const select = parent.querySelector<HTMLSelectElement>('.ed-chat-provider')!
    select.value = 'openai'
    select.dispatchEvent(new Event('change'))
    expect(saveSettings).toHaveBeenCalledWith(expect.objectContaining({ provider: 'openai' }))
    panel.dispose()
  })

  it('persists a model change for the active provider', () => {
    const editor = makeEditor()
    const parent = document.createElement('div')
    const settings = makeSettings()
    const saveSettings = vi.fn()
    const panel = mountChatOverlay(editor, parent, {
      loadSettings: () => settings,
      saveSettings,
      run: vi.fn()
    })
    const model = parent.querySelector<HTMLInputElement>('.ed-chat-model')!
    model.value = 'claude-custom'
    model.dispatchEvent(new Event('change'))
    expect(saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ models: expect.objectContaining({ anthropic: 'claude-custom' }) })
    )
    panel.dispose()
  })

  it('defaultChatDeps wires a sandbox host + injected provider/runAgent', async () => {
    const editor = makeEditor()
    const settings = makeSettings()
    const fakeProvider = { id: 'anthropic' as const, defaultModel: 'm', send: vi.fn() }
    const runAgentFn = vi.fn(async () => ({
      finalText: 'ok',
      messages: [],
      executed: [],
      stoppedBy: 'end' as const
    }))
    const deps = defaultChatDeps<FakeDoc>({ createProviderFor: () => fakeProvider, runAgentFn })
    const output = await deps.run({ title: 'lvl', items: [boxItem('a')] }, 'go', editor, settings)
    expect(runAgentFn).toHaveBeenCalledOnce()
    expect(output.result.finalText).toBe('ok')
    expect(output.host.doc.items).toHaveLength(1)
  })
})
