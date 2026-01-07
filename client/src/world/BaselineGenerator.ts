import { SECTION_SIZE, BLOCKS_PER_SECTION, BLOCK_STONE, BLOCK_GRASS, BLOCK_AIR, localIndex } from '../constants';

// Flat world baseline generator
// Y = 0..3: Stone (id=1)
// Y = 4: Grass (id=2)
// Y = 5..127: Air (id=0)
export function generateBaselineSection(sy: number): Uint16Array {
  const blocks = new Uint16Array(BLOCKS_PER_SECTION);

  const worldYStart = sy * SECTION_SIZE;

  for (let ly = 0; ly < SECTION_SIZE; ly++) {
    const worldY = worldYStart + ly;
    let blockId: number;

    if (worldY < 4) {
      blockId = BLOCK_STONE;
    } else if (worldY === 4) {
      blockId = BLOCK_GRASS;
    } else {
      blockId = BLOCK_AIR;
    }

    // Fill entire layer with this block
    for (let lz = 0; lz < SECTION_SIZE; lz++) {
      for (let lx = 0; lx < SECTION_SIZE; lx++) {
        blocks[localIndex(lx, ly, lz)] = blockId;
      }
    }
  }

  return blocks;
}

// Check if a section is entirely baseline (no modifications)
export function isBaselineSection(sy: number, blocks: Uint16Array): boolean {
  const baseline = generateBaselineSection(sy);
  if (blocks.length !== baseline.length) return false;
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i] !== baseline[i]) return false;
  }
  return true;
}

// Get expected block at world Y coordinate for flat world
export function getBaselineBlockAtY(worldY: number): number {
  if (worldY < 0) return BLOCK_STONE; // Below bedrock
  if (worldY < 4) return BLOCK_STONE;
  if (worldY === 4) return BLOCK_GRASS;
  return BLOCK_AIR;
}
