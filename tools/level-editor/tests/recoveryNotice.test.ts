import { describe, expect, it, vi } from 'vitest'
import { showRecoveryNotice } from '../src/recoveryNotice'

describe('showRecoveryNotice', () => {
  it('renders a banner and discards recovered changes on demand', () => {
    const root = document.createElement('div')
    const onDiscard = vi.fn()
    showRecoveryNotice(root, { onDiscard })
    expect(root.querySelector('[data-recovery-notice]')).not.toBeNull()
    root.querySelector<HTMLButtonElement>('[data-recovery-discard]')!.click()
    expect(onDiscard).toHaveBeenCalledTimes(1)
    expect(root.querySelector('[data-recovery-notice]')).toBeNull()
  })

  it('keeps recovered changes and just dismisses', () => {
    const root = document.createElement('div')
    const onDiscard = vi.fn()
    showRecoveryNotice(root, { onDiscard })
    root.querySelector<HTMLButtonElement>('[data-recovery-dismiss]')!.click()
    expect(onDiscard).not.toHaveBeenCalled()
    expect(root.querySelector('[data-recovery-notice]')).toBeNull()
  })
})
