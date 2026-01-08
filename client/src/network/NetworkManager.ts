import { EventBus, Events } from '../core/EventBus';
import type {
  Vec3,
  HelloMessage,
  WelcomeMessage,
  ErrorMessage,
  InputMessage,
  SnapshotMessage,
  SubscribeMessage,
  SectionDataMessage,
  BlockEditRequest,
  BlockEvent,
  PlayerJoinMessage,
  PlayerLeaveMessage,
  GameMessage,
} from '../types';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected';

const PROTOCOL_VERSION = 1;
const REGISTRY_VERSION = 1;
const GENERATOR_VERSION = 1;

const RECONNECT_BASE_DELAY = 1000;
const RECONNECT_MAX_DELAY = 30000;
const RECONNECT_MULTIPLIER = 2;

export class NetworkManager {
  private ws: WebSocket | null = null;
  private eventBus: EventBus;
  private state: ConnectionState = 'disconnected';
  private url: string = '';
  private jwt: string = '';
  private worldId: string = '';
  private inputSeq: number = 0;
  private requestId: number = 0;
  private reconnectAttempts: number = 0;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private autoReconnect: boolean = true;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  get connectionState(): ConnectionState {
    return this.state;
  }

  connect(url: string, jwt: string, worldId: string): void {
    this.url = url;
    this.jwt = jwt;
    this.worldId = worldId;
    this.autoReconnect = true;
    this.doConnect();
  }

  private doConnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.setState('connecting');

    try {
      this.ws = new WebSocket(this.url);
      this.ws.binaryType = 'arraybuffer';

      this.ws.onopen = () => {
        this.setState('connected');
        this.reconnectAttempts = 0;
        this.eventBus.emit(Events.CONNECTED, undefined);
        this.sendHello();
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onerror = (error) => {
        console.error('[NetworkManager] WebSocket error:', error);
        this.eventBus.emit(Events.ERROR, { error: 'WebSocket error' });
      };

      this.ws.onclose = (event) => {
        this.setState('disconnected');
        this.ws = null;
        this.eventBus.emit(Events.DISCONNECTED, { code: event.code, reason: event.reason });

        if (this.autoReconnect && !event.wasClean) {
          this.scheduleReconnect();
        }
      };
    } catch (error) {
      console.error('[NetworkManager] Failed to create WebSocket:', error);
      this.setState('disconnected');
      if (this.autoReconnect) {
        this.scheduleReconnect();
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    const delay = Math.min(
      RECONNECT_BASE_DELAY * Math.pow(RECONNECT_MULTIPLIER, this.reconnectAttempts),
      RECONNECT_MAX_DELAY
    );

    console.log(`[NetworkManager] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1})`);

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectAttempts++;
      this.doConnect();
    }, delay);
  }

  disconnect(): void {
    this.autoReconnect = false;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }

    this.setState('disconnected');
  }

  private setState(state: ConnectionState): void {
    this.state = state;
  }

  private sendHello(): void {
    const msg: HelloMessage = {
      type: 'HELLO',
      protocol_version: PROTOCOL_VERSION,
      jwt: this.jwt,
      world_id: this.worldId,
      registry_version: REGISTRY_VERSION,
      generator_version: GENERATOR_VERSION,
    };
    this.send(msg);
  }

  private send(message: GameMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private handleMessage(data: string | ArrayBuffer): void {
    try {
      const text = typeof data === 'string' ? data : new TextDecoder().decode(data);
      const message = JSON.parse(text) as GameMessage;

      switch (message.type) {
        case 'WELCOME':
          this.handleWelcome(message as WelcomeMessage);
          break;
        case 'SNAPSHOT':
          this.handleSnapshot(message as SnapshotMessage);
          break;
        case 'SECTION_DATA':
          this.handleSectionData(message as SectionDataMessage);
          break;
        case 'BLOCK_EVENT':
          this.handleBlockEvent(message as BlockEvent);
          break;
        case 'PLAYER_JOIN':
          this.handlePlayerJoin(message as PlayerJoinMessage);
          break;
        case 'PLAYER_LEAVE':
          this.handlePlayerLeave(message as PlayerLeaveMessage);
          break;
        case 'ERROR':
          this.handleError(message as ErrorMessage);
          break;
        default:
          this.eventBus.emit(Events.MESSAGE, message);
      }
    } catch (error) {
      console.error('[NetworkManager] Failed to parse message:', error);
    }
  }

  private handleWelcome(msg: WelcomeMessage): void {
    this.eventBus.emit('welcome', {
      player_id: msg.player_id,
      spawn_position: msg.spawn_position,
      server_time: msg.server_time,
      players: msg.players,
      registry_version: msg.registry_version,
      generator_version: msg.generator_version,
    });
  }

  private handleSnapshot(msg: SnapshotMessage): void {
    this.eventBus.emit('snapshot', {
      server_time: msg.server_time,
      players: msg.players,
    });
  }

  private handleSectionData(msg: SectionDataMessage): void {
    this.eventBus.emit('section_data', {
      section_id: msg.section_id,
      version: msg.version,
      blocks: msg.blocks,
      is_baseline: msg.is_baseline,
    });
  }

  private handleBlockEvent(msg: BlockEvent): void {
    this.eventBus.emit('block_event', {
      request_id: msg.request_id,
      player_id: msg.player_id,
      x: msg.x,
      y: msg.y,
      z: msg.z,
      block_id: msg.block_id,
      previous_block_id: msg.previous_block_id,
      section_version: msg.section_version,
      accepted: msg.accepted,
      reject_reason: msg.reject_reason,
    });
  }

  private handleError(msg: ErrorMessage): void {
    this.eventBus.emit('error', {
      code: msg.code,
      message: msg.message,
      fatal: msg.fatal,
    });

    if (msg.fatal) {
      this.autoReconnect = false;
      this.disconnect();
    }
  }

  private handlePlayerJoin(msg: PlayerJoinMessage): void {
    this.eventBus.emit('player_join', {
      id: msg.player.player_id,
      position: msg.player.position,
      velocity: { x: 0, y: 0, z: 0 }, // PlayerInfo doesn't have velocity
      yaw: msg.player.yaw,
      pitch: msg.player.pitch,
      lastInputSeq: 0, // PlayerInfo doesn't have lastInputSeq
    });
  }

  private handlePlayerLeave(msg: PlayerLeaveMessage): void {
    this.eventBus.emit('player_leave', {
      player_id: msg.player_id,
    });
  }

  sendInput(
    position: Vec3,
    velocity: Vec3,
    yaw: number,
    pitch: number,
    inputs: number
  ): void {
    const msg: InputMessage = {
      type: 'INPUT',
      protocol_version: PROTOCOL_VERSION,
      seq: ++this.inputSeq,
      timestamp: Date.now(),
      position,
      velocity,
      yaw,
      pitch,
      inputs,
    };
    this.send(msg);
  }

  sendSubscribe(sectionIds: string[], unsubscribeIds?: string[]): void {
    const msg: SubscribeMessage = {
      type: 'SUBSCRIBE',
      protocol_version: PROTOCOL_VERSION,
      section_ids: sectionIds,
      unsubscribe_ids: unsubscribeIds,
    };
    this.send(msg);
  }

  sendBlockEdit(x: number, y: number, z: number, blockId: number): void {
    const msg: BlockEditRequest = {
      type: 'BLOCK_EDIT_REQUEST',
      protocol_version: PROTOCOL_VERSION,
      request_id: `${Date.now()}-${++this.requestId}`,
      x,
      y,
      z,
      block_id: blockId,
    };
    this.send(msg);
  }
}
