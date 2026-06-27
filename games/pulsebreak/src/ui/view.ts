/** A self-contained DOM overlay that can be mounted and torn down. */
export interface View {
  element: HTMLElement
  dispose(): void
}
