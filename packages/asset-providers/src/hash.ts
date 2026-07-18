import { createHash } from 'node:crypto'

/** Canonical content hash for pinned-determinism provenance and its verification. */
export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}
