import type { ZodType } from 'zod'
import { parseByFormat, type DataFormat } from './parsers'

export class DataLoadError extends Error {
  constructor(readonly file: string, readonly kind: string, readonly issues: string[]) {
    super(`Failed to load ${kind} from ${file}:\n  ${issues.join('\n  ')}`)
    this.name = 'DataLoadError'
  }
}

export interface DataKind<T> {
  name: string
  format: DataFormat
  schema: ZodType<T>
}

export function defineKind<T>(name: string, format: DataFormat, schema: ZodType<T>): DataKind<T> {
  return { name, format, schema }
}

export function parseData<T>(kind: DataKind<T>, text: string, file: string): T {
  let raw: unknown
  try {
    raw = parseByFormat(kind.format, text)
  } catch (cause) {
    throw new DataLoadError(file, kind.name, [cause instanceof Error ? cause.message : String(cause)])
  }
  const result = kind.schema.safeParse(raw)
  if (!result.success) {
    const issues = result.error.issues.map(
      (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`
    )
    throw new DataLoadError(file, kind.name, issues)
  }
  return result.data
}
