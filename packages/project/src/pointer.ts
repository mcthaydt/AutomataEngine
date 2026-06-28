/**
 * RFC 6901 JSON Pointer helpers with structural-sharing immutable updates.
 *
 * Every write clones only the containers along the addressed path and returns
 * the *original* root unchanged for deep-equal primitive no-ops, so callers can
 * cheaply detect "nothing changed" by reference identity (used by the command
 * reducer and the editor undo stack).
 */

/** Thrown when a pointer is malformed or addresses a non-existent location. */
export class PointerError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PointerError'
  }
}

/** Escape one reference token: `~`→`~0`, `/`→`~1` (order matters). */
export function escapePointerToken(token: string): string {
  return token.replace(/~/g, '~0').replace(/\//g, '~1')
}

/** Unescape one reference token: `~1`→`/`, `~0`→`~` (reverse order). */
function unescapeToken(token: string): string {
  return token.replace(/~1/g, '/').replace(/~0/g, '~')
}

/** Parse a pointer into its decoded tokens; `''` is the document root. */
export function parsePointer(pointer: string): string[] {
  if (pointer === '') return []
  if (!pointer.startsWith('/')) throw new PointerError(`JSON Pointer must start with "/": ${pointer}`)
  return pointer.slice(1).split('/').map(unescapeToken)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Parse an array index token (`-` is the append slot, only where allowed). */
function arrayIndex(token: string, length: number, allowAppend: boolean): number {
  if (token === '-') {
    if (allowAppend) return length
    throw new PointerError('"-" array index is only valid for insertion')
  }
  if (!/^(0|[1-9][0-9]*)$/.test(token)) throw new PointerError(`Invalid array index "${token}"`)
  return Number(token)
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((item, index) => deepEqual(item, b[index]))
  }
  const ra = a as Record<string, unknown>
  const rb = b as Record<string, unknown>
  const keys = Object.keys(ra)
  if (keys.length !== Object.keys(rb).length) return false
  return keys.every((key) => key in rb && deepEqual(ra[key], rb[key]))
}

/** Read the value addressed by `pointer`; throws on any invalid step. */
export function getAtPointer(root: unknown, pointer: string): unknown {
  let node: unknown = root
  for (const token of parsePointer(pointer)) {
    if (Array.isArray(node)) {
      const index = arrayIndex(token, node.length, false)
      if (index >= node.length) throw new PointerError(`Array index ${index} out of range`)
      node = node[index]
    } else if (isRecord(node)) {
      if (!(token in node)) throw new PointerError(`Missing object key "${token}"`)
      node = node[token]
    } else {
      throw new PointerError(`Cannot descend through a primitive at "${token}"`)
    }
  }
  return node
}

/**
 * Immutably set the value at `pointer`. Intermediate object keys must exist;
 * the final key may be created. Returns the original root for deep-equal no-ops.
 */
export function setAtPointer<T>(root: T, pointer: string, value: unknown): T {
  const tokens = parsePointer(pointer)
  if (tokens.length === 0) return deepEqual(root, value) ? root : (value as T)
  return setRecursive(root, tokens, 0, value) as T
}

function setRecursive(node: unknown, tokens: string[], index: number, value: unknown): unknown {
  const token = tokens[index]!
  const isLast = index === tokens.length - 1

  if (Array.isArray(node)) {
    const arrayIdx = arrayIndex(token, node.length, isLast)
    if (isLast) {
      if (arrayIdx === node.length) return [...node, value]
      if (deepEqual(node[arrayIdx], value)) return node
      const copy = node.slice()
      copy[arrayIdx] = value
      return copy
    }
    if (arrayIdx >= node.length) throw new PointerError(`Array index ${arrayIdx} out of range`)
    const child = setRecursive(node[arrayIdx], tokens, index + 1, value)
    if (child === node[arrayIdx]) return node
    const copy = node.slice()
    copy[arrayIdx] = child
    return copy
  }

  if (isRecord(node)) {
    if (isLast) {
      if (token in node && deepEqual(node[token], value)) return node
      return { ...node, [token]: value }
    }
    if (!(token in node)) throw new PointerError(`Missing object key "${token}"`)
    const child = setRecursive(node[token], tokens, index + 1, value)
    if (child === node[token]) return node
    return { ...node, [token]: child }
  }

  throw new PointerError(`Cannot descend through a primitive at "${token}"`)
}

/** Read the array at `pointer`, throwing if it is not an array. */
function arrayAt(root: unknown, pointer: string): unknown[] {
  const node = getAtPointer(root, pointer)
  if (!Array.isArray(node)) throw new PointerError(`Expected an array at "${pointer}"`)
  return node
}

/** Immutably insert `value` into the array at `pointer` (index in `0..len`). */
export function insertAtPointer<T>(root: T, pointer: string, index: number, value: unknown): T {
  const array = arrayAt(root, pointer)
  if (index < 0 || index > array.length) throw new PointerError(`Insert index ${index} out of range`)
  const copy = array.slice()
  copy.splice(index, 0, value)
  return setAtPointer(root, pointer, copy)
}

/** Immutably remove the array element at `index` under `pointer`. */
export function removeAtPointer<T>(root: T, pointer: string, index: number): T {
  const array = arrayAt(root, pointer)
  if (index < 0 || index >= array.length) throw new PointerError(`Remove index ${index} out of range`)
  const copy = array.slice()
  copy.splice(index, 1)
  return setAtPointer(root, pointer, copy)
}

/** Immutably move an element from `from` to `to` within the array at `pointer`. */
export function moveAtPointer<T>(root: T, pointer: string, from: number, to: number): T {
  const array = arrayAt(root, pointer)
  if (from < 0 || from >= array.length || to < 0 || to >= array.length) throw new PointerError(`Move (${from} → ${to}) out of range`)
  const copy = array.slice()
  const [item] = copy.splice(from, 1)
  copy.splice(to, 0, item)
  return setAtPointer(root, pointer, copy)
}
