import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import { v4 as uuidv4 } from 'uuid';
import type { ClientMessage, HelloMessage, InputMessage, SubscribeMessage, BlockEditRequestMessage } from '../types/protocol.js';
import type { Player } from '../types/state.js';
import {
  MAX_MESSAGE_SIZE,
  HELLO_TIMEOUT_MS,
  STALE_CONNECTION_MS,
  TICK_RATE_MS,
  HEARTBEAT_INTERVAL_MS,
  WS_CLOSE_INVALID_ORIGIN,
  CONNECTION_RATE_LIMIT,
} from '../types/constants.js';
import { WorldManager } from '../world/WorldManager.js';
import { MessageHandler } from './handlers.js';
import { validateOrigin, initAuth } from './auth.js';
import {
  initSupabase,
  cleanupStaleWorldSessions,
  updateWorldSessionHeartbeat,
} from '../persistence/supabase.js';

export interface GameServerConfig {
  port: number;
  host: string;
  allowedOrigins: string[];
  supabaseUrl: string;
  supabaseServiceKey: string;
  wsPublicUrl: string;
  serverRegion: string;
}

export class GameServer {
  private wss: WebSocketServer | null = null;
  private worldManager: WorldManager;
  private messageHandler: MessageHandler;
  private config: GameServerConfig;
  private instanceId: string;
  private connections: Map<WebSocket, Player | null> = new Map();
  private ipConnections: Map<string, number[]> = new Map();
  private tickInterval: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private staleCheckInterval: NodeJS.Timeout | null = null;
  private running = false;

  constructor(config: GameServerConfig) {
    this.config = config;
    this.instanceId = uuidv4();
    this.worldManager = new WorldManager(this.instanceId);
    this.messageHandler = new MessageHandler(this.worldManager, this.instanceId, config.wsPublicUrl);

    // Initialize dependencies
    initSupabase(config.supabaseUrl, config.supabaseServiceKey);
    initAuth(config.supabaseUrl);
  }

  async start(): Promise<void> {
    // Cleanup any stale sessions from previous runs of this instance
    await cleanupStaleWorldSessions(this.instanceId);

    // Create WebSocket server
    this.wss = new WebSocketServer({
      port: this.config.port,
      host: this.config.host,
      maxPayload: MAX_MESSAGE_SIZE,
      verifyClient: (info, callback) => {
        const origin = info.origin || info.req.headers.origin;
        if (!validateOrigin(origin, this.config.allowedOrigins)) {
          console.warn(`Rejected connection from origin: ${origin}`);
          callback(false, 403, 'Forbidden');
          return;
        }

        // Rate limit by IP
        const ip = this.getClientIP(info.req);
        if (!this.checkConnectionRate(ip)) {
          console.warn(`Rate limited connection from IP: ${ip}`);
          callback(false, 429, 'Too Many Requests');
          return;
        }

        callback(true);
      },
    });

    this.wss.on('connection', (ws, req) => this.handleConnection(ws, req));
    this.wss.on('error', (error) => {
      console.error('WebSocket server error:', error);
    });

    // Start tick loop
    this.startTickLoop();

    // Start heartbeat
    this.startHeartbeat();

    // Start stale connection checker
    this.startStaleChecker();

    this.running = true;
    console.log(`Game server started on ${this.config.host}:${this.config.port}`);
    console.log(`Instance ID: ${this.instanceId}`);
  }

  async stop(): Promise<void> {
    this.running = false;

    // Stop intervals
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.staleCheckInterval) {
      clearInterval(this.staleCheckInterval);
      this.staleCheckInterval = null;
    }

    // Close all connections
    for (const ws of this.connections.keys()) {
      ws.close(1001, 'Server shutting down');
    }

    // Flush pending data
    this.worldManager.stopPersistenceLoop();
    await this.worldManager.flushDirtySections();

    // Deregister all world sessions for this instance
    await cleanupStaleWorldSessions(this.instanceId);

    // Close WebSocket server
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    console.log('Game server stopped');
  }

  private handleConnection(ws: WebSocket, req: IncomingMessage): void {
    const ip = this.getClientIP(req);
    console.log(`New connection from ${ip}`);

    this.connections.set(ws, null);
    this.messageHandler.setupHelloTimeout(ws, HELLO_TIMEOUT_MS);

    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString()) as ClientMessage;
        await this.handleMessage(ws, message);
      } catch (error) {
        console.error('Failed to parse message:', error);
        this.messageHandler.sendError(ws, 'INVALID_REQUEST', 'Invalid message format', false);
      }
    });

    ws.on('close', async (code, reason) => {
      const player = this.connections.get(ws) ?? null;
      console.log(`Connection closed: ${player?.displayName || 'unknown'} (code: ${code})`);
      await this.messageHandler.handleDisconnect(ws, player);
      this.connections.delete(ws);
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  }

  private async handleMessage(ws: WebSocket, message: ClientMessage): Promise<void> {
    const player = this.connections.get(ws);

    switch (message.type) {
      case 'HELLO': {
        if (player) {
          this.messageHandler.sendError(ws, 'INVALID_REQUEST', 'Already authenticated', false);
          return;
        }
        const newPlayer = await this.messageHandler.handleHello(ws, message as HelloMessage);
        if (newPlayer) {
          this.connections.set(ws, newPlayer);
        }
        break;
      }

      case 'INPUT': {
        if (!player) {
          this.messageHandler.sendError(ws, 'AUTH_FAILED', 'Not authenticated', true);
          return;
        }
        this.messageHandler.handleInput(player, message as InputMessage);
        break;
      }

      case 'SUBSCRIBE': {
        if (!player) {
          this.messageHandler.sendError(ws, 'AUTH_FAILED', 'Not authenticated', true);
          return;
        }
        await this.messageHandler.handleSubscribe(player, message as SubscribeMessage);
        break;
      }

      case 'BLOCK_EDIT_REQUEST': {
        if (!player) {
          this.messageHandler.sendError(ws, 'AUTH_FAILED', 'Not authenticated', true);
          return;
        }
        await this.messageHandler.handleBlockEdit(player, message as BlockEditRequestMessage);
        break;
      }

      default:
        this.messageHandler.sendError(ws, 'INVALID_REQUEST', `Unknown message type: ${(message as any).type}`, false);
    }
  }

  private startTickLoop(): void {
    this.tickInterval = setInterval(() => {
      this.tick();
    }, TICK_RATE_MS);
  }

  private tick(): void {
    // Collect all active worlds
    const worldIds = new Set<string>();
    for (const player of this.connections.values()) {
      if (player) {
        worldIds.add(player.worldId);
      }
    }

    // Broadcast snapshots for each world
    for (const worldId of worldIds) {
      const snapshot = this.messageHandler.createSnapshot(worldId);
      this.messageHandler.broadcast(worldId, snapshot);
    }

    // Send pending sections for each player
    for (const player of this.connections.values()) {
      if (player && player.pendingSections.length > 0) {
        this.messageHandler.sendPendingSections(player);
      }
    }
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(async () => {
      // Update heartbeat for each active world
      const worldIds = new Set<string>();
      for (const player of this.connections.values()) {
        if (player) {
          worldIds.add(player.worldId);
        }
      }

      for (const worldId of worldIds) {
        const players = this.worldManager.getPlayersInWorld(worldId);
        await updateWorldSessionHeartbeat(worldId, players.length);
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private startStaleChecker(): void {
    this.staleCheckInterval = setInterval(() => {
      const now = Date.now();
      for (const [ws, player] of this.connections) {
        if (player && (now - player.lastActivity) > STALE_CONNECTION_MS) {
          console.log(`Disconnecting stale player: ${player.displayName}`);
          ws.close(1000, 'Connection timeout');
        }
      }
    }, 10000); // Check every 10 seconds
  }

  private getClientIP(req: IncomingMessage): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded;
      return ips.split(',')[0].trim();
    }
    return req.socket.remoteAddress || 'unknown';
  }

  private checkConnectionRate(ip: string): boolean {
    const now = Date.now();
    const windowMs = 60000; // 1 minute

    let timestamps = this.ipConnections.get(ip) || [];
    timestamps = timestamps.filter(t => (now - t) < windowMs);
    timestamps.push(now);
    this.ipConnections.set(ip, timestamps);

    return timestamps.length <= CONNECTION_RATE_LIMIT;
  }

  getInstanceId(): string {
    return this.instanceId;
  }

  getStats(): { connections: number; players: number; dirtySections: number } {
    return {
      connections: this.connections.size,
      players: this.worldManager.getTotalPlayerCount(),
      dirtySections: this.worldManager.getDirtySectionCount(),
    };
  }
}
