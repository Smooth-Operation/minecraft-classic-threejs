import { BLOCKS_PER_SECTION, SECTION_SIZE, localIndex, parseSectionId } from '../constants';
import type { SectionData } from '../types';

export class Section implements SectionData {
  id: string;
  cx: number;
  cz: number;
  sy: number;
  version: number;
  blocks: Uint16Array;
  dirty: boolean;

  constructor(id: string, blocks?: Uint16Array, version = 0) {
    this.id = id;
    const coords = parseSectionId(id);
    this.cx = coords.cx;
    this.cz = coords.cz;
    this.sy = coords.sy;
    this.version = version;
    this.blocks = blocks ?? new Uint16Array(BLOCKS_PER_SECTION);
    this.dirty = false;
  }

  getBlock(lx: number, ly: number, lz: number): number {
    if (lx < 0 || lx >= SECTION_SIZE ||
        ly < 0 || ly >= SECTION_SIZE ||
        lz < 0 || lz >= SECTION_SIZE) {
      return 0; // Out of bounds = air
    }
    return this.blocks[localIndex(lx, ly, lz)];
  }

  setBlock(lx: number, ly: number, lz: number, blockId: number): boolean {
    if (lx < 0 || lx >= SECTION_SIZE ||
        ly < 0 || ly >= SECTION_SIZE ||
        lz < 0 || lz >= SECTION_SIZE) {
      return false;
    }
    const idx = localIndex(lx, ly, lz);
    if (this.blocks[idx] !== blockId) {
      this.blocks[idx] = blockId;
      this.dirty = true;
      return true;
    }
    return false;
  }

  markClean(): void {
    this.dirty = false;
  }

  // Clone section data for worker
  cloneBlocks(): Uint16Array {
    return new Uint16Array(this.blocks);
  }

  // Decode from base64 (from server)
  static fromBase64(id: string, base64: string, version: number): Section {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const blocks = new Uint16Array(bytes.buffer);
    return new Section(id, blocks, version);
  }

  // Encode to base64 (for server)
  toBase64(): string {
    const bytes = new Uint8Array(this.blocks.buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
}
