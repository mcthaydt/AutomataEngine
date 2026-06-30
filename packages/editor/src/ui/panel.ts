/** A UI panel updated from one explicit state shape and disposable by its owner. */
export interface PanelHandle<State> {
  update(state: State): void
  dispose(): void
}
