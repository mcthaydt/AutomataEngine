import type { StoragePort } from '@automata/engine'

export interface ProgressState {
  bestScore: number
  bestRescues: number
  completedRuns: number
}

interface ProgressEnvelope {
  version: 1
  data: ProgressState
}

export const PROGRESS_KEY = 'last-lightkeeper/progress'
export const initialProgress: ProgressState = { bestScore: 0, bestRescues: 0, completedRuns: 0 }

function isProgress(value: unknown): value is ProgressState {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const progress = value as Partial<ProgressState>
  return Number.isFinite(progress.bestScore) && (progress.bestScore ?? -1) >= 0 &&
    Number.isInteger(progress.bestRescues) && (progress.bestRescues ?? -1) >= 0 &&
    Number.isInteger(progress.completedRuns) && (progress.completedRuns ?? -1) >= 0
}

export function loadProgress(storage: StoragePort): ProgressState {
  try {
    const raw = storage.get(PROGRESS_KEY)
    if (raw === null) return initialProgress
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return initialProgress
    const envelope = parsed as Partial<ProgressEnvelope>
    return envelope.version === 1 && isProgress(envelope.data) ? envelope.data : initialProgress
  } catch {
    return initialProgress
  }
}

export function saveProgress(storage: StoragePort, progress: ProgressState): void {
  try {
    storage.set(PROGRESS_KEY, JSON.stringify({ version: 1, data: progress }))
  } catch {
    // Storage is optional in private/quota-constrained browser contexts.
  }
}

export function recordCompletedRun(
  progress: ProgressState,
  score: number,
  rescues: number
): ProgressState {
  return {
    bestScore: Math.max(progress.bestScore, score),
    bestRescues: Math.max(progress.bestRescues, rescues),
    completedRuns: progress.completedRuns + 1
  }
}
