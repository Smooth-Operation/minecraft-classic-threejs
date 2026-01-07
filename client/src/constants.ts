// World dimensions
export const WORLD_SIZE_X = 4096;
export const WORLD_SIZE_Y = 128;
export const WORLD_SIZE_Z = 4096;

// Section dimensions
export const SECTION_SIZE = 16;
export const BLOCKS_PER_SECTION = SECTION_SIZE * SECTION_SIZE * SECTION_SIZE; // 4096

// Chunk layout
export const SECTIONS_PER_CHUNK_Y = WORLD_SIZE_Y / SECTION_SIZE; // 8
export const TOTAL_CHUNKS_X = WORLD_SIZE_X / SECTION_SIZE; // 256
export const TOTAL_CHUNKS_Z = WORLD_SIZE_Z / SECTION_SIZE; // 256

// Block IDs
export const BLOCK_AIR = 0;
export const BLOCK_STONE = 1;
export const BLOCK_GRASS = 2;
export const BLOCK_DIRT = 3;

// Player physics
export const GRAVITY = 20; // blocks/sec²
export const JUMP_VELOCITY = 8; // blocks/sec
export const WALK_SPEED = 4.3; // blocks/sec
export const REACH_DISTANCE = 5; // blocks

// Mobile defaults
export const MOBILE_VIEW_DISTANCE = 4; // chunks
export const DESKTOP_VIEW_DISTANCE = 8; // chunks
export const MOBILE_INPUT_RATE = 20; // Hz
export const DESKTOP_INPUT_RATE = 30; // Hz

// Protocol
export const PROTOCOL_VERSION = 1;
export const REGISTRY_VERSION = 1;
export const GENERATOR_VERSION = 1;

// Compute local index from local coordinates (Y-major, then Z, then X)
export function localIndex(lx: number, ly: number, lz: number): number {
  return (ly * 256) + (lz * 16) + lx;
}

// Compute section ID from chunk coordinates
export function sectionId(cx: number, cz: number, sy: number): string {
  return `${cx}:${cz}:${sy}`;
}

// Parse section ID back to coordinates
export function parseSectionId(id: string): { cx: number; cz: number; sy: number } {
  const [cx, cz, sy] = id.split(':').map(Number);
  return { cx, cz, sy };
}

// World coords to section coords
export function worldToSection(x: number, y: number, z: number): { cx: number; cz: number; sy: number } {
  return {
    cx: Math.floor(x / SECTION_SIZE),
    cz: Math.floor(z / SECTION_SIZE),
    sy: Math.floor(y / SECTION_SIZE)
  };
}

// World coords to local coords within section
export function worldToLocal(x: number, y: number, z: number): { lx: number; ly: number; lz: number } {
  return {
    lx: ((x % SECTION_SIZE) + SECTION_SIZE) % SECTION_SIZE,
    ly: ((y % SECTION_SIZE) + SECTION_SIZE) % SECTION_SIZE,
    lz: ((z % SECTION_SIZE) + SECTION_SIZE) % SECTION_SIZE
  };
}

// Check if world coordinates are in bounds
export function isInBounds(x: number, y: number, z: number): boolean {
  return x >= 0 && x < WORLD_SIZE_X &&
         y >= 0 && y < WORLD_SIZE_Y &&
         z >= 0 && z < WORLD_SIZE_Z;
}
