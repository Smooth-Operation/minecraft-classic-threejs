import { SECTION_SIZE, BLOCKS_PER_SECTION, BLOCK_STONE, BLOCK_GRASS, BLOCK_DIRT, BLOCK_AIR, localIndex } from '../constants';

// Block IDs for different biomes
const BLOCK_SAND = 7;      // Sand
const BLOCK_LOG = 17;      // Log
const BLOCK_LEAVES = 18;   // Leaves

// Biome types
enum Biome {
  PLAINS,
  FOREST,
  DESERT,
  MOUNTAINS,
  BEACH
}

// Simple noise implementation (Simplex-like)
class SimplexNoise {
  private perm: number[] = [];

  constructor(seed = 12345) {
    const p: number[] = [];
    for (let i = 0; i < 256; i++) p[i] = i;

    let s = seed;
    for (let i = 255; i > 0; i--) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const j = s % (i + 1);
      [p[i], p[j]] = [p[j], p[i]];
    }

    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255];
    }
  }

  private grad(hash: number, x: number, y: number): number {
    const h = hash & 7;
    const u = h < 4 ? x : y;
    const v = h < 4 ? y : x;
    return ((h & 1) ? -u : u) + ((h & 2) ? -2 * v : 2 * v);
  }

  noise2D(x: number, y: number): number {
    const F2 = 0.5 * (Math.sqrt(3) - 1);
    const G2 = (3 - Math.sqrt(3)) / 6;

    const s = (x + y) * F2;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);

    const t = (i + j) * G2;
    const X0 = i - t;
    const Y0 = j - t;
    const x0 = x - X0;
    const y0 = y - Y0;

    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;

    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;

    const ii = i & 255;
    const jj = j & 255;

    let n0 = 0, n1 = 0, n2 = 0;

    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) {
      t0 *= t0;
      n0 = t0 * t0 * this.grad(this.perm[ii + this.perm[jj]], x0, y0);
    }

    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) {
      t1 *= t1;
      n1 = t1 * t1 * this.grad(this.perm[ii + i1 + this.perm[jj + j1]], x1, y1);
    }

    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) {
      t2 *= t2;
      n2 = t2 * t2 * this.grad(this.perm[ii + 1 + this.perm[jj + 1]], x2, y2);
    }

    return 70 * (n0 + n1 + n2);
  }

  fbm(x: number, y: number, octaves: number, persistence: number): number {
    let total = 0;
    let frequency = 1;
    let amplitude = 1;
    let maxValue = 0;

    for (let i = 0; i < octaves; i++) {
      total += this.noise2D(x * frequency, y * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= persistence;
      frequency *= 2;
    }

    return total / maxValue;
  }
}

// Terrain generator with biomes
export class TerrainGenerator {
  private terrainNoise: SimplexNoise;
  private biomeNoise: SimplexNoise;
  private detailNoise: SimplexNoise;
  private seed: number;
  private cache: Map<string, { height: number; biome: Biome }> = new Map();
  private treeCache: Map<string, { hasTree: boolean; height: number } | null> = new Map();

  // Base terrain parameters
  private baseHeight = 45;

  constructor(seed = 12345) {
    this.seed = seed;
    this.terrainNoise = new SimplexNoise(seed);
    this.biomeNoise = new SimplexNoise(seed + 1000);
    this.detailNoise = new SimplexNoise(seed + 2000);
  }

  // Deterministic hash for tree placement
  private hashPosition(x: number, z: number): number {
    let h = this.seed;
    h = ((h << 5) - h + x) | 0;
    h = ((h << 5) - h + z) | 0;
    h = ((h * 2654435761) >>> 0);
    return (h & 0x7fffffff) / 0x7fffffff;
  }

  // Check if a tree should be at this position - grid-based for performance
  private getTreeAt(worldX: number, worldZ: number): { hasTree: boolean; height: number } | null {
    // Trees only spawn on a grid (every 6 blocks) for performance
    if (worldX % 6 !== 0 || worldZ % 6 !== 0) {
      return null;
    }

    const key = `${worldX},${worldZ}`;
    if (this.treeCache.has(key)) {
      return this.treeCache.get(key)!;
    }

    const { biome } = this.getTerrainData(worldX, worldZ);

    // Trees only in forest biome
    if (biome !== Biome.FOREST) {
      this.treeCache.set(key, null);
      return null;
    }

    // Use hash for deterministic tree placement
    // ~40% of grid positions in forest have trees
    const hash = this.hashPosition(worldX, worldZ);

    if (hash < 0.4) {
      // Tree height 4-5 blocks (simpler trees)
      const treeHeight = 4 + (hash < 0.2 ? 1 : 0);
      const result = { hasTree: true, height: treeHeight };
      this.treeCache.set(key, result);
      return result;
    }

    this.treeCache.set(key, null);
    return null;
  }

  // Get biome at position
  private getBiome(worldX: number, worldZ: number): Biome {
    // Large scale biome noise
    const biomeScale = 0.002;
    const temperature = this.biomeNoise.fbm(worldX * biomeScale, worldZ * biomeScale, 2, 0.5);
    const moisture = this.biomeNoise.fbm((worldX + 1000) * biomeScale, (worldZ + 1000) * biomeScale, 2, 0.5);

    // Determine biome from temperature and moisture
    if (temperature > 0.3) {
      // Hot
      return Biome.DESERT;
    } else if (temperature < -0.3) {
      // Cold - mountains
      return Biome.MOUNTAINS;
    } else if (moisture > 0.1) {
      // Wet - forest
      return Biome.FOREST;
    } else {
      // Default - plains
      return Biome.PLAINS;
    }
  }

  // Get terrain data at position (with caching)
  private getTerrainData(worldX: number, worldZ: number): { height: number; biome: Biome } {
    const key = `${worldX},${worldZ}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    const biome = this.getBiome(worldX, worldZ);

    // Base terrain - very smooth, large scale
    const baseScale = 0.003;
    const baseNoise = this.terrainNoise.fbm(worldX * baseScale, worldZ * baseScale, 2, 0.5);

    // Detail noise - small variations
    const detailScale = 0.02;
    const detailNoise = this.detailNoise.noise2D(worldX * detailScale, worldZ * detailScale) * 0.3;

    // Height variation based on biome
    let heightVariation: number;
    let baseOffset: number;

    switch (biome) {
      case Biome.PLAINS:
        // Very flat
        heightVariation = 4;
        baseOffset = 0;
        break;
      case Biome.FOREST:
        // Gentle rolling hills
        heightVariation = 8;
        baseOffset = 2;
        break;
      case Biome.DESERT:
        // Mostly flat with dunes
        heightVariation = 6;
        baseOffset = -2;
        break;
      case Biome.MOUNTAINS:
        // Tall peaks
        heightVariation = 35;
        baseOffset = 15;
        break;
      case Biome.BEACH:
        heightVariation = 2;
        baseOffset = -5;
        break;
      default:
        heightVariation = 6;
        baseOffset = 0;
    }

    // Calculate final height
    const combinedNoise = baseNoise * 0.8 + detailNoise * 0.2;
    const height = Math.floor(this.baseHeight + baseOffset + combinedNoise * heightVariation);

    const result = { height, biome };

    // Cache (with size limit)
    if (this.cache.size > 150000) {
      this.cache.clear();
    }
    this.cache.set(key, result);

    return result;
  }

  // Get terrain height
  getHeightAt(worldX: number, worldZ: number): number {
    return this.getTerrainData(worldX, worldZ).height;
  }

  // Check if position is part of a tree (trunk or leaves)
  // Optimized: only check nearest grid position since trees are on 6-block grid
  private getTreeBlockAt(worldX: number, worldY: number, worldZ: number): number {
    // Find nearest grid-aligned tree position
    const gridX = Math.round(worldX / 6) * 6;
    const gridZ = Math.round(worldZ / 6) * 6;

    // Distance from grid position
    const dx = worldX - gridX;
    const dz = worldZ - gridZ;
    const distX = Math.abs(dx);
    const distZ = Math.abs(dz);

    // Quick reject if too far from any possible tree
    if (distX > 2 || distZ > 2) return BLOCK_AIR;

    const tree = this.getTreeAt(gridX, gridZ);
    if (!tree) return BLOCK_AIR;

    const terrainHeight = this.getHeightAt(gridX, gridZ);
    const trunkBase = terrainHeight;
    const trunkTop = trunkBase + tree.height;
    const leavesBottom = trunkTop - 2;
    const leavesTop = trunkTop + 1;

    // Check if this is the trunk (exact grid position)
    if (distX === 0 && distZ === 0) {
      if (worldY >= trunkBase && worldY < trunkTop) {
        return BLOCK_LOG;
      }
    }

    // Check if this is leaves
    if (worldY >= leavesBottom && worldY <= leavesTop) {
      // Top layer: only directly above trunk
      if (worldY === leavesTop) {
        if (distX === 0 && distZ === 0) {
          return BLOCK_LEAVES;
        }
      }
      // Upper leaf layer: 1 block radius cross pattern
      else if (worldY === leavesTop - 1) {
        if (distX + distZ <= 1) {
          return BLOCK_LEAVES;
        }
      }
      // Lower leaf layers: 2 block radius (skip corners)
      else if (!(distX === 2 && distZ === 2)) {
        // Don't place leaves where trunk is
        if (!(distX === 0 && distZ === 0 && worldY < trunkTop)) {
          return BLOCK_LEAVES;
        }
      }
    }

    return BLOCK_AIR;
  }

  // Generate a section
  generateSection(cx: number, cz: number, sy: number): Uint16Array {
    const blocks = new Uint16Array(BLOCKS_PER_SECTION);

    const worldXStart = cx * SECTION_SIZE;
    const worldZStart = cz * SECTION_SIZE;
    const worldYStart = sy * SECTION_SIZE;

    for (let lz = 0; lz < SECTION_SIZE; lz++) {
      for (let lx = 0; lx < SECTION_SIZE; lx++) {
        const worldX = worldXStart + lx;
        const worldZ = worldZStart + lz;

        const { height: terrainHeight, biome } = this.getTerrainData(worldX, worldZ);

        // Determine surface and subsurface blocks based on biome
        let surfaceBlock: number;
        let subsurfaceBlock: number;

        switch (biome) {
          case Biome.DESERT:
            surfaceBlock = BLOCK_SAND;
            subsurfaceBlock = BLOCK_SAND;
            break;
          case Biome.MOUNTAINS:
            // Stone at high elevation, grass at lower
            if (terrainHeight > 65) {
              surfaceBlock = BLOCK_STONE;
              subsurfaceBlock = BLOCK_STONE;
            } else {
              surfaceBlock = BLOCK_GRASS;
              subsurfaceBlock = BLOCK_DIRT;
            }
            break;
          case Biome.BEACH:
            surfaceBlock = BLOCK_SAND;
            subsurfaceBlock = BLOCK_SAND;
            break;
          default:
            // Plains and Forest
            surfaceBlock = BLOCK_GRASS;
            subsurfaceBlock = BLOCK_DIRT;
        }

        for (let ly = 0; ly < SECTION_SIZE; ly++) {
          const worldY = worldYStart + ly;
          let blockId = BLOCK_AIR;

          if (worldY < terrainHeight - 5) {
            // Deep underground - always stone
            blockId = BLOCK_STONE;
          } else if (worldY < terrainHeight - 1) {
            // Subsurface layer
            blockId = subsurfaceBlock;
          } else if (worldY < terrainHeight) {
            // Surface layer
            blockId = surfaceBlock;
          } else {
            // Above ground - check for trees
            const treeBlock = this.getTreeBlockAt(worldX, worldY, worldZ);
            if (treeBlock !== BLOCK_AIR) {
              blockId = treeBlock;
            }
          }

          blocks[localIndex(lx, ly, lz)] = blockId;
        }
      }
    }

    return blocks;
  }

  // Get spawn height
  getSpawnHeight(worldX: number, worldZ: number): number {
    return this.getHeightAt(worldX, worldZ) + 2;
  }

  // Get biome name for debugging
  getBiomeName(worldX: number, worldZ: number): string {
    const biome = this.getBiome(worldX, worldZ);
    return Biome[biome];
  }

  getSeed(): number {
    return this.seed;
  }
}

// Global terrain generator instance
export const terrainGenerator = new TerrainGenerator(42);
