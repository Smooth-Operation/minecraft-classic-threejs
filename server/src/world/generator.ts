import {
  BLOCKS_PER_SECTION,
  SECTION_SIZE_Y,
  BLOCK_AIR,
  BLOCK_STONE,
  BLOCK_GRASS,
} from '../types/constants.js';
import { parseSectionId } from '../utils/coordinates.js';
import type { Section } from '../types/state.js';

// Flat world baseline (generator_version = 1)
// Y = 0-3: Stone (id=1)
// Y = 4: Grass (id=2)
// Y = 5-127: Air (id=0)

const STONE_LAYERS = 4; // Y 0-3
const GRASS_LAYER = 4; // Y = 4

export function generateBaselineSection(sectionId: string): Section {
  const coords = parseSectionId(sectionId);
  if (!coords) {
    throw new Error(`Invalid section ID: ${sectionId}`);
  }

  const { sy } = coords;
  const blocks = new Uint16Array(BLOCKS_PER_SECTION);

  // Calculate Y range for this section
  const yStart = sy * SECTION_SIZE_Y;
  const yEnd = yStart + SECTION_SIZE_Y;

  // Fill blocks based on flat world rules
  for (let ly = 0; ly < SECTION_SIZE_Y; ly++) {
    const worldY = yStart + ly;
    let blockId: number;

    if (worldY < STONE_LAYERS) {
      blockId = BLOCK_STONE;
    } else if (worldY === GRASS_LAYER) {
      blockId = BLOCK_GRASS;
    } else {
      blockId = BLOCK_AIR;
    }

    // Fill entire Y layer with same block
    // Index formula: (ly * 256) + (lz * 16) + lx
    const baseIndex = ly * 256;
    for (let lz = 0; lz < 16; lz++) {
      for (let lx = 0; lx < 16; lx++) {
        blocks[baseIndex + (lz * 16) + lx] = blockId;
      }
    }
  }

  return {
    sectionId,
    version: 0, // Baseline sections start at version 0
    blocks,
    dirty: false,
    lastAccessed: Date.now(),
    fromDatabase: false,
  };
}

// Check if a section would be all air (optimization for upper sections)
export function isAllAirSection(sectionId: string): boolean {
  const coords = parseSectionId(sectionId);
  if (!coords) return false;

  const yStart = coords.sy * SECTION_SIZE_Y;
  // If entire section is above grass layer, it's all air
  return yStart > GRASS_LAYER;
}

// Find spawn position (center of world, above terrain)
// Spawn high so player falls to ground - terrain height varies with biomes
export function getSpawnPosition(): { x: number; y: number; z: number } {
  return {
    x: 512,  // Near world origin for faster initial load
    y: 80,   // High enough to be above any terrain (mountains max ~75)
    z: 512,
  };
}

// Encode section blocks to base64 for transmission
export function encodeSectionBlocks(blocks: Uint16Array): string {
  const buffer = Buffer.from(blocks.buffer);
  return buffer.toString('base64');
}

// Decode section blocks from base64
export function decodeSectionBlocks(base64: string): Uint16Array {
  const buffer = Buffer.from(base64, 'base64');
  return new Uint16Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 2);
}

// Decode section blocks from database bytea (ArrayBuffer)
export function decodeSectionBlocksFromDb(data: ArrayBuffer): Uint16Array {
  return new Uint16Array(data);
}
