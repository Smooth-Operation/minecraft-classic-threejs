// World Constants (from SHARED_CONTRACTS.md Section 3.1)
export const WORLD_SIZE_X = 4096;
export const WORLD_SIZE_Z = 4096;
export const WORLD_SIZE_Y = 128;

export const CHUNK_SIZE_X = 16;
export const CHUNK_SIZE_Z = 16;
export const SECTION_SIZE_X = 16;
export const SECTION_SIZE_Y = 16;
export const SECTION_SIZE_Z = 16;

export const SECTIONS_PER_CHUNK = 8; // 128 / 16
export const TOTAL_CHUNKS_X = 256; // 4096 / 16
export const TOTAL_CHUNKS_Z = 256;
export const BLOCKS_PER_SECTION = 4096; // 16 * 16 * 16
export const SECTION_BYTES = 8192; // 4096 * 2 (uint16)

// Protocol Constants
export const PROTOCOL_VERSION = 1;
export const REGISTRY_VERSION = 1;
export const GENERATOR_VERSION = 1;

// Server Limits
export const MAX_PLAYERS_PER_WORLD = 8;
export const MAX_MESSAGE_SIZE = 64 * 1024; // 64 KB
export const CONNECTION_RATE_LIMIT = 3; // per minute per IP
export const MESSAGE_RATE_LIMIT = 100; // per second per connection

// Timing
export const HELLO_TIMEOUT_MS = 5000;
export const STALE_CONNECTION_MS = 60000;
export const TICK_RATE_MS = 50; // 20 Hz
export const HEARTBEAT_INTERVAL_MS = 30000;
export const JWKS_CACHE_TTL_MS = 3600000; // 1 hour

// Gameplay
export const MAX_REACH_DISTANCE = 5.0;
export const PLAYER_EYE_HEIGHT = 1.6;
export const MAX_EDITS_PER_SECOND = 20;
export const MAX_SUBSCRIBE_PER_SECOND = 100; // Allow initial world load

// Movement
export const MAX_HORIZONTAL_SPEED = 10; // blocks/sec
export const MAX_VERTICAL_SPEED_UP = 15; // blocks/sec
export const MAX_VERTICAL_SPEED_DOWN = 50; // blocks/sec
export const TELEPORT_THRESHOLD = 20; // blocks/tick

// View Distance
export const MAX_VIEW_RADIUS_MOBILE = 4; // chunks
export const MAX_VIEW_RADIUS_DESKTOP = 8; // chunks
export const MAX_SECTIONS_MOBILE = 128;
export const MAX_SECTIONS_DESKTOP = 512;
export const SECTIONS_PER_SECOND_MOBILE = 4;
export const SECTIONS_PER_SECOND_DESKTOP = 8;

// Persistence
export const PERSISTENCE_BATCH_WINDOW_MS = 1000;
export const MAX_DIRTY_SECTIONS = 500;
export const REQUEST_ID_TTL_MS = 60000;

// Block IDs (reserved)
export const BLOCK_AIR = 0;
export const BLOCK_STONE = 1;
export const BLOCK_GRASS = 2;
export const BLOCK_DIRT = 3;

// WebSocket Close Codes
export const WS_CLOSE_NORMAL = 1000;
export const WS_CLOSE_GOING_AWAY = 1001;
export const WS_CLOSE_PROTOCOL_ERROR = 1002;
export const WS_CLOSE_INVALID_ORIGIN = 4403;
export const WS_CLOSE_RATE_LIMITED = 4429;
