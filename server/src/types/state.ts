import type { WebSocket } from 'ws';
import type { Vec3 } from './protocol.js';

// Player state
export interface Player {
  playerId: string;
  displayName: string;
  position: Vec3;
  velocity: Vec3;
  yaw: number;
  pitch: number;
  lastInputSeq: number;
  lastActivity: number;
  subscribedSections: Set<string>;
  connection: WebSocket;
  worldId: string;
  pendingSections: string[];
  bytesSentThisSecond: number;
  lastBytesReset: number;
  editCount: number;
  lastEditReset: number;
  subscribeCount: number;
  lastSubscribeReset: number;
}

// Section state
export interface Section {
  sectionId: string;
  version: number;
  blocks: Uint16Array; // 4096 elements
  dirty: boolean;
  lastAccessed: number;
  fromDatabase: boolean;
}

// World state (in-memory)
export interface World {
  worldId: string;
  generatorVersion: number;
  registryVersion: number;
  isPublic: boolean;
  activePlayers: Map<string, Player>;
  loadedSections: Map<string, Section>;
  sectionSubscribers: Map<string, Set<string>>; // sectionId -> Set<playerId>
  pendingEdits: Map<string, BlockEventCache>; // requestId -> cached response
}

// Cached block event for idempotency
export interface BlockEventCache {
  requestId: string;
  response: object;
  timestamp: number;
}

// Server instance state
export interface ServerState {
  instanceId: string;
  worlds: Map<string, World>;
  playerConnections: Map<WebSocket, Player>;
  ipConnectionCounts: Map<string, number[]>; // IP -> timestamps
}

// Rate limit tracking
export interface RateLimitState {
  count: number;
  windowStart: number;
}

// Note: Database types are defined in persistence/supabase.ts to match actual schema
