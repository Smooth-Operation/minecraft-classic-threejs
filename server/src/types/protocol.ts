// Protocol message types (from SHARED_CONTRACTS.md Section 6)

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

// Base message envelope
export interface BaseMessage {
  type: string;
  protocol_version: number;
  timestamp?: number;
  seq?: number;
}

// Client -> Server: HELLO
export interface HelloMessage extends BaseMessage {
  type: 'HELLO';
  jwt: string;
  world_id: string;
  registry_version: number;
  generator_version: number;
}

// Server -> Client: WELCOME
export interface PlayerInfo {
  player_id: string;
  display_name: string;
  position: Vec3;
  yaw: number;
  pitch: number;
}

export interface WelcomeMessage extends BaseMessage {
  type: 'WELCOME';
  player_id: string;
  spawn_position: Vec3;
  server_time: number;
  players: PlayerInfo[];
  registry_version: number;
  generator_version: number;
}

// Client -> Server: INPUT
export interface InputMessage extends BaseMessage {
  type: 'INPUT';
  seq: number;
  timestamp: number;
  position: Vec3;
  velocity: Vec3;
  yaw: number;
  pitch: number;
  inputs: number; // bitfield: forward, back, left, right, jump, sneak
}

// Server -> Client: SNAPSHOT
export interface SnapshotPlayer {
  player_id: string;
  position: Vec3;
  velocity: Vec3;
  yaw: number;
  pitch: number;
  last_input_seq: number;
}

export interface SnapshotMessage extends BaseMessage {
  type: 'SNAPSHOT';
  server_time: number;
  players: SnapshotPlayer[];
}

// Client -> Server: SUBSCRIBE
export interface SubscribeMessage extends BaseMessage {
  type: 'SUBSCRIBE';
  section_ids: string[];
  unsubscribe_ids?: string[];
}

// Server -> Client: SECTION_DATA
export interface SectionDataMessage extends BaseMessage {
  type: 'SECTION_DATA';
  section_id: string;
  version: number;
  blocks: string; // base64 encoded
  is_baseline: boolean;
}

// Server -> Client: RESYNC
export interface ResyncMessage extends BaseMessage {
  type: 'RESYNC';
  reason: 'reconnect' | 'conflict' | 'server_restart';
  section_ids: string[];
}

// Client -> Server: BLOCK_EDIT_REQUEST
export interface BlockEditRequestMessage extends BaseMessage {
  type: 'BLOCK_EDIT_REQUEST';
  request_id: string;
  x: number;
  y: number;
  z: number;
  block_id: number;
}

// Server -> Client: BLOCK_EVENT
export interface BlockEventMessage extends BaseMessage {
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

// Server -> Client: ERROR
export interface ErrorMessage extends BaseMessage {
  type: 'ERROR';
  code: ErrorCode;
  message: string;
  fatal: boolean;
}

export type ErrorCode =
  | 'AUTH_FAILED'
  | 'AUTH_EXPIRED'
  | 'WORLD_NOT_FOUND'
  | 'WORLD_FULL'
  | 'REGISTRY_MISMATCH'
  | 'GENERATOR_MISMATCH'
  | 'RATE_LIMITED'
  | 'INVALID_REQUEST'
  | 'OUT_OF_BOUNDS'
  | 'PERMISSION_DENIED';

// Server -> Client: REDIRECT
export interface RedirectMessage extends BaseMessage {
  type: 'REDIRECT';
  url: string;
  reason: 'maintenance' | 'load_balance' | 'shutdown';
  delay_ms: number;
}

// Player join/leave events (included in SNAPSHOT implicitly)
export interface PlayerJoinMessage extends BaseMessage {
  type: 'PLAYER_JOIN';
  player: PlayerInfo;
}

export interface PlayerLeaveMessage extends BaseMessage {
  type: 'PLAYER_LEAVE';
  player_id: string;
}

// Union type for all messages
export type ClientMessage =
  | HelloMessage
  | InputMessage
  | SubscribeMessage
  | BlockEditRequestMessage;

export type ServerMessage =
  | WelcomeMessage
  | SnapshotMessage
  | SectionDataMessage
  | ResyncMessage
  | BlockEventMessage
  | ErrorMessage
  | RedirectMessage
  | PlayerJoinMessage
  | PlayerLeaveMessage;
