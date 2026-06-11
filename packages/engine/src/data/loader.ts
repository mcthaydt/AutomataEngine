import { DataLoadError, parseData, type DataKind } from './registry'

export interface DataLoader {
  load<T>(kind: DataKind<T>, url: string): Promise<T>
}

export function createLoader(fetchText: (url: string) => Promise<string>): DataLoader {
  return {
    async load(kind, url) {
      let text: string
      try {
        text = await fetchText(url)
      } catch (cause) {
        throw new DataLoadError(url, kind.name,
          [cause instanceof Error ? cause.message : String(cause)])
      }
      return parseData(kind, text, url)
    }
  }
}

/** Browser default: fetch a same-origin asset as text (used by apps). */
export function fetchTextViaFetch(fetchImpl: typeof fetch = fetch): (url: string) => Promise<string> {
  return async (url) => {
    const response = await fetchImpl(url)
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`)
    return response.text()
  }
}
