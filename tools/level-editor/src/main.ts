import { fetchTextViaFetch, localStorageAdapter } from '@automata/engine'
import type { DirectoryHandleLike, PermissionState } from '@automata/editor'
import { createBrowserWorkspace } from './browserWorkspace'
import { mountEditorApp } from './editorApp'
import { createProjectCatalog } from './projectCatalog'

type BrowserDirectoryHandle = DirectoryHandleLike & {
  queryPermission?(options: { mode: 'readwrite' }): Promise<PermissionState>
  requestPermission?(options: { mode: 'readwrite' }): Promise<'granted' | 'denied'>
}

type DirectoryPickerWindow = Window & typeof globalThis & {
  showDirectoryPicker?: () => Promise<BrowserDirectoryHandle>
}

function bootError(error: unknown): HTMLElement {
  const panel = document.createElement('div')
  panel.className = 'boot-error'
  panel.textContent = `Failed to start: ${error instanceof Error ? error.message : String(error)}`
  return panel
}

/** Resolve one user-selected bundle file without retaining DOM or file handles. */
function pickBundleText(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.hidden = true
    const finish = (value: string | null): void => {
      input.remove()
      resolve(value)
    }
    input.addEventListener('change', () => {
      const file = input.files?.[0]
      if (!file) finish(null)
      else void file.text().then(finish, () => finish(null))
    }, { once: true })
    input.addEventListener('cancel', () => finish(null), { once: true })
    document.body.append(input)
    input.click()
  })
}

async function main(): Promise<void> {
  const root = document.getElementById('app')
  if (!root) throw new Error('Missing #app')

  try {
    const catalog = await createProjectCatalog({ readText: fetchTextViaFetch() })
    const pickerWindow = window as DirectoryPickerWindow
    const workspace = createBrowserWorkspace({
      indexedDB: window.indexedDB,
      showDirectoryPicker: pickerWindow.showDirectoryPicker
        ? () => pickerWindow.showDirectoryPicker!()
        : undefined,
      pickBundleText,
      queryPermission: async (handle) => {
        const browserHandle = handle as BrowserDirectoryHandle
        return browserHandle.queryPermission?.({ mode: 'readwrite' }) ?? 'denied'
      },
      requestPermission: async (handle) => {
        const browserHandle = handle as BrowserDirectoryHandle
        return browserHandle.requestPermission?.({ mode: 'readwrite' }) ?? 'denied'
      },
      createObjectURL: (blob) => URL.createObjectURL(blob),
      revokeObjectURL: (url) => URL.revokeObjectURL(url),
      clickDownload: (url, filename) => {
        const link = document.createElement('a')
        link.href = url
        link.download = filename
        link.click()
      },
      now: () => Date.now()
    })
    const app = await mountEditorApp({
      root,
      catalog,
      workspace,
      autosaveStorage: localStorageAdapter(),
      query: window.location.search
    })

    const onBeforeUnload = (event: BeforeUnloadEvent): void => {
      if (!app.hasUnsavedChanges()) return
      event.preventDefault()
      event.returnValue = ''
    }
    const onPageHide = (): void => app.dispose()
    window.addEventListener('beforeunload', onBeforeUnload)
    window.addEventListener('pagehide', onPageHide, { once: true })
  } catch (error) {
    root.replaceChildren(bootError(error))
  }
}

void main()
