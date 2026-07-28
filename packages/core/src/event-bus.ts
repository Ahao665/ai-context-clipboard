type Listener = (...args: any[]) => void;

export class EventBus {
  private listeners = new Map<string, Set<Listener>>();

  subscribe(event: string, handler: Listener): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
    return () => this.listeners.get(event)?.delete(handler);
  }

  publish(event: string, ...args: any[]): void {
    this.listeners.get(event)?.forEach((handler) => {
      try {
        handler(...args);
      } catch (err) {
        console.error(`[EventBus] error in handler for "${event}":`, err);
      }
    });
  }

  clear(): void {
    this.listeners.clear();
  }
}

export const globalEventBus = new EventBus();
