type EventCallback<T = unknown> = (data: T) => void;

export class EventBus {
  private listeners: Map<string, Set<EventCallback>> = new Map();

  on<T>(event: string, callback: EventCallback<T>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback as EventCallback);

    // Return unsubscribe function
    return () => this.off(event, callback);
  }

  off<T>(event: string, callback: EventCallback<T>): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.delete(callback as EventCallback);
    }
  }

  emit<T>(event: string, data: T): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach(cb => cb(data));
    }
  }

  once<T>(event: string, callback: EventCallback<T>): () => void {
    const wrapper: EventCallback<T> = (data) => {
      this.off(event, wrapper);
      callback(data);
    };
    return this.on(event, wrapper);
  }

  clear(): void {
    this.listeners.clear();
  }
}

// Global event bus instance
export const eventBus = new EventBus();

// Event types for type safety
export const Events = {
  // Game state
  STATE_CHANGE: 'state:change',

  // World events
  SECTION_LOADED: 'world:section_loaded',
  SECTION_UPDATED: 'world:section_updated',
  BLOCK_CHANGED: 'world:block_changed',

  // Player events
  PLAYER_MOVED: 'player:moved',
  PLAYER_JOINED: 'player:joined',
  PLAYER_LEFT: 'player:left',

  // Network events
  CONNECTED: 'network:connected',
  DISCONNECTED: 'network:disconnected',
  MESSAGE: 'network:message',
  ERROR: 'network:error',

  // Input events
  BLOCK_PLACE: 'input:block_place',
  BLOCK_BREAK: 'input:block_break',

  // Mesh events
  MESH_READY: 'mesh:ready',
  MESH_REQUEST: 'mesh:request'
} as const;
