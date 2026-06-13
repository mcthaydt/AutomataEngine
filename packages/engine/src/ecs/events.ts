export interface EngineEvent { type: string; [key: string]: unknown }

/**
 * Frame-scoped event bus. Systems emit during a fixed step and read within the
 * same step (a reader must run after its producer's stage). Bucketed by type so
 * read() is a single lookup, not a scan of every event.
 *
 * Lifecycle: call clear() once per fixed step so events never leak across
 * steps — wire it via Scheduler.onFixedEnd(() => queue.clear()).
 */
export class EventQueue {
  private buckets = new Map<string, EngineEvent[]>()

  emit(event: EngineEvent): void {
    const bucket = this.buckets.get(event.type)
    if (bucket) bucket.push(event)
    else this.buckets.set(event.type, [event])
  }

  read<T extends EngineEvent = EngineEvent>(type: string): T[] {
    const bucket = this.buckets.get(type)
    return bucket ? (bucket.slice() as T[]) : []
  }

  clear(): void {
    this.buckets.clear()
  }
}
