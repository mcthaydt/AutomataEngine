import { describe, expect, it } from 'vitest'
import { createNullRenderer, type PhysicsPort } from '@automata/engine'
import { createProjectEditor } from '../../../src/project/host'
import { renderProjectChrome } from '../../../src/ui/project/chrome'
import { fakeEditorRegistration, fakeSnapshot } from '../../fixtures/fakeProject'

function nullPhysics(): PhysicsPort {
  return {
    addBody() {}, removeBody() {}, setGravity() {}, step() { return [] }, readPose() { return null },
    readLinearVelocity() { return { x: 0, y: 0, z: 0 } }, applyImpulse() {}, setKinematicTarget() {},
    get bodyCount() { return 0 }, dispose() {}
  }
}

function setup() {
  const render = createNullRenderer()
  const core = createProjectEditor({ registration: fakeEditorRegistration, snapshot: fakeSnapshot(), render: render.port, physics: nullPhysics() })
  const root = document.createElement('div')
  const canvases = { '2d': document.createElement('canvas'), '3d': document.createElement('canvas') } as const
  return { core, root, canvases }
}

describe('project chrome', () => {
  it('mounts shared project regions without leaking any game name', () => {
    const { core, root, canvases } = setup()
    const handle = renderProjectChrome(core, root, canvases, {})
    expect(root.querySelector('[data-project-hierarchy]')).not.toBeNull()
    expect(root.querySelector('[data-project-resources]')).not.toBeNull()
    expect(root.querySelector('[data-project-inspector]')).not.toBeNull()
    expect(root.querySelector('[data-vp="main"]')).not.toBeNull()
    expect(root.textContent).not.toContain('Monkey Ball')
    expect(root.textContent).not.toContain('Pulsebreak')
    handle.dispose()
    expect(root.querySelector('.ed-root')).toBeNull()
  })

  it('exposes a save-status readout and play/stop toggle', () => {
    const { core, root, canvases } = setup()
    const handle = renderProjectChrome(core, root, canvases)
    expect(root.querySelector('[data-save-status]')).not.toBeNull()
    expect(root.querySelector('[data-play]')!.textContent).toBe('Play')
    handle.dispose()
  })

  it('mounts and disposes an injected project agent panel', () => {
    const { core, root, canvases } = setup()
    let disposed = false
    const handle = renderProjectChrome(core, root, canvases, {
      mountAgentPanel: (_editor, host) => {
        host.textContent = 'Agent'
        return { update() {}, dispose() { disposed = true } }
      }
    })
    expect(root.querySelector('.ed-chat-host')?.textContent).toBe('Agent')
    handle.dispose()
    expect(disposed).toBe(true)
  })
})
