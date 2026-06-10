import { parse as parseToml } from 'smol-toml'
import { parse as parseYaml } from 'yaml'

export type DataFormat = 'toml' | 'yaml' | 'json'

export class ParseError extends Error {
  constructor(readonly format: DataFormat, cause: unknown) {
    super(`Invalid ${format}: ${cause instanceof Error ? cause.message : String(cause)}`)
    this.name = 'ParseError'
  }
}

export function parseByFormat(format: DataFormat, text: string): unknown {
  try {
    switch (format) {
      case 'toml': return parseToml(text)
      case 'yaml': {
        const result = parseYaml(text)
        if (result === null || typeof result !== 'object') throw new Error('not a YAML mapping')
        return result
      }
      case 'json': return JSON.parse(text)
    }
  } catch (cause) {
    throw new ParseError(format, cause)
  }
}
