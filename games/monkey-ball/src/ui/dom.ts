import type { View } from './view'

/** A full-screen overlay container: always carries `overlay` plus its own class. */
export function panel(className: string): HTMLElement {
  const element = document.createElement('div')
  element.className = `overlay ${className}`
  return element
}

/** A labelled button wired to a click handler. */
export function button(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const element = document.createElement('button')
  element.className = className
  element.textContent = label
  element.addEventListener('click', onClick)
  return element
}

/** Wraps a built element as a View whose teardown simply detaches it. */
export function staticView(element: HTMLElement): View {
  return { element, dispose() { element.remove() } }
}
