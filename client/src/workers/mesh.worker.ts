// Mesh Worker - Builds geometry for voxel sections
// Runs in a Web Worker to avoid blocking the main thread

const SECTION_SIZE = 16;
const ATLAS_SIZE = 16; // 16x16 tiles in atlas
const TILE_UV = 1 / ATLAS_SIZE;

// Block IDs
const BLOCK_AIR = 0;
const BLOCK_STONE = 1;
const BLOCK_GRASS = 2;
const BLOCK_DIRT = 3;

// Block rendering data
interface BlockFaces {
  top: number;
  bottom: number;
  north: number;
  south: number;
  east: number;
  west: number;
  solid: boolean;
}

const BLOCKS: Record<number, BlockFaces> = {
  [BLOCK_STONE]: { top: 1, bottom: 1, north: 1, south: 1, east: 1, west: 1, solid: true },
  [BLOCK_GRASS]: { top: 0, bottom: 2, north: 3, south: 3, east: 3, west: 3, solid: true },
  [BLOCK_DIRT]: { top: 2, bottom: 2, north: 2, south: 2, east: 2, west: 2, solid: true },
  4: { top: 16, bottom: 16, north: 16, south: 16, east: 16, west: 16, solid: true }, // Cobblestone
  5: { top: 4, bottom: 4, north: 4, south: 4, east: 4, west: 4, solid: true }, // Planks
  6: { top: 7, bottom: 7, north: 7, south: 7, east: 7, west: 7, solid: true }, // Brick
  7: { top: 18, bottom: 18, north: 18, south: 18, east: 18, west: 18, solid: true }, // Sand
  8: { top: 19, bottom: 19, north: 19, south: 19, east: 19, west: 19, solid: true }, // Gravel
  9: { top: 23, bottom: 23, north: 23, south: 23, east: 23, west: 23, solid: true }, // Gold
  17: { top: 21, bottom: 21, north: 20, south: 20, east: 20, west: 20, solid: true }, // Log
  18: { top: 52, bottom: 52, north: 52, south: 52, east: 52, west: 52, solid: true }, // Leaves
};

interface MeshRequest {
  type: 'MESH_REQUEST';
  sectionId: string;
  blocks: Uint16Array;
  neighbors: {
    px?: Uint16Array;
    nx?: Uint16Array;
    py?: Uint16Array;
    ny?: Uint16Array;
    pz?: Uint16Array;
    nz?: Uint16Array;
  };
}

function localIndex(lx: number, ly: number, lz: number): number {
  return (ly * 256) + (lz * 16) + lx;
}

function getBlock(
  blocks: Uint16Array,
  neighbors: MeshRequest['neighbors'],
  lx: number,
  ly: number,
  lz: number
): number {
  // Inside section bounds
  if (lx >= 0 && lx < SECTION_SIZE &&
      ly >= 0 && ly < SECTION_SIZE &&
      lz >= 0 && lz < SECTION_SIZE) {
    return blocks[localIndex(lx, ly, lz)];
  }

  // Check neighbor sections
  if (lx < 0) {
    if (neighbors.nx) return neighbors.nx[localIndex(lx + SECTION_SIZE, ly, lz)];
    return BLOCK_AIR; // Assume air if no neighbor data
  }
  if (lx >= SECTION_SIZE) {
    if (neighbors.px) return neighbors.px[localIndex(lx - SECTION_SIZE, ly, lz)];
    return BLOCK_AIR;
  }
  if (ly < 0) {
    if (neighbors.ny) return neighbors.ny[localIndex(lx, ly + SECTION_SIZE, lz)];
    return BLOCK_AIR;
  }
  if (ly >= SECTION_SIZE) {
    if (neighbors.py) return neighbors.py[localIndex(lx, ly - SECTION_SIZE, lz)];
    return BLOCK_AIR;
  }
  if (lz < 0) {
    if (neighbors.nz) return neighbors.nz[localIndex(lx, ly, lz + SECTION_SIZE)];
    return BLOCK_AIR;
  }
  if (lz >= SECTION_SIZE) {
    if (neighbors.pz) return neighbors.pz[localIndex(lx, ly, lz - SECTION_SIZE)];
    return BLOCK_AIR;
  }

  return BLOCK_AIR;
}

function isTransparent(blockId: number): boolean {
  if (blockId === BLOCK_AIR) return true;
  const block = BLOCKS[blockId];
  return !block || !block.solid;
}

function getUV(tileIndex: number): { u0: number; v0: number; u1: number; v1: number } {
  const col = tileIndex % ATLAS_SIZE;
  const row = Math.floor(tileIndex / ATLAS_SIZE);
  return {
    u0: col * TILE_UV,
    v0: 1 - (row + 1) * TILE_UV,
    u1: (col + 1) * TILE_UV,
    v1: 1 - row * TILE_UV
  };
}

function buildMesh(request: MeshRequest) {
  const { sectionId, blocks, neighbors } = request;

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let vertexCount = 0;

  function addFace(
    x: number, y: number, z: number,
    normal: [number, number, number],
    vertices: [number, number, number][],
    tileIndex: number
  ) {
    const { u0, v0, u1, v1 } = getUV(tileIndex);

    // Add 4 vertices for the quad
    for (const [vx, vy, vz] of vertices) {
      positions.push(x + vx, y + vy, z + vz);
      normals.push(normal[0], normal[1], normal[2]);
    }

    // UV coordinates for the quad
    uvs.push(u0, v0); // bottom-left
    uvs.push(u1, v0); // bottom-right
    uvs.push(u1, v1); // top-right
    uvs.push(u0, v1); // top-left

    // Two triangles (CCW winding)
    indices.push(
      vertexCount, vertexCount + 1, vertexCount + 2,
      vertexCount, vertexCount + 2, vertexCount + 3
    );
    vertexCount += 4;
  }

  // Iterate through all blocks
  for (let ly = 0; ly < SECTION_SIZE; ly++) {
    for (let lz = 0; lz < SECTION_SIZE; lz++) {
      for (let lx = 0; lx < SECTION_SIZE; lx++) {
        const blockId = blocks[localIndex(lx, ly, lz)];
        if (blockId === BLOCK_AIR) continue;

        const blockData = BLOCKS[blockId];
        if (!blockData) continue;

        // Check each face
        // +Y face (top)
        if (isTransparent(getBlock(blocks, neighbors, lx, ly + 1, lz))) {
          addFace(lx, ly, lz, [0, 1, 0], [
            [0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]
          ], blockData.top);
        }

        // -Y face (bottom)
        if (isTransparent(getBlock(blocks, neighbors, lx, ly - 1, lz))) {
          addFace(lx, ly, lz, [0, -1, 0], [
            [0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]
          ], blockData.bottom);
        }

        // +X face (east)
        if (isTransparent(getBlock(blocks, neighbors, lx + 1, ly, lz))) {
          addFace(lx, ly, lz, [1, 0, 0], [
            [1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]
          ], blockData.east);
        }

        // -X face (west)
        if (isTransparent(getBlock(blocks, neighbors, lx - 1, ly, lz))) {
          addFace(lx, ly, lz, [-1, 0, 0], [
            [0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]
          ], blockData.west);
        }

        // +Z face (south)
        if (isTransparent(getBlock(blocks, neighbors, lx, ly, lz + 1))) {
          addFace(lx, ly, lz, [0, 0, 1], [
            [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]
          ], blockData.south);
        }

        // -Z face (north)
        if (isTransparent(getBlock(blocks, neighbors, lx, ly, lz - 1))) {
          addFace(lx, ly, lz, [0, 0, -1], [
            [1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]
          ], blockData.north);
        }
      }
    }
  }

  return {
    type: 'MESH_RESULT',
    sectionId,
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    indices: new Uint32Array(indices)
  };
}

// Worker message handler
declare const self: DedicatedWorkerGlobalScope;

self.onmessage = (e: MessageEvent<MeshRequest>) => {
  const request = e.data;

  if (request.type === 'MESH_REQUEST') {
    const result = buildMesh(request);

    self.postMessage(result, [
      result.positions.buffer,
      result.normals.buffer,
      result.uvs.buffer,
      result.indices.buffer
    ]);
  }
};

export {};
