export interface EngineEvent { type: string; [key: string]: unknown }

export class EventQueue {
  private events: EngineEvent[] = []

  emit(event: EngineEvent): void {
    this.events.push(event)
  }

  read<T extends EngineEvent = EngineEvent>(type: string): T[] {
    return this.events.filter((event) => event.type === type) as T[]
  }

  clear(): void {
    this.events.length = 0
  }
}
