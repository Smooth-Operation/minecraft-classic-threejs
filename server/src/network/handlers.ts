import type { WebSocket } from 'ws';
import type {
  HelloMessage,
  InputMessage,
  SubscribeMessage,
  BlockEditRequestMessage,
  WelcomeMessage,
  SnapshotMessage,
  SectionDataMessage,
  BlockEventMessage,
  ErrorMessage,
  PlayerJoinMessage,
  PlayerLeaveMessage,
  ErrorCode,
} from '../types/protocol.js';
import type { Player } from '../types/state.js';
import {
  PROTOCOL_VERSION,
  REGISTRY_VERSION,
  GENERATOR_VERSION,
  MAX_REACH_DISTANCE,
  PLAYER_EYE_HEIGHT,
  MAX_EDITS_PER_SECOND,
  MAX_SUBSCRIBE_PER_SECOND,
  MAX_SECTIONS_MOBILE,
  SECTIONS_PER_SECOND_MOBILE,
  BLOCK_AIR,
} from '../types/constants.js';
import {
  isValidWorldCoord,
  parseSectionId,
  distance,
} from '../utils/coordinates.js';
import { encodeSectionBlocks, getSpawnPosition } from '../world/generator.js';
import { verifyJWT } from './auth.js';
import { WorldManager } from '../world/WorldManager.js';
import { registerWorldSession } from '../persistence/supabase.js';

export class MessageHandler {
  private worldManager: WorldManager;
  private pendingConnections: Map<WebSocket, NodeJS.Timeout> = new Map();
  private instanceId: string;
  private wsUrl: string;

  constructor(worldManager: WorldManager, instanceId: string, wsUrl: string) {
    this.worldManager = worldManager;
    this.instanceId = instanceId;
    this.wsUrl = wsUrl;
  }

  // Send JSON message to client
  private send(ws: WebSocket, message: object): void {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  // Send error and optionally close
  sendError(ws: WebSocket, code: ErrorCode, message: string, fatal: boolean): void {
    const errorMsg: ErrorMessage = {
      type: 'ERROR',
      protocol_version: PROTOCOL_VERSION,
      code,
      message,
      fatal,
    };
    this.send(ws, errorMsg);

    if (fatal) {
      ws.close(1000, message);
    }
  }

  // Broadcast to all players in a world
  broadcast(worldId: string, message: object, exclude?: string): void {
    const players = this.worldManager.getPlayersInWorld(worldId);
    const json = JSON.stringify(message);

    for (const player of players) {
      if (player.playerId !== exclude && player.connection.readyState === player.connection.OPEN) {
        player.connection.send(json);
      }
    }
  }

  // Broadcast to section subscribers
  broadcastToSection(worldId: string, sectionId: string, message: object): void {
    const subscribers = this.worldManager.getSectionSubscribers(worldId, sectionId);
    const json = JSON.stringify(message);

    for (const player of subscribers) {
      if (player.connection.readyState === player.connection.OPEN) {
        player.connection.send(json);
      }
    }
  }

  // Set up hello timeout for new connection
  setupHelloTimeout(ws: WebSocket, timeoutMs: number): void {
    const timeout = setTimeout(() => {
      this.sendError(ws, 'AUTH_FAILED', 'HELLO timeout', true);
    }, timeoutMs);
    this.pendingConnections.set(ws, timeout);
  }

  clearHelloTimeout(ws: WebSocket): void {
    const timeout = this.pendingConnections.get(ws);
    if (timeout) {
      clearTimeout(timeout);
      this.pendingConnections.delete(ws);
    }
  }

  // Handle HELLO message
  async handleHello(ws: WebSocket, msg: HelloMessage): Promise<Player | null> {
    this.clearHelloTimeout(ws);

    // Validate protocol version
    if (msg.protocol_version !== PROTOCOL_VERSION) {
      this.sendError(ws, 'INVALID_REQUEST', `Protocol version mismatch. Expected ${PROTOCOL_VERSION}`, true);
      return null;
    }

    // Validate registry version
    if (msg.registry_version !== REGISTRY_VERSION) {
      this.sendError(ws, 'REGISTRY_MISMATCH', `Registry version mismatch. Server: ${REGISTRY_VERSION}`, true);
      return null;
    }

    // Validate generator version
    if (msg.generator_version !== GENERATOR_VERSION) {
      this.sendError(ws, 'GENERATOR_MISMATCH', `Generator version mismatch. Server: ${GENERATOR_VERSION}`, true);
      return null;
    }

    // Verify JWT
    const authResult = await verifyJWT(msg.jwt);
    if (!authResult.valid || !authResult.payload) {
      this.sendError(ws, authResult.errorCode || 'AUTH_FAILED', authResult.error || 'Authentication failed', true);
      return null;
    }

    const userId = authResult.payload.sub;

    // Validate world access
    const accessResult = await this.worldManager.validateWorldAccess(msg.world_id, userId);
    if (!accessResult.valid) {
      this.sendError(ws, accessResult.errorCode as ErrorCode, accessResult.error!, true);
      return null;
    }

    // Check if world is full
    if (this.worldManager.isWorldFull(msg.world_id)) {
      this.sendError(ws, 'WORLD_FULL', 'World is full (max 8 players)', true);
      return null;
    }

    // Add player to world
    const player = await this.worldManager.addPlayer(msg.world_id, userId, ws);

    // Register world session (creates or updates)
    try {
      await registerWorldSession(msg.world_id, this.instanceId, this.wsUrl);
    } catch (error) {
      console.error('Failed to register world session:', error);
      // Non-fatal - continue anyway
    }

    // Get existing players for welcome message
    const existingPlayers = this.worldManager.getPlayersInWorld(msg.world_id)
      .filter(p => p.playerId !== userId)
      .map(p => ({
        player_id: p.playerId,
        display_name: p.displayName,
        position: p.position,
        yaw: p.yaw,
        pitch: p.pitch,
      }));

    // Send welcome
    const welcome: WelcomeMessage = {
      type: 'WELCOME',
      protocol_version: PROTOCOL_VERSION,
      player_id: userId,
      spawn_position: player.position,
      server_time: Date.now(),
      players: existingPlayers,
      registry_version: REGISTRY_VERSION,
      generator_version: GENERATOR_VERSION,
    };
    this.send(ws, welcome);

    // Broadcast join to other players
    const joinMsg: PlayerJoinMessage = {
      type: 'PLAYER_JOIN',
      protocol_version: PROTOCOL_VERSION,
      player: {
        player_id: player.playerId,
        display_name: player.displayName,
        position: player.position,
        yaw: player.yaw,
        pitch: player.pitch,
      },
    };
    this.broadcast(msg.world_id, joinMsg, userId);

    return player;
  }

  // Handle INPUT message
  handleInput(player: Player, msg: InputMessage): void {
    player.lastActivity = Date.now();

    // Basic validation - clamp position to world bounds
    const position = {
      x: Math.max(0, Math.min(1023, msg.position.x)),
      y: Math.max(0, Math.min(127, msg.position.y)),
      z: Math.max(0, Math.min(1023, msg.position.z)),
    };

    // For MVP, we trust client position (no full physics simulation)
    // Just enforce basic speed limits would go here

    this.worldManager.updatePlayerPosition(
      player.worldId,
      player.playerId,
      position,
      msg.velocity,
      msg.yaw,
      msg.pitch,
      msg.seq
    );
  }

  // Handle SUBSCRIBE message
  async handleSubscribe(player: Player, msg: SubscribeMessage): Promise<void> {
    player.lastActivity = Date.now();

    // Rate limit
    const now = Date.now();
    if (now - player.lastSubscribeReset > 1000) {
      player.subscribeCount = 0;
      player.lastSubscribeReset = now;
    }

    // Process unsubscribes
    if (msg.unsubscribe_ids) {
      for (const sectionId of msg.unsubscribe_ids) {
        this.worldManager.unsubscribeFromSection(player.worldId, player.playerId, sectionId);
      }
    }

    // Process subscribes
    for (const sectionId of msg.section_ids) {
      // Rate limit check
      if (player.subscribeCount >= MAX_SUBSCRIBE_PER_SECOND) {
        this.sendError(player.connection, 'RATE_LIMITED', 'Subscribe rate limit exceeded', false);
        break;
      }

      // Max sections check
      if (player.subscribedSections.size >= MAX_SECTIONS_MOBILE) {
        this.sendError(player.connection, 'RATE_LIMITED', 'Max subscribed sections reached', false);
        break;
      }

      // Validate section ID
      const coords = parseSectionId(sectionId);
      if (!coords) {
        this.sendError(player.connection, 'INVALID_REQUEST', `Invalid section ID: ${sectionId}`, false);
        continue;
      }

      // Subscribe
      this.worldManager.subscribeToSection(player.worldId, player.playerId, sectionId);
      player.subscribeCount++;

      // Queue section for sending
      player.pendingSections.push(sectionId);
    }

    // Send pending sections (respecting rate limit)
    await this.sendPendingSections(player);
  }

  async sendPendingSections(player: Player): Promise<void> {
    const sectionsToSend = Math.min(
      player.pendingSections.length,
      SECTIONS_PER_SECOND_MOBILE
    );

    for (let i = 0; i < sectionsToSend; i++) {
      const sectionId = player.pendingSections.shift();
      if (!sectionId) break;

      try {
        const section = await this.worldManager.getSection(player.worldId, sectionId);

        const sectionData: SectionDataMessage = {
          type: 'SECTION_DATA',
          protocol_version: PROTOCOL_VERSION,
          section_id: sectionId,
          version: section.version,
          blocks: encodeSectionBlocks(section.blocks),
          is_baseline: !section.fromDatabase,
        };

        this.send(player.connection, sectionData);
      } catch (error) {
        console.error(`Failed to send section ${sectionId}:`, error);
      }
    }
  }

  // Handle BLOCK_EDIT_REQUEST message
  async handleBlockEdit(player: Player, msg: BlockEditRequestMessage): Promise<void> {
    player.lastActivity = Date.now();

    // Check for cached response (idempotency)
    const cached = this.worldManager.getCachedBlockEvent(player.worldId, msg.request_id);
    if (cached) {
      this.send(player.connection, cached.response);
      return;
    }

    // Rate limit
    const now = Date.now();
    if (now - player.lastEditReset > 1000) {
      player.editCount = 0;
      player.lastEditReset = now;
    }

    if (player.editCount >= MAX_EDITS_PER_SECOND) {
      const response = this.createBlockEventResponse(msg, player.playerId, 0, false, 'Rate limited');
      this.worldManager.cacheBlockEvent(player.worldId, msg.request_id, response);
      this.send(player.connection, response);
      return;
    }

    player.editCount++;

    // Validate bounds
    if (!isValidWorldCoord(msg.x, msg.y, msg.z)) {
      const response = this.createBlockEventResponse(msg, player.playerId, 0, false, 'Out of bounds');
      this.worldManager.cacheBlockEvent(player.worldId, msg.request_id, response);
      this.send(player.connection, response);
      return;
    }

    // Validate reach distance
    const eyeY = player.position.y + PLAYER_EYE_HEIGHT;
    const dist = distance(
      player.position.x, eyeY, player.position.z,
      msg.x + 0.5, msg.y + 0.5, msg.z + 0.5
    );

    if (dist > MAX_REACH_DISTANCE) {
      const response = this.createBlockEventResponse(msg, player.playerId, 0, false, 'Too far');
      this.worldManager.cacheBlockEvent(player.worldId, msg.request_id, response);
      this.send(player.connection, response);
      return;
    }

    // Load section to check current state
    const sectionId = `${Math.floor(msg.x / 16)}:${Math.floor(msg.z / 16)}:${Math.floor(msg.y / 16)}`;
    const section = await this.worldManager.getSection(player.worldId, sectionId);
    const blockIndex = ((msg.y % 16) * 256) + ((msg.z % 16) * 16) + (msg.x % 16);
    const currentBlock = section.blocks[blockIndex];

    // Validate placement vs destruction
    if (msg.block_id === BLOCK_AIR && currentBlock === BLOCK_AIR) {
      const response = this.createBlockEventResponse(msg, player.playerId, currentBlock, false, 'Nothing to break');
      this.worldManager.cacheBlockEvent(player.worldId, msg.request_id, response);
      this.send(player.connection, response);
      return;
    }

    if (msg.block_id !== BLOCK_AIR && currentBlock !== BLOCK_AIR) {
      const response = this.createBlockEventResponse(msg, player.playerId, currentBlock, false, 'Block occupied');
      this.worldManager.cacheBlockEvent(player.worldId, msg.request_id, response);
      this.send(player.connection, response);
      return;
    }

    // Check self-intersection (placing inside player)
    if (msg.block_id !== BLOCK_AIR) {
      const playerMinX = Math.floor(player.position.x - 0.3);
      const playerMaxX = Math.floor(player.position.x + 0.3);
      const playerMinY = Math.floor(player.position.y);
      const playerMaxY = Math.floor(player.position.y + 1.8);
      const playerMinZ = Math.floor(player.position.z - 0.3);
      const playerMaxZ = Math.floor(player.position.z + 0.3);

      if (
        msg.x >= playerMinX && msg.x <= playerMaxX &&
        msg.y >= playerMinY && msg.y <= playerMaxY &&
        msg.z >= playerMinZ && msg.z <= playerMaxZ
      ) {
        const response = this.createBlockEventResponse(msg, player.playerId, currentBlock, false, 'Cannot place inside self');
        this.worldManager.cacheBlockEvent(player.worldId, msg.request_id, response);
        this.send(player.connection, response);
        return;
      }
    }

    // Apply the edit
    const result = this.worldManager.applyBlockEdit(
      player.worldId,
      msg.x,
      msg.y,
      msg.z,
      msg.block_id
    );

    if (!result) {
      const response = this.createBlockEventResponse(msg, player.playerId, 0, false, 'Failed to apply edit');
      this.worldManager.cacheBlockEvent(player.worldId, msg.request_id, response);
      this.send(player.connection, response);
      return;
    }

    // Create success response
    const response: BlockEventMessage = {
      type: 'BLOCK_EVENT',
      protocol_version: PROTOCOL_VERSION,
      request_id: msg.request_id,
      player_id: player.playerId,
      x: msg.x,
      y: msg.y,
      z: msg.z,
      block_id: msg.block_id,
      previous_block_id: result.previousBlockId,
      section_version: result.section.version,
      accepted: true,
    };

    // Cache and broadcast
    this.worldManager.cacheBlockEvent(player.worldId, msg.request_id, response);
    this.broadcastToSection(player.worldId, sectionId, response);
  }

  private createBlockEventResponse(
    msg: BlockEditRequestMessage,
    playerId: string,
    previousBlockId: number,
    accepted: boolean,
    rejectReason?: string
  ): BlockEventMessage {
    return {
      type: 'BLOCK_EVENT',
      protocol_version: PROTOCOL_VERSION,
      request_id: msg.request_id,
      player_id: playerId,
      x: msg.x,
      y: msg.y,
      z: msg.z,
      block_id: msg.block_id,
      previous_block_id: previousBlockId,
      section_version: 0,
      accepted,
      reject_reason: rejectReason,
    };
  }

  // Handle player disconnect
  async handleDisconnect(ws: WebSocket, player: Player | null): Promise<void> {
    this.clearHelloTimeout(ws);

    if (!player) return;

    // Broadcast leave
    const leaveMsg: PlayerLeaveMessage = {
      type: 'PLAYER_LEAVE',
      protocol_version: PROTOCOL_VERSION,
      player_id: player.playerId,
    };
    this.broadcast(player.worldId, leaveMsg, player.playerId);

    // Remove from world
    await this.worldManager.removePlayer(player.worldId, player.playerId);
  }

  // Create snapshot message for tick broadcast
  createSnapshot(worldId: string): SnapshotMessage {
    const players = this.worldManager.getPlayersInWorld(worldId);

    return {
      type: 'SNAPSHOT',
      protocol_version: PROTOCOL_VERSION,
      server_time: Date.now(),
      players: players.map(p => ({
        player_id: p.playerId,
        position: p.position,
        velocity: p.velocity,
        yaw: p.yaw,
        pitch: p.pitch,
        last_input_seq: p.lastInputSeq,
      })),
    };
  }
}
