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

  it('opens folders and recent-project deep links through the chooser', async () => {
    const root = document.createElement('main')
    document.body.append(root)
    const project = registration.createTemplate()
    const recentWorkspace: BrowserWorkspace = {
      ...workspace,
      open: vi.fn(async () => ({ snapshot: project, storage: null, source: 'folder' as const })),
      openRecent: vi.fn(async () => ({ snapshot: project, storage: null, source: 'recent' as const })),
      listRecent: vi.fn(async () => [{
        projectId: project.manifest.id,
        name: project.manifest.name,
        savedAt: 1
      }])
    }
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
      workspace: recentWorkspace,
      autosaveStorage: memoryStorage(),
      query: `?project=${project.manifest.id}`,
      createSession: mounted.factory
    })

    await vi.waitFor(() => expect(mounted.mounts).toHaveLength(1))
    expect(recentWorkspace.openRecent).toHaveBeenCalledWith(project.manifest.id)
    app.dispose()

    const secondRoot = document.createElement('main')
    const second = sessionFactory({
      canSave: false, hasUnsavedChanges: () => false, save: async () => true,
      exportBundle: () => {}, dispose: () => {}
    })
    const secondApp = await mountEditorApp({
      root: secondRoot,
      catalog,
      workspace: recentWorkspace,
      autosaveStorage: memoryStorage(),
      query: '',
      createSession: second.factory
    })
    secondRoot.querySelector<HTMLButtonElement>('[data-open-project]')!.click()
    await vi.waitFor(() => expect(second.mounts).toHaveLength(1))
    secondApp.dispose()
  })

  it('surfaces unavailable recent projects and unknown project registrations', async () => {
    const missingRoot = document.createElement('main')
    const missingApp = await mountEditorApp({
      root: missingRoot,
      catalog,
      workspace: { ...workspace, openRecent: async () => null },
      autosaveStorage: memoryStorage(),
      query: '?project=gone',
      createSession: vi.fn()
    })
    expect(missingRoot.querySelector('[data-chooser-error]')?.textContent).toContain('unavailable')
    missingApp.dispose()

    const unknown = registration.createTemplate()
    unknown.manifest.gameId = 'unknown'
    const unknownRoot = document.createElement('main')
    const unknownApp = await mountEditorApp({
      root: unknownRoot,
      catalog,
      workspace: {
        ...workspace,
        open: async () => ({ snapshot: unknown, storage: null, source: 'bundle' })
      },
      autosaveStorage: memoryStorage(),
      query: '',
      createSession: vi.fn()
    })
    unknownRoot.querySelector<HTMLButtonElement>('[data-open-project]')!.click()
    await vi.waitFor(() => {
      expect(unknownRoot.querySelector('[data-chooser-error]')?.textContent).toContain('Unknown project game')
    })
    unknownApp.dispose()
  })

  it('opens legacy recovery and clears it only through the persisted callback', async () => {
    const root = document.createElement('main')
    const markPersisted = vi.fn()
    const mounted = sessionFactory({
      canSave: false, hasUnsavedChanges: () => true, save: async () => true,
      exportBundle: () => {}, dispose: () => {}
    })
    const app = await mountEditorApp({
      root,
      catalog,
      workspace,
      autosaveStorage: memoryStorage(),
      query: '',
      legacyRecovery: { snapshot: registration.createTemplate(), markPersisted },
      createSession: mounted.factory
    })

    root.querySelector<HTMLButtonElement>('[data-recover-legacy]')!.click()
    await vi.waitFor(() => expect(mounted.mounts).toHaveLength(1))
    expect(mounted.mounts[0]).toMatchObject({ initiallyDirty: true })
    mounted.mounts[0]!.onPersisted?.()
    expect(markPersisted).toHaveBeenCalledOnce()
    app.dispose()
  })

  it.each([
    ['save', true],
    ['export', false],
    ['discard', false]
  ] as const)('handles the built-in dirty %s decision', async (action, canSave) => {
    const root = document.createElement('main')
    let switchProject: (() => Promise<void>) | undefined
    const save = vi.fn(async () => true)
    const exportBundle = vi.fn()
    const dispose = vi.fn()
    const mounted = sessionFactory({
      canSave,
      hasUnsavedChanges: () => true,
      save,
      exportBundle,
      dispose
    })
    let mountResolved = false
    const factory: ProjectSessionFactory = async (options) => {
      switchProject = options.onSwitchProject
      const result = await mounted.factory(options)
      mountResolved = true
      return result
    }
    const app = await mountEditorApp({
      root, catalog, workspace, autosaveStorage: memoryStorage(), query: '',
      createSession: factory
    })
    root.querySelector<HTMLButtonElement>('[data-create-game]')!.click()
    await vi.waitFor(() => expect(mountResolved).toBe(true))

    const switching = switchProject!()
    await vi.waitFor(() => expect(root.querySelector('[data-dirty-dialog]')).not.toBeNull())
    const label = action[0]!.toUpperCase() + action.slice(1)
    ;[...root.querySelectorAll<HTMLButtonElement>('[data-dirty-dialog] button')]
      .find((button) => button.textContent === label)!.click()
    await switching

    if (action === 'save') expect(save).toHaveBeenCalledOnce()
    if (action === 'export') expect(exportBundle).toHaveBeenCalledOnce()
    expect(dispose).toHaveBeenCalledOnce()
    expect(root.querySelector('[data-project-chooser]')).not.toBeNull()
    app.dispose()
  })
})
