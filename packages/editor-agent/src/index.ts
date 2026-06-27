import { defaultChatDeps, mountChatOverlay, type ChatOverlayDeps } from './chatOverlay'
import type { EditorCore } from '@automata/editor'
import type { PanelHandle } from '@automata/editor/ui'

export { mountChatOverlay, defaultChatDeps, CHAT_SYSTEM_PROMPT } from './chatOverlay'
export type { ChatOverlayDeps, ChatRunOutput, DefaultChatDepsOptions } from './chatOverlay'
export { runTuning, type TuningRunResult } from './tuningRunner'
export {
  loadAgentSettings,
  saveAgentSettings,
  createProvider,
  defaultAgentSettings,
  type AgentSettings
} from './settings'

/** Build the optional chrome hook that mounts the chat assistant panel. */
export function createAgentPanelMount<Doc>(
  deps?: ChatOverlayDeps<Doc>
): (core: EditorCore<Doc>, host: HTMLElement) => PanelHandle<Doc> {
  return (core, host) => mountChatOverlay(core, host, deps ?? defaultChatDeps<Doc>())
}
