import {
  createFileSystemProjectStorage,
  createRecentProjects,
  exportProjectBundle,
  importProjectBundle,
  type DirectoryHandleLike,
  type PermissionState,
  type ProjectStoragePort,
  type RecentProjectMeta,
  type RegisteredEditorProject
} from '@automata/editor'
import type { ProjectSnapshot } from '@automata/project'

export interface BrowserWorkspaceDependencies {
  indexedDB: IDBFactory
  showDirectoryPicker?: () => Promise<DirectoryHandleLike>
  pickBundleText(): Promise<string | null>
  queryPermission(handle: DirectoryHandleLike): Promise<PermissionState>
  requestPermission(handle: DirectoryHandleLike): Promise<'granted' | 'denied'>
  createObjectURL(blob: Blob): string
  revokeObjectURL(url: string): void
  clickDownload(url: string, filename: string): void
  now(): number
}

export interface OpenedBrowserProject {
  snapshot: ProjectSnapshot
  storage: ProjectStoragePort | null
  source: 'folder' | 'bundle' | 'recent'
}

export interface BrowserWorkspace {
  open(registration?: RegisteredEditorProject): Promise<OpenedBrowserProject | null>
  openRecent(projectId: string, registration?: RegisteredEditorProject): Promise<OpenedBrowserProject | null>
  importBundle(registration?: RegisteredEditorProject): Promise<OpenedBrowserProject | null>
  listRecent(): Promise<RecentProjectMeta[]>
  exportBundle(registration: RegisteredEditorProject, snapshot: ProjectSnapshot): void
}

/** Adapt browser folder, file-input, download, permission, and IndexedDB APIs. */
export function createBrowserWorkspace(dependencies: BrowserWorkspaceDependencies): BrowserWorkspace {
  const recent = createRecentProjects(dependencies.indexedDB, {
    query: dependencies.queryPermission,
    request: dependencies.requestPermission
  })

  const openBundle = async (registration?: RegisteredEditorProject): Promise<OpenedBrowserProject | null> => {
    const text = await dependencies.pickBundleText()
    if (text === null) return null
    const snapshot = importProjectBundle(text).snapshot
    if (registration) assertGame(registration, snapshot)
    return { snapshot, storage: null, source: 'bundle' }
  }

  const openDirectory = async (
    directory: DirectoryHandleLike,
    registration: RegisteredEditorProject | undefined,
    source: 'folder' | 'recent'
  ): Promise<OpenedBrowserProject> => {
    const storage = createFileSystemProjectStorage(
      directory,
      registration ? { validate: registration.validate } : {}
    )
    const snapshot = await storage.open()
    if (registration) assertGame(registration, snapshot)
    if (source === 'folder') {
      await recent.put({
        projectId: snapshot.manifest.id,
        name: snapshot.manifest.name,
        handle: directory,
        savedAt: dependencies.now()
      })
    }
    return { snapshot, storage, source }
  }

  return {
    async open(registration) {
      if (!dependencies.showDirectoryPicker) return openBundle(registration)
      try {
        return await openDirectory(await dependencies.showDirectoryPicker(), registration, 'folder')
      } catch (error) {
        if (!isPermissionOrCancel(error)) throw error
        return openBundle(registration)
      }
    },
    async openRecent(projectId, registration) {
      const directory = await recent.get(projectId)
      return directory ? openDirectory(directory, registration, 'recent') : null
    },
    importBundle: openBundle,
    listRecent: () => recent.list(),
    exportBundle(registration, snapshot) {
      assertGame(registration, snapshot)
      const exported = exportProjectBundle(snapshot, { validate: registration.validate })
      const url = dependencies.createObjectURL(new Blob([exported.text], { type: 'application/json' }))
      try {
        dependencies.clickDownload(url, `${snapshot.manifest.id}.automata.json`)
      } finally {
        dependencies.revokeObjectURL(url)
      }
    }
  }
}

function assertGame(registration: RegisteredEditorProject, snapshot: ProjectSnapshot): void {
  if (snapshot.manifest.gameId !== registration.gameId) {
    throw new Error(
      `Project game "${snapshot.manifest.gameId}" does not match "${registration.gameId}"`
    )
  }
}

function isPermissionOrCancel(error: unknown): boolean {
  return error instanceof DOMException && (
    error.name === 'NotAllowedError' || error.name === 'AbortError'
  )
}
