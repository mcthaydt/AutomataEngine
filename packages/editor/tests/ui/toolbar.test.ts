import { describe, expect, it } from 'vitest'
import { createNullRenderer, type PhysicsPort } from '@automata/engine'
import { createEditor } from '../../src/host'
import { mountToolbar } from '../../src/ui/toolbar'
import { boxItem, playableDefinition, type FakeDoc } from '../fixtures/fakeDefinition'

const nullPhysics = () => ({
  addBody() {},
  removeBody() {},
  setGravity() {},
  step: () => [],
  readPose: () => null,
  readLinearVelocity: () => ({ x: 0, y: 0, z: 0 }),
  applyImpulse() {},
  setKinematicTarget() {},
  get bodyCount() { return 0 },
  dispose() {}
}) as unknown as PhysicsPort

const startMarker = {
  ...boxItem('m'),
  id: 'marker:start',
  kind: 'marker' as const,
  shape: { type: 'marker' as const, markerId: 'start' }
}

describe('toolbar', () => {
  it('toggles play mode via the Play button', () => {
    const host = document.createElement('div')
    const editor = createEditor<FakeDoc>({
      definition: playableDefinition,
      render: createNullRenderer().port,
      physics: nullPhysics()
    })
    editor.store.dispatch({ type: 'command', command: { type: 'addItem', item: startMarker } })
    const handle = mountToolbar(editor, host)

    host.querySelector<HTMLButtonElement>('[data-action="play"]')!.click()
    expect(editor.store.getState().mode).toBe('play')
    host.querySelector<HTMLButtonElement>('[data-action="play"]')!.click()
    expect(editor.store.getState().mode).toBe('edit')

    handle.dispose()
    editor.dispose()
  })

  it('Export reports invalid for the empty doc and valid once required markers exist', () => {
    const host = document.createElement('div')
    const editor = createEditor<FakeDoc>({
      definition: playableDefinition,
      render: createNullRenderer().port,
      physics: nullPhysics()
    })
    const handle = mountToolbar(editor, host)
    const status = host.querySelector('[data-export-status]')!

    host.querySelector<HTMLButtonElement>('[data-action="export"]')!.click()
    expect(status.textContent).toContain('Start')
    editor.store.dispatch({ type: 'command', command: { type: 'addItem', item: startMarker } })
    host.querySelector<HTMLButtonElement>('[data-action="export"]')!.click()
    expect(status.textContent).toContain('Exported')

    handle.dispose()
    editor.dispose()
  })
})
