import type { ProjectEditorCore } from '@automata/editor'
import {
  defaultChatDeps,
  mountChatOverlay,
  type ChatOverlayDeps,
  type ProjectAgentPanelHandle
} from './chatOverlay'

export { mountChatOverlay, defaultChatDeps, CHAT_SYSTEM_PROMPT } from './chatOverlay'
export type {
  ChatOverlayDeps,
  ChatRunOutput,
  DefaultChatDepsOptions,
  ProjectAgentPanelHandle
} from './chatOverlay'
export { diffProjects, type ProjectChange, type ProjectDiff } from './diff'
export {
  runTuning,
  type ProjectAgentRunner,
  type ProjectAgentRunOptions,
  type TuningRunOptions,
  type TuningRunResult
} from './tuningRunner'
export {
  loadAgentSettings,
  saveAgentSettings,
  createProvider,
  defaultAgentSettings,
  type AgentSettings
} from './settings'

/** Build the optional project-chrome hook that mounts the assistant panel. */
export function createAgentPanelMount(
  deps?: ChatOverlayDeps
): (core: ProjectEditorCore, host: HTMLElement) => ProjectAgentPanelHandle {
  return (core, host) => mountChatOverlay(core, host, deps ?? defaultChatDeps())
}
