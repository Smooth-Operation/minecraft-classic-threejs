import {
  WORLD_SIZE_X,
  WORLD_SIZE_Y,
  WORLD_SIZE_Z,
  SECTION_SIZE_X,
  SECTION_SIZE_Y,
  SECTION_SIZE_Z,
  TOTAL_CHUNKS_X,
  TOTAL_CHUNKS_Z,
  SECTIONS_PER_CHUNK,
} from '../types/constants.js';

// Check if world coordinates are valid
export function isValidWorldCoord(x: number, y: number, z: number): boolean {
  return (
    x >= 0 && x < WORLD_SIZE_X &&
    y >= 0 && y < WORLD_SIZE_Y &&
    z >= 0 && z < WORLD_SIZE_Z &&
    Number.isInteger(x) &&
    Number.isInteger(y) &&
    Number.isInteger(z)
  );
}

// Check if section coordinates are valid
export function isValidSectionCoord(cx: number, cz: number, sy: number): boolean {
  return (
    cx >= 0 && cx < TOTAL_CHUNKS_X &&
    cz >= 0 && cz < TOTAL_CHUNKS_Z &&
    sy >= 0 && sy < SECTIONS_PER_CHUNK &&
    Number.isInteger(cx) &&
    Number.isInteger(cz) &&
    Number.isInteger(sy)
  );
}

// Parse section ID string "cx:cz:sy"
export function parseSectionId(sectionId: string): { cx: number; cz: number; sy: number } | null {
  const parts = sectionId.split(':');
  if (parts.length !== 3) return null;

  const cx = parseInt(parts[0], 10);
  const cz = parseInt(parts[1], 10);
  const sy = parseInt(parts[2], 10);

  if (isNaN(cx) || isNaN(cz) || isNaN(sy)) return null;
  if (!isValidSectionCoord(cx, cz, sy)) return null;

  return { cx, cz, sy };
}

// Create section ID from coordinates
export function createSectionId(cx: number, cz: number, sy: number): string {
  return `${cx}:${cz}:${sy}`;
}

// Get section ID from world coordinates
export function worldToSectionId(x: number, y: number, z: number): string {
  const cx = Math.floor(x / SECTION_SIZE_X);
  const cz = Math.floor(z / SECTION_SIZE_Z);
  const sy = Math.floor(y / SECTION_SIZE_Y);
  return createSectionId(cx, cz, sy);
}

// Get local coordinates within section
export function worldToLocal(x: number, y: number, z: number): { lx: number; ly: number; lz: number } {
  return {
    lx: x % SECTION_SIZE_X,
    ly: y % SECTION_SIZE_Y,
    lz: z % SECTION_SIZE_Z,
  };
}

// Calculate local index within section (Y-major, then Z, then X)
export function localToIndex(lx: number, ly: number, lz: number): number {
  return (ly * 256) + (lz * 16) + lx;
}

// Get block index in section from world coordinates
export function worldToBlockIndex(x: number, y: number, z: number): number {
  const { lx, ly, lz } = worldToLocal(x, y, z);
  return localToIndex(lx, ly, lz);
}

// Clamp position to world bounds
export function clampToWorld(x: number, y: number, z: number): { x: number; y: number; z: number } {
  return {
    x: Math.max(0, Math.min(WORLD_SIZE_X - 1, x)),
    y: Math.max(0, Math.min(WORLD_SIZE_Y - 1, y)),
    z: Math.max(0, Math.min(WORLD_SIZE_Z - 1, z)),
  };
}

// Calculate Euclidean distance between two points
export function distance(
  x1: number, y1: number, z1: number,
  x2: number, y2: number, z2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dz = z2 - z1;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// Get all section IDs within a radius of chunks from a position
export function getSectionsInRadius(
  x: number, y: number, z: number,
  radiusChunks: number
): string[] {
  const centerCx = Math.floor(x / SECTION_SIZE_X);
  const centerCz = Math.floor(z / SECTION_SIZE_Z);

  const sections: string[] = [];

  for (let dx = -radiusChunks; dx <= radiusChunks; dx++) {
    for (let dz = -radiusChunks; dz <= radiusChunks; dz++) {
      const cx = centerCx + dx;
      const cz = centerCz + dz;

      if (cx < 0 || cx >= TOTAL_CHUNKS_X || cz < 0 || cz >= TOTAL_CHUNKS_Z) {
        continue;
      }

      // Add all Y sections in this chunk
      for (let sy = 0; sy < SECTIONS_PER_CHUNK; sy++) {
        sections.push(createSectionId(cx, cz, sy));
      }
    }
  }

  return sections;
}

// Sort sections by distance from a position (for progressive loading)
export function sortSectionsByDistance(
  sections: string[],
  x: number, y: number, z: number
): string[] {
  const centerCx = Math.floor(x / SECTION_SIZE_X);
  const centerCz = Math.floor(z / SECTION_SIZE_Z);
  const centerSy = Math.floor(y / SECTION_SIZE_Y);

  return sections.slice().sort((a, b) => {
    const coordsA = parseSectionId(a);
    const coordsB = parseSectionId(b);
    if (!coordsA || !coordsB) return 0;

    const distA = Math.abs(coordsA.cx - centerCx) +
                  Math.abs(coordsA.cz - centerCz) +
                  Math.abs(coordsA.sy - centerSy);
    const distB = Math.abs(coordsB.cx - centerCx) +
                  Math.abs(coordsB.cz - centerCz) +
                  Math.abs(coordsB.sy - centerSy);

    return distA - distB;
  });
}
