import { ENGINE_VERSION } from '@automata/engine'

export function renderSkeleton(root: HTMLElement): void {
  root.textContent = `level-editor on AutomataEngine ${ENGINE_VERSION}`
}
