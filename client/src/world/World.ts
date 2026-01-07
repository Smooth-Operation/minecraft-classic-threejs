import { Section } from './Section';
import { terrainGenerator } from './TerrainGenerator';
import { blockRegistry } from './BlockRegistry';
import { eventBus, Events } from '../core/EventBus';
import {
  SECTIONS_PER_CHUNK_Y,
  TOTAL_CHUNKS_X,
  TOTAL_CHUNKS_Z,
  sectionId,
  worldToSection,
  worldToLocal,
  isInBounds
} from '../constants';

export class World {
  private sections: Map<string, Section> = new Map();
  private maxCachedSections: number;

  constructor(maxCachedSections = 8192) {
    // Need enough for view radius. 12 chunk radius ≈ 450 columns × 8 Y = 3600 sections
    // Set to 8192 to have plenty of buffer
    this.maxCachedSections = maxCachedSections;
  }

  // Get or create section (generates baseline if not loaded)
  getOrCreateSection(cx: number, cz: number, sy: number): Section {
    // Bounds check
    if (cx < 0 || cx >= TOTAL_CHUNKS_X ||
        cz < 0 || cz >= TOTAL_CHUNKS_Z ||
        sy < 0 || sy >= SECTIONS_PER_CHUNK_Y) {
      throw new Error(`Section out of bounds: ${cx}:${cz}:${sy}`);
    }

    const id = sectionId(cx, cz, sy);
    let section = this.sections.get(id);

    if (!section) {
      // Generate terrain
      const blocks = terrainGenerator.generateSection(cx, cz, sy);
      section = new Section(id, blocks, 0);
      this.sections.set(id, section);
      this.evictIfNeeded();
      eventBus.emit(Events.SECTION_LOADED, { sectionId: id });
    }

    return section;
  }

  // Get section if loaded, undefined otherwise
  getSection(cx: number, cz: number, sy: number): Section | undefined {
    return this.sections.get(sectionId(cx, cz, sy));
  }

  // Get section by ID
  getSectionById(id: string): Section | undefined {
    return this.sections.get(id);
  }

  // Set section data (from server)
  setSection(id: string, blocks: Uint16Array, version: number): Section {
    const section = new Section(id, blocks, version);
    this.sections.set(id, section);
    this.evictIfNeeded();
    eventBus.emit(Events.SECTION_LOADED, { sectionId: id });
    return section;
  }

  // Get block at world coordinates
  getBlock(x: number, y: number, z: number): number {
    if (!isInBounds(x, y, z)) return 0;

    const { cx, cz, sy } = worldToSection(x, y, z);
    const section = this.getSection(cx, cz, sy);

    if (!section) {
      // Generate section on demand if not loaded
      const newSection = this.getOrCreateSection(cx, cz, sy);
      const { lx, ly, lz } = worldToLocal(x, y, z);
      return newSection.getBlock(lx, ly, lz);
    }

    const { lx, ly, lz } = worldToLocal(x, y, z);
    return section.getBlock(lx, ly, lz);
  }

  // Set block at world coordinates
  setBlock(x: number, y: number, z: number, blockId: number): boolean {
    if (!isInBounds(x, y, z)) return false;

    const { cx, cz, sy } = worldToSection(x, y, z);
    const section = this.getOrCreateSection(cx, cz, sy);
    const { lx, ly, lz } = worldToLocal(x, y, z);

    const changed = section.setBlock(lx, ly, lz, blockId);
    if (changed) {
      eventBus.emit(Events.BLOCK_CHANGED, { x, y, z, blockId, sectionId: section.id });
    }
    return changed;
  }

  // Check if block is solid
  isSolid(x: number, y: number, z: number): boolean {
    return blockRegistry.isSolid(this.getBlock(x, y, z));
  }

  // Get all loaded sections
  getLoadedSections(): Section[] {
    return Array.from(this.sections.values());
  }

  // Get dirty sections that need mesh rebuild
  getDirtySections(): Section[] {
    return this.getLoadedSections().filter(s => s.dirty);
  }

  // Unload section
  unloadSection(id: string): void {
    this.sections.delete(id);
  }

  // Get neighbor sections for meshing (returns undefined for unloaded)
  getNeighborBlocks(section: Section): {
    px?: Uint16Array;
    nx?: Uint16Array;
    py?: Uint16Array;
    ny?: Uint16Array;
    pz?: Uint16Array;
    nz?: Uint16Array;
  } {
    const { cx, cz, sy } = section;
    const neighbors: {
      px?: Uint16Array;
      nx?: Uint16Array;
      py?: Uint16Array;
      ny?: Uint16Array;
      pz?: Uint16Array;
      nz?: Uint16Array;
    } = {};

    // +X neighbor
    if (cx + 1 < TOTAL_CHUNKS_X) {
      const n = this.getSection(cx + 1, cz, sy);
      if (n) neighbors.px = n.blocks;
    }

    // -X neighbor
    if (cx > 0) {
      const n = this.getSection(cx - 1, cz, sy);
      if (n) neighbors.nx = n.blocks;
    }

    // +Y neighbor
    if (sy + 1 < SECTIONS_PER_CHUNK_Y) {
      const n = this.getSection(cx, cz, sy + 1);
      if (n) neighbors.py = n.blocks;
    }

    // -Y neighbor
    if (sy > 0) {
      const n = this.getSection(cx, cz, sy - 1);
      if (n) neighbors.ny = n.blocks;
    }

    // +Z neighbor
    if (cz + 1 < TOTAL_CHUNKS_Z) {
      const n = this.getSection(cx, cz + 1, sy);
      if (n) neighbors.pz = n.blocks;
    }

    // -Z neighbor
    if (cz > 0) {
      const n = this.getSection(cx, cz - 1, sy);
      if (n) neighbors.nz = n.blocks;
    }

    return neighbors;
  }

  // Evict oldest sections if over limit (simple LRU would need access tracking)
  private evictIfNeeded(): void {
    while (this.sections.size > this.maxCachedSections) {
      // Simple eviction: remove first entry (oldest insertion)
      const firstKey = this.sections.keys().next().value;
      if (firstKey) {
        this.sections.delete(firstKey);
      }
    }
  }

  // Clear all sections
  clear(): void {
    this.sections.clear();
  }

  // Get sections in radius around a point
  getSectionsInRadius(worldX: number, worldZ: number, radiusChunks: number): string[] {
    const { cx: centerCx, cz: centerCz } = worldToSection(worldX, 0, worldZ);
    const ids: string[] = [];

    for (let dx = -radiusChunks; dx <= radiusChunks; dx++) {
      for (let dz = -radiusChunks; dz <= radiusChunks; dz++) {
        const cx = centerCx + dx;
        const cz = centerCz + dz;

        if (cx < 0 || cx >= TOTAL_CHUNKS_X || cz < 0 || cz >= TOTAL_CHUNKS_Z) {
          continue;
        }

        // Distance check (circular radius)
        if (dx * dx + dz * dz > radiusChunks * radiusChunks) {
          continue;
        }

        // Add all Y sections for this chunk
        for (let sy = 0; sy < SECTIONS_PER_CHUNK_Y; sy++) {
          ids.push(sectionId(cx, cz, sy));
        }
      }
    }

    return ids;
  }
}
