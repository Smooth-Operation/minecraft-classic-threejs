import type { BufferGeometry, Mesh } from 'three';

// Vector types
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

// Block definition
export interface BlockDef {
  id: number;
  name: string;
  solid: boolean;
  renderGroup: 'opaque' | 'cutout' | 'translucent' | 'none';
  atlasIndices: {
    top: number;
    bottom: number;
    north: number;
    south: number;
    east: number;
    west: number;
  };
}

// Section data
export interface SectionData {
  id: string;
  cx: number;
  cz: number;
  sy: number;
  version: number;
  blocks: Uint16Array;
  dirty: boolean;
  mesh?: Mesh;
  geometry?: BufferGeometry;
}

// Player state (server sends player_id)
export interface PlayerState {
  id: string;  // Client uses this internally
  player_id?: string;  // Server sends this in some messages
  display_name?: string;
  position: Vec3;
  velocity: Vec3;
  yaw: number;
  pitch: number;
  lastInputSeq?: number;
}

// Network message types
export type MessageType =
  | 'HELLO'
  | 'WELCOME'
  | 'ERROR'
  | 'INPUT'
  | 'SNAPSHOT'
  | 'SUBSCRIBE'
  | 'SECTION_DATA'
  | 'RESYNC'
  | 'BLOCK_EDIT_REQUEST'
  | 'BLOCK_EVENT'
  | 'REDIRECT'
  | 'PLAYER_JOIN'
  | 'PLAYER_LEAVE';

// Base message envelope
export interface MessageEnvelope {
  type: MessageType;
  protocol_version: number;
  timestamp?: number;
  seq?: number;
}

// HELLO message (Client → Server)
export interface HelloMessage extends MessageEnvelope {
  type: 'HELLO';
  jwt: string;
  world_id: string;
  registry_version: number;
  generator_version: number;
}

// WELCOME message (Server → Client)
export interface WelcomeMessage extends MessageEnvelope {
  type: 'WELCOME';
  player_id: string;
  spawn_position: Vec3;
  server_time: number;
  players: {
    player_id: string;
    display_name: string;
    position: Vec3;
    yaw: number;
    pitch: number;
  }[];
  registry_version: number;
  generator_version: number;
}

// ERROR message (Server → Client)
export interface ErrorMessage extends MessageEnvelope {
  type: 'ERROR';
  code: string;
  message: string;
  fatal: boolean;
}

// INPUT message (Client → Server)
export interface InputMessage extends MessageEnvelope {
  type: 'INPUT';
  seq: number;
  timestamp: number;
  position: Vec3;
  velocity: Vec3;
  yaw: number;
  pitch: number;
  inputs: number; // Bitfield
}

// SNAPSHOT message (Server → Client)
export interface SnapshotMessage extends MessageEnvelope {
  type: 'SNAPSHOT';
  server_time: number;
  players: {
    player_id: string;
    position: Vec3;
    velocity: Vec3;
    yaw: number;
    pitch: number;
    last_input_seq: number;
  }[];
}

// SUBSCRIBE message (Client → Server)
export interface SubscribeMessage extends MessageEnvelope {
  type: 'SUBSCRIBE';
  section_ids: string[];
  unsubscribe_ids?: string[];
}

// SECTION_DATA message (Server → Client)
export interface SectionDataMessage extends MessageEnvelope {
  type: 'SECTION_DATA';
  section_id: string;
  version: number;
  blocks: string; // Base64 encoded
  is_baseline: boolean;
}

// RESYNC message (Server → Client)
export interface ResyncMessage extends MessageEnvelope {
  type: 'RESYNC';
  reason: 'reconnect' | 'conflict' | 'server_restart';
  section_ids: string[];
}

// BLOCK_EDIT_REQUEST message (Client → Server)
export interface BlockEditRequest extends MessageEnvelope {
  type: 'BLOCK_EDIT_REQUEST';
  request_id: string;
  x: number;
  y: number;
  z: number;
  block_id: number;
}

// BLOCK_EVENT message (Server → Client)
export interface BlockEvent extends MessageEnvelope {
  type: 'BLOCK_EVENT';
  request_id: string;
  player_id: string;
  x: number;
  y: number;
  z: number;
  block_id: number;
  previous_block_id: number;
  section_version: number;
  accepted: boolean;
  reject_reason?: string;
}

// REDIRECT message (Server → Client)
export interface RedirectMessage extends MessageEnvelope {
  type: 'REDIRECT';
  url: string;
  reason: 'maintenance' | 'load_balance' | 'shutdown';
  delay_ms: number;
}

// PLAYER_JOIN message (Server → Client)
export interface PlayerJoinMessage extends MessageEnvelope {
  type: 'PLAYER_JOIN';
  protocol_version: number;
  player: {
    player_id: string;
    display_name: string;
    position: Vec3;
    yaw: number;
    pitch: number;
  };
}

// PLAYER_LEAVE message (Server → Client)
export interface PlayerLeaveMessage extends MessageEnvelope {
  type: 'PLAYER_LEAVE';
  protocol_version: number;
  player_id: string;
}

// Union type for all messages
export type GameMessage =
  | HelloMessage
  | WelcomeMessage
  | ErrorMessage
  | InputMessage
  | SnapshotMessage
  | SubscribeMessage
  | SectionDataMessage
  | ResyncMessage
  | BlockEditRequest
  | BlockEvent
  | RedirectMessage
  | PlayerJoinMessage
  | PlayerLeaveMessage;

// Worker messages
export interface MeshRequest {
  type: 'MESH_REQUEST';
  sectionId: string;
  blocks: Uint16Array;
  neighbors: {
    px?: Uint16Array; // +X neighbor
    nx?: Uint16Array; // -X neighbor
    py?: Uint16Array; // +Y neighbor
    ny?: Uint16Array; // -Y neighbor
    pz?: Uint16Array; // +Z neighbor
    nz?: Uint16Array; // -Z neighbor
  };
}

export interface MeshResult {
  type: 'MESH_RESULT';
  sectionId: string;
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
}

export type WorkerMessage = MeshRequest | MeshResult;

// Game state
export type GameState =
  | 'boot'
  | 'login'
  | 'world_list'
  | 'joining'
  | 'loading'
  | 'in_game'
  | 'disconnected';

// Input bitfield
export const INPUT_FORWARD = 1 << 0;
export const INPUT_BACK = 1 << 1;
export const INPUT_LEFT = 1 << 2;
export const INPUT_RIGHT = 1 << 3;
export const INPUT_JUMP = 1 << 4;
export const INPUT_SNEAK = 1 << 5;
