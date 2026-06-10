import { ENGINE_VERSION } from '@automata/engine'

export function renderSkeleton(root: HTMLElement): void {
  root.textContent = `monkey-ball on AutomataEngine ${ENGINE_VERSION}`
}
