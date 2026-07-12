export interface ProjectReader {
  readText(path: string): Promise<string>
}

/** Reads project files relative to the document base or an explicit base URI. */
export function createProjectReader(baseURI: string = document.baseURI): ProjectReader {
  return {
    async readText(path) {
      const response = await fetch(new URL(`project/${path}`, baseURI))
      if (!response.ok) throw new Error(`Project request failed (${response.status}): ${path}`)
      return response.text()
    }
  }
}
