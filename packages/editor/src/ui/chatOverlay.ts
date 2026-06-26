import { runAgent, type AgentRunResult, type ProviderAdapter, type ProviderId } from '@automata/agent-core'
import type { SceneCommand } from '@automata/contracts'
import { diffDocs } from '../agent/diff'
import { createEditorToolHost, type EditorToolHost } from '../agent/editorToolHost'
import { createProvider, loadAgentSettings, saveAgentSettings, type AgentSettings } from '../agent/settings'
import { runTuning, type TuningRunResult } from '../agent/tuningRunner'
import type { EditorCore } from '../host'
import type { EditorState } from '../state/store'
import type { PanelHandle } from './panel'

export const CHAT_SYSTEM_PROMPT =
  'You are a level-editing assistant. Use the provided tools to edit the level document. ' +
  'Validate and test-play your changes before finishing. Make the smallest edit that satisfies the request.'

/** What a chat run returns: the agent result plus the sandbox host that holds the proposed commands. */
export interface ChatRunOutput<Doc> {
  result: AgentRunResult
  host: EditorToolHost<Doc>
}

export interface ChatOverlayDeps<Doc> {
  loadSettings: () => AgentSettings
  saveSettings: (settings: AgentSettings) => void
  run: (doc: Doc, prompt: string, core: EditorCore<Doc>, settings: AgentSettings) => Promise<ChatRunOutput<Doc>>
  /** Optional autonomous tuning pass; when present, a Tune button is shown. */
  tune?: (prompt: string, core: EditorCore<Doc>, settings: AgentSettings) => Promise<TuningRunResult<Doc>>
}

export interface DefaultChatDepsOptions {
  createProviderFor?: (settings: AgentSettings) => ProviderAdapter
  runAgentFn?: typeof runAgent
  runTuningFn?: typeof runTuning
}

export function defaultChatDeps<Doc>(opts: DefaultChatDepsOptions = {}): ChatOverlayDeps<Doc> {
  const makeProvider = opts.createProviderFor ?? createProvider
  const run = opts.runAgentFn ?? runAgent
  const tuneRun = opts.runTuningFn ?? runTuning
  return {
    loadSettings: () => loadAgentSettings(),
    saveSettings: (settings) => saveAgentSettings(settings),
    run: async (doc, prompt, core, settings) => {
      const host = createEditorToolHost<Doc>({ definition: core.definition, initialDoc: doc })
      const provider = makeProvider(settings)
      const result = await run({ provider, host, system: CHAT_SYSTEM_PROMPT, prompt })
      return { result, host }
    },
    tune: async (prompt, core, settings) => {
      const provider = makeProvider(settings)
      return tuneRun<Doc>({ core, provider, prompt, target: { minSteps: 300, maxSteps: 900 } })
    }
  }
}

export function mountChatOverlay<Doc>(
  core: EditorCore<Doc>,
  parent: HTMLElement,
  deps: ChatOverlayDeps<Doc> = defaultChatDeps<Doc>()
): PanelHandle<Doc> {
  const root = document.createElement('div')
  root.className = 'ed-panel ed-chat'
  parent.append(root)

  const head = document.createElement('div')
  head.className = 'ed-panel-head'
  head.textContent = 'Assistant'

  const controls = document.createElement('div')
  controls.className = 'ed-chat-controls'
  const provider = document.createElement('select')
  provider.className = 'ed-chat-provider'
  for (const id of ['anthropic', 'openai', 'deepseek'] as ProviderId[]) {
    const opt = document.createElement('option')
    opt.value = id
    opt.textContent = id
    provider.append(opt)
  }
  const model = document.createElement('input')
  model.className = 'ed-chat-model'
  model.type = 'text'
  model.placeholder = 'Model'
  const key = document.createElement('input')
  key.className = 'ed-chat-key'
  key.type = 'password'
  key.placeholder = 'API key'
  controls.append(provider, model, key)

  const log = document.createElement('div')
  log.className = 'ed-chat-log'

  const input = document.createElement('textarea')
  input.className = 'ed-chat-input'
  input.placeholder = 'Ask the assistant to edit the level...'
  const send = document.createElement('button')
  send.type = 'button'
  send.className = 'ed-chat-send'
  send.textContent = 'Send'
  const tuneButton = document.createElement('button')
  tuneButton.type = 'button'
  tuneButton.className = 'ed-chat-tune'
  tuneButton.textContent = 'Tune'
  tuneButton.hidden = deps.tune === undefined

  root.append(head, controls, log, input, send, tuneButton)

  let currentDoc = core.store.getState().document.doc
  let busy = false

  const appendMessage = (roleClass: string, text: string): void => {
    const row = document.createElement('div')
    row.className = `ed-chat-msg ed-chat-${roleClass}`
    row.dataset.role = roleClass
    row.textContent = text
    log.append(row)
  }

  const appendDiffBlock = (commands: SceneCommand[], beforeDoc: Doc, afterDoc: Doc, extraLine?: string): void => {
    const diff = diffDocs(core.definition, beforeDoc, afterDoc)
    const block = document.createElement('div')
    block.className = 'ed-chat-msg ed-chat-diff'
    block.dataset.role = 'diff'

    const summary = document.createElement('div')
    summary.className = 'ed-chat-diff-summary'
    summary.textContent =
      commands.length === 0
        ? `No changes proposed.${extraLine ? ` - ${extraLine}` : ''}`
        : `${commands.length} command${commands.length === 1 ? '' : 's'}: +${diff.addedCount} ~${diff.modifiedCount} -${diff.removedCount}` +
          (extraLine ? ` - ${extraLine}` : '')
    block.append(summary)

    for (const change of diff.changes) {
      const row = document.createElement('div')
      row.className = `ed-chat-diff-row ed-chat-diff-${change.kind}`
      row.textContent = `${change.kind} ${change.label} (${change.id})`
      block.append(row)
    }

    if (commands.length > 0) {
      const apply = document.createElement('button')
      apply.type = 'button'
      apply.className = 'ed-chat-apply'
      apply.textContent = 'Apply'
      apply.addEventListener('click', () => {
        core.store.dispatch({ type: 'commandBatch', commands })
        currentDoc = core.store.getState().document.doc
        apply.disabled = true
        apply.textContent = 'Applied'
      })
      block.append(apply)
    }

    log.append(block)
  }

  const renderProposal = (output: ChatRunOutput<Doc>): void => {
    appendDiffBlock(output.host.commands, currentDoc, output.host.doc)
  }

  const renderRunStatus = (output: ChatRunOutput<Doc>): void => {
    if (output.result.stoppedBy === 'end') {
      renderProposal(output)
      return
    }

    const reason = output.result.stoppedBy === 'max-turns' ? 'maximum turn limit' : 'provider stop'
    appendMessage('error', `Agent stopped before completing (${reason}).`)
  }

  const syncControls = (): void => {
    const settings = deps.loadSettings()
    provider.value = settings.provider
    model.value = settings.models[settings.provider]
    key.value = settings.apiKeys[settings.provider]
  }

  provider.addEventListener('change', () => {
    const settings = deps.loadSettings()
    settings.provider = provider.value as ProviderId
    deps.saveSettings(settings)
    model.value = settings.models[settings.provider]
    key.value = settings.apiKeys[settings.provider]
  })
  model.addEventListener('change', () => {
    const settings = deps.loadSettings()
    settings.models[settings.provider] = model.value
    deps.saveSettings(settings)
  })
  key.addEventListener('change', () => {
    const settings = deps.loadSettings()
    settings.apiKeys[settings.provider] = key.value
    deps.saveSettings(settings)
  })

  const submit = async (): Promise<void> => {
    const prompt = input.value.trim()
    if (!prompt || busy) return
    busy = true
    send.disabled = true
    appendMessage('user', prompt)
    input.value = ''
    try {
      const output = await deps.run(currentDoc, prompt, core, deps.loadSettings())
      appendMessage('assistant', output.result.finalText || '(no reply)')
      renderRunStatus(output)
    } catch (error) {
      appendMessage('error', error instanceof Error ? error.message : String(error))
    } finally {
      busy = false
      send.disabled = false
    }
  }
  send.addEventListener('click', () => void submit())

  const runTuningPass = async (): Promise<void> => {
    if (!deps.tune || busy) return
    busy = true
    send.disabled = true
    tuneButton.disabled = true
    appendMessage('user', 'Tune for solvability')
    try {
      const result = await deps.tune('Improve this level\'s solvability.', core, deps.loadSettings())
      appendDiffBlock(result.commands, currentDoc, result.doc, `score ${result.score.toFixed(2)}`)
    } catch (error) {
      appendMessage('error', error instanceof Error ? error.message : String(error))
    } finally {
      busy = false
      send.disabled = false
      tuneButton.disabled = false
    }
  }
  tuneButton.addEventListener('click', () => void runTuningPass())

  syncControls()

  return {
    update(state: EditorState<Doc>) {
      currentDoc = state.document.doc
    },
    dispose() {
      root.remove()
    }
  }
}
