import { memoryStorage } from '@automata/engine'
import { registerEditorProject } from '@automata/editor'
import { pulsebreakEditorRegistration } from 'pulsebreak/editor'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowserWorkspace } from '../src/browserWorkspace'
import type { ProjectCatalog } from '../src/projectCatalog'
import {
  mountEditorApp,
  type ProjectSessionFactory,
  type ProjectSessionHandle,
  type ProjectSessionMountOptions
} from '../src/editorApp'

const registration = registerEditorProject(pulsebreakEditorRegistration)
const catalog: ProjectCatalog = {
  list: () => [registration],
  get: (gameId) => gameId === registration.gameId ? registration : undefined
}
const workspace: BrowserWorkspace = {
  open: async () => null,
  openRecent: async () => null,
  importBundle: async () => null,
  listRecent: async () => [],
  exportBundle() {}
}

function sessionFactory(handle: ProjectSessionHandle) {
  const mounts: ProjectSessionMountOptions[] = []
  const factory: ProjectSessionFactory = async (options) => {
    mounts.push(options)
    options.root.replaceChildren(Object.assign(document.createElement('div'), { className: 'mounted-session' }))
    return handle
  }
  return { factory, mounts }
}

describe('generic editor app', () => {
  beforeEach(() => { document.body.replaceChildren() })

  it('preselects a deep-linked game and creates its template through the catalog', async () => {
    const root = document.createElement('main')
    document.body.append(root)
    const handle: ProjectSessionHandle = {
      canSave: false,
      hasUnsavedChanges: () => false,
      save: async () => true,
      exportBundle: () => {},
      dispose: () => {}
    }
    const mounted = sessionFactory(handle)
    const app = await mountEditorApp({
      root,
      catalog,
      workspace,
      autosaveStorage: memoryStorage(),
      query: '?game=pulsebreak',
      createSession: mounted.factory
    })

    const create = root.querySelector<HTMLButtonElement>('[data-create-game="pulsebreak"]')!
    expect(create.dataset.preselected).toBe('true')
    create.click()
    await vi.waitFor(() => expect(mounted.mounts).toHaveLength(1))
    expect(mounted.mounts[0]!.snapshot.manifest.gameId).toBe('pulsebreak')

    app.dispose()
    expect(document.getElementById('editor-slate-pro')).toBeNull()
  })

  it('keeps a dirty session mounted when project switching is cancelled', async () => {
    const root = document.createElement('main')
    document.body.append(root)
    let switchProject: (() => Promise<void>) | undefined
    const dispose = vi.fn()
    const handle: ProjectSessionHandle = {
      canSave: false,
      hasUnsavedChanges: () => true,
      save: async () => false,
      exportBundle: () => {},
      dispose
    }
    const mounted = sessionFactory(handle)
    let mountResolved = false
    const factory: ProjectSessionFactory = async (options) => {
      switchProject = options.onSwitchProject
      const result = await mounted.factory(options)
      mountResolved = true
      return result
    }
    const app = await mountEditorApp({
      root,
      catalog,
      workspace,
      autosaveStorage: memoryStorage(),
      query: '',
      createSession: factory,
      chooseDirtyAction: async () => 'cancel'
    })
    root.querySelector<HTMLButtonElement>('[data-create-game="pulsebreak"]')!.click()
    await vi.waitFor(() => expect(mountResolved).toBe(true))
    expect(switchProject).toBeDefined()

    await switchProject!()

    expect(dispose).not.toHaveBeenCalled()
    expect(root.querySelector('.mounted-session')).not.toBeNull()
    app.dispose()
  })

  it('shows invalid deep links as chooser errors instead of opening a session', async () => {
    const root = document.createElement('main')
    document.body.append(root)
    const mounted = sessionFactory({
      canSave: false,
      hasUnsavedChanges: () => false,
      save: async () => true,
      exportBundle: () => {},
      dispose: () => {}
    })

    const app = await mountEditorApp({
      root,
      catalog,
      workspace,
      autosaveStorage: memoryStorage(),
      query: '?game=missing',
      createSession: mounted.factory
    })

    expect(root.querySelector('[data-chooser-error]')?.textContent).toMatch(/missing/)
    expect(mounted.mounts).toHaveLength(0)
    app.dispose()
  })

  it('restores the chooser when session creation fails', async () => {
    const root = document.createElement('main')
    document.body.append(root)
    const app = await mountEditorApp({
      root,
      catalog,
      workspace,
      autosaveStorage: memoryStorage(),
      query: '',
      createSession: async () => { throw new Error('renderer unavailable') }
    })

    root.querySelector<HTMLButtonElement>('[data-create-game="pulsebreak"]')!.click()

    await vi.waitFor(() => expect(root.querySelector('[data-chooser-error]')?.textContent ?? '').toContain('renderer unavailable'))
    expect(root.querySelector('[data-project-chooser]')).not.toBeNull()
    app.dispose()
  })
})
