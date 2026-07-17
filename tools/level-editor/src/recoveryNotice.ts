/** Renders the reversible notice shown after recovering a newer autosave snapshot. */
export function showRecoveryNotice(root: HTMLElement, opts: { onDiscard: () => void }): () => void {
  const banner = document.createElement('div')
  banner.className = 'ed-recovery-notice'
  banner.dataset.recoveryNotice = ''
  const message = document.createElement('span')
  message.textContent = 'Recovered unsaved changes from a previous session.'
  const discard = document.createElement('button')
  discard.type = 'button'
  discard.dataset.recoveryDiscard = ''
  discard.textContent = 'Discard recovered changes'
  const dismiss = document.createElement('button')
  dismiss.type = 'button'
  dismiss.dataset.recoveryDismiss = ''
  dismiss.textContent = 'Keep'
  const remove = (): void => banner.remove()
  discard.addEventListener('click', () => {
    opts.onDiscard()
    remove()
  })
  dismiss.addEventListener('click', remove)
  banner.append(message, discard, dismiss)
  root.append(banner)
  return remove
}
