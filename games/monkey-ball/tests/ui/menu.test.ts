import { describe, expect, it } from 'vitest'
import { createGameStore } from '../../src/state/root'
import { createMenu } from '../../src/ui/menu'

describe('createMenu', () => {
  it('Play opens level select', () => {
    const store = createGameStore()
    store.dispatch({ type: 'bootCompleted' })
    const view = createMenu(store)

    view.element.querySelector<HTMLButtonElement>('.menu-play')!.click()

    expect(store.getState().scene).toBe('levelSelect')
  })
})
