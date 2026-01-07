import { BLOCK_AIR, BLOCK_STONE, BLOCK_GRASS, BLOCK_DIRT } from '../constants';
import type { BlockDef } from '../types';

// Atlas tile indices (16x16 grid, 256 tiles)
// Row 0: stone, dirt, grass_side, grass_top, wood_planks, stone_slab_side, stone_slab_top, brick
// Row 1: cobblestone, bedrock, sand, gravel, wood_side, wood_top, leaves, ...
const TILES = {
  STONE: 1,
  DIRT: 2,
  GRASS_SIDE: 3,
  GRASS_TOP: 0,
  WOOD_PLANKS: 4,
  COBBLESTONE: 16,
  BEDROCK: 17,
  SAND: 18,
  GRAVEL: 19,
  WOOD_SIDE: 20,
  WOOD_TOP: 21,
  LEAVES: 52,
  GLASS: 49,
  WOOL_WHITE: 64,
  BRICK: 7,
  TNT_SIDE: 8,
  TNT_TOP: 9,
  TNT_BOTTOM: 10,
  GOLD_BLOCK: 23,
  IRON_BLOCK: 22,
  SPONGE: 48,
  WATER: 205,
  LAVA: 237
};

class BlockRegistry {
  private blocks: Map<number, BlockDef> = new Map();

  constructor() {
    this.register({
      id: BLOCK_AIR,
      name: 'Air',
      solid: false,
      renderGroup: 'none',
      atlasIndices: { top: 0, bottom: 0, north: 0, south: 0, east: 0, west: 0 }
    });

    this.register({
      id: BLOCK_STONE,
      name: 'Stone',
      solid: true,
      renderGroup: 'opaque',
      atlasIndices: {
        top: TILES.STONE,
        bottom: TILES.STONE,
        north: TILES.STONE,
        south: TILES.STONE,
        east: TILES.STONE,
        west: TILES.STONE
      }
    });

    this.register({
      id: BLOCK_GRASS,
      name: 'Grass',
      solid: true,
      renderGroup: 'opaque',
      atlasIndices: {
        top: TILES.GRASS_TOP,
        bottom: TILES.DIRT,
        north: TILES.GRASS_SIDE,
        south: TILES.GRASS_SIDE,
        east: TILES.GRASS_SIDE,
        west: TILES.GRASS_SIDE
      }
    });

    this.register({
      id: BLOCK_DIRT,
      name: 'Dirt',
      solid: true,
      renderGroup: 'opaque',
      atlasIndices: {
        top: TILES.DIRT,
        bottom: TILES.DIRT,
        north: TILES.DIRT,
        south: TILES.DIRT,
        east: TILES.DIRT,
        west: TILES.DIRT
      }
    });

    // Additional blocks for variety
    this.register({
      id: 4,
      name: 'Cobblestone',
      solid: true,
      renderGroup: 'opaque',
      atlasIndices: {
        top: TILES.COBBLESTONE,
        bottom: TILES.COBBLESTONE,
        north: TILES.COBBLESTONE,
        south: TILES.COBBLESTONE,
        east: TILES.COBBLESTONE,
        west: TILES.COBBLESTONE
      }
    });

    this.register({
      id: 5,
      name: 'Wood Planks',
      solid: true,
      renderGroup: 'opaque',
      atlasIndices: {
        top: TILES.WOOD_PLANKS,
        bottom: TILES.WOOD_PLANKS,
        north: TILES.WOOD_PLANKS,
        south: TILES.WOOD_PLANKS,
        east: TILES.WOOD_PLANKS,
        west: TILES.WOOD_PLANKS
      }
    });

    this.register({
      id: 6,
      name: 'Brick',
      solid: true,
      renderGroup: 'opaque',
      atlasIndices: {
        top: TILES.BRICK,
        bottom: TILES.BRICK,
        north: TILES.BRICK,
        south: TILES.BRICK,
        east: TILES.BRICK,
        west: TILES.BRICK
      }
    });

    this.register({
      id: 7,
      name: 'Sand',
      solid: true,
      renderGroup: 'opaque',
      atlasIndices: {
        top: TILES.SAND,
        bottom: TILES.SAND,
        north: TILES.SAND,
        south: TILES.SAND,
        east: TILES.SAND,
        west: TILES.SAND
      }
    });

    this.register({
      id: 8,
      name: 'Gravel',
      solid: true,
      renderGroup: 'opaque',
      atlasIndices: {
        top: TILES.GRAVEL,
        bottom: TILES.GRAVEL,
        north: TILES.GRAVEL,
        south: TILES.GRAVEL,
        east: TILES.GRAVEL,
        west: TILES.GRAVEL
      }
    });

    this.register({
      id: 9,
      name: 'Gold Block',
      solid: true,
      renderGroup: 'opaque',
      atlasIndices: {
        top: TILES.GOLD_BLOCK,
        bottom: TILES.GOLD_BLOCK,
        north: TILES.GOLD_BLOCK,
        south: TILES.GOLD_BLOCK,
        east: TILES.GOLD_BLOCK,
        west: TILES.GOLD_BLOCK
      }
    });

    this.register({
      id: 17,
      name: 'Log',
      solid: true,
      renderGroup: 'opaque',
      atlasIndices: {
        top: TILES.WOOD_TOP,
        bottom: TILES.WOOD_TOP,
        north: TILES.WOOD_SIDE,
        south: TILES.WOOD_SIDE,
        east: TILES.WOOD_SIDE,
        west: TILES.WOOD_SIDE
      }
    });

    this.register({
      id: 18,
      name: 'Leaves',
      solid: true,
      renderGroup: 'opaque',
      atlasIndices: {
        top: TILES.LEAVES,
        bottom: TILES.LEAVES,
        north: TILES.LEAVES,
        south: TILES.LEAVES,
        east: TILES.LEAVES,
        west: TILES.LEAVES
      }
    });
  }

  register(block: BlockDef): void {
    this.blocks.set(block.id, block);
  }

  get(id: number): BlockDef | undefined {
    return this.blocks.get(id);
  }

  isSolid(id: number): boolean {
    const block = this.blocks.get(id);
    return block ? block.solid : false;
  }

  isTransparent(id: number): boolean {
    if (id === BLOCK_AIR) return true;
    const block = this.blocks.get(id);
    return block ? block.renderGroup !== 'opaque' : false;
  }

  getRenderGroup(id: number): 'opaque' | 'cutout' | 'translucent' | 'none' {
    const block = this.blocks.get(id);
    return block ? block.renderGroup : 'none';
  }

  getAtlasIndex(id: number, face: 'top' | 'bottom' | 'north' | 'south' | 'east' | 'west'): number {
    const block = this.blocks.get(id);
    return block ? block.atlasIndices[face] : 0;
  }

  getAllBlocks(): BlockDef[] {
    return Array.from(this.blocks.values()).filter(b => b.id !== BLOCK_AIR);
  }
}

export const blockRegistry = new BlockRegistry();
