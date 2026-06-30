import { runAgent, type AgentRunResult, type ProviderAdapter, type ProviderId } from '@automata/agent-core'
import type { ProjectEditorCore, ProjectEditorState } from '@automata/editor'
import { createProjectToolHost, type EditorProjectToolHost } from '@automata/editor/headless'
import type { ProjectCommand, ProjectSnapshot } from '@automata/project'
import { diffProjects } from './diff'
import { createProvider, loadAgentSettings, saveAgentSettings, type AgentSettings } from './settings'
import {
  runTuning,
  type ProjectAgentRunner,
  type TuningRunResult
} from './tuningRunner'

export const CHAT_SYSTEM_PROMPT =
  'You are a project-editing assistant. Use the provided tools to edit the game project. ' +
  'Validate and evaluate changes when those capabilities are available. ' +
  'Make the smallest edit that satisfies the request.'

/** Agent output plus the isolated project host containing its proposed batch. */
export interface ChatRunOutput {
  result: AgentRunResult
  host: EditorProjectToolHost
}

export interface ChatOverlayDeps {
  loadSettings: () => AgentSettings
  saveSettings: (settings: AgentSettings) => void
  run: (
    snapshot: ProjectSnapshot,
    prompt: string,
    core: ProjectEditorCore,
    settings: AgentSettings
  ) => Promise<ChatRunOutput>
  /** Optional autonomous tuning pass; evaluation support also must be registered. */
  tune?: (
    prompt: string,
    core: ProjectEditorCore,
    settings: AgentSettings
  ) => Promise<TuningRunResult>
}

export interface DefaultChatDepsOptions {
  createProviderFor?: (settings: AgentSettings) => ProviderAdapter
  runAgentFn?: ProjectAgentRunner
  runTuningFn?: typeof runTuning
}

export interface ProjectAgentPanelHandle {
  update(state: ProjectEditorState): void
  dispose(): void
}

export function defaultChatDeps(options: DefaultChatDepsOptions = {}): ChatOverlayDeps {
  const makeProvider = options.createProviderFor ?? createProvider
  const run: ProjectAgentRunner = options.runAgentFn ?? runAgent
  const tuneRun = options.runTuningFn ?? runTuning
  return {
    loadSettings: () => loadAgentSettings(),
    saveSettings: (settings) => saveAgentSettings(settings),
    run: async (snapshot, prompt, core, settings) => {
      const host = createProjectToolHost({ registration: core.registration, initialSnapshot: snapshot })
      const provider = makeProvider(settings)
      const result = await run({ provider, host, system: CHAT_SYSTEM_PROMPT, prompt })
      return { result, host }
    },
    tune: async (prompt, core, settings) => {
      const provider = makeProvider(settings)
      return tuneRun({ core, provider, prompt, targetScore: 1 })
    }
  }
}

export function mountChatOverlay(
  core: ProjectEditorCore,
  parent: HTMLElement,
  deps: ChatOverlayDeps = defaultChatDeps()
): ProjectAgentPanelHandle {
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
    const option = document.createElement('option')
    option.value = id
    option.textContent = id
    provider.append(option)
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
  input.placeholder = 'Ask the assistant to edit the project...'
  const send = document.createElement('button')
  send.type = 'button'
  send.className = 'ed-chat-send'
  send.textContent = 'Send'
  const tuneButton = document.createElement('button')
  tuneButton.type = 'button'
  tuneButton.className = 'ed-chat-tune'
  tuneButton.textContent = 'Tune'
  tuneButton.hidden = deps.tune === undefined || core.registration.evaluate === undefined

  root.append(head, controls, log, input, send, tuneButton)

  let currentSnapshot = core.store.getState().snapshot
  let busy = false

  const appendMessage = (roleClass: string, text: string): void => {
    const row = document.createElement('div')
    row.className = `ed-chat-msg ed-chat-${roleClass}`
    row.dataset.role = roleClass
    row.textContent = text
    log.append(row)
  }

  const appendDiffBlock = (
    commands: readonly ProjectCommand[],
    before: ProjectSnapshot,
    after: ProjectSnapshot,
    extraLine?: string
  ): void => {
    const diff = diffProjects(before, after)
    const block = document.createElement('div')
    block.className = 'ed-chat-msg ed-chat-diff'
    block.dataset.role = 'diff'

    const summary = document.createElement('div')
    summary.className = 'ed-chat-diff-summary'
    summary.textContent = commands.length === 0
      ? `No changes proposed.${extraLine ? ` - ${extraLine}` : ''}`
      : `${commands.length} command${commands.length === 1 ? '' : 's'}: ` +
        `+${diff.addedCount} ~${diff.modifiedCount} -${diff.removedCount}` +
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
        core.store.dispatch({ type: 'projectCommandBatch', commands: [...commands] })
        currentSnapshot = core.store.getState().snapshot
        apply.disabled = true
        apply.textContent = 'Applied'
      })
      block.append(apply)
    }

    log.append(block)
  }

  const renderRunStatus = (output: ChatRunOutput): void => {
    if (output.result.stoppedBy === 'end') {
      appendDiffBlock(output.host.commands, currentSnapshot, output.host.snapshot)
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
      const output = await deps.run(currentSnapshot, prompt, core, deps.loadSettings())
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
    if (!deps.tune || busy || !core.registration.evaluate) return
    busy = true
    send.disabled = true
    tuneButton.disabled = true
    appendMessage('user', 'Tune project')
    try {
      const result = await deps.tune('Improve this project\'s evaluation score.', core, deps.loadSettings())
      appendDiffBlock(result.commands, currentSnapshot, result.snapshot, `score ${result.score.toFixed(2)}`)
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
    update(state) {
      currentSnapshot = state.snapshot
    },
    dispose() {
      root.remove()
    }
  }
}
