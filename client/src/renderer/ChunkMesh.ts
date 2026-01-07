import * as THREE from 'three';
import { materials } from './Materials';
import { WorkerPool } from '../workers/WorkerPool';
import { World } from '../world/World';
import { eventBus, Events } from '../core/EventBus';
import { parseSectionId, SECTION_SIZE } from '../constants';
import type { MeshResult, SectionData } from '../types';

interface SectionMesh {
  sectionId: string;
  mesh: THREE.Mesh | null;
  geometry: THREE.BufferGeometry | null;
  version: number;
  pending: boolean;
}

export class ChunkMeshManager {
  private scene: THREE.Scene;
  private world: World;
  private workerPool: WorkerPool;
  private sectionMeshes: Map<string, SectionMesh> = new Map();
  private meshGroup: THREE.Group;
  private maxMeshesPerFrame = 50; // Process more meshes per frame
  private meshQueue: string[] = [];
  private processing = false;

  constructor(scene: THREE.Scene, world: World) {
    this.scene = scene;
    this.world = world;
    this.workerPool = new WorkerPool();
    this.meshGroup = new THREE.Group();
    this.meshGroup.name = 'ChunkMeshes';
    this.scene.add(this.meshGroup);

    // Listen for block changes
    eventBus.on(Events.BLOCK_CHANGED, this.onBlockChanged.bind(this));
    eventBus.on(Events.SECTION_LOADED, this.onSectionLoaded.bind(this));
  }

  private onBlockChanged(data: { x: number; y: number; z: number; sectionId: string }): void {
    this.queueMesh(data.sectionId);

    // Also queue neighbor sections if block is on edge
    const { cx, cz, sy } = parseSectionId(data.sectionId);
    const lx = ((data.x % SECTION_SIZE) + SECTION_SIZE) % SECTION_SIZE;
    const ly = ((data.y % SECTION_SIZE) + SECTION_SIZE) % SECTION_SIZE;
    const lz = ((data.z % SECTION_SIZE) + SECTION_SIZE) % SECTION_SIZE;

    if (lx === 0) this.queueMeshIfLoaded(cx - 1, cz, sy);
    if (lx === SECTION_SIZE - 1) this.queueMeshIfLoaded(cx + 1, cz, sy);
    if (ly === 0) this.queueMeshIfLoaded(cx, cz, sy - 1);
    if (ly === SECTION_SIZE - 1) this.queueMeshIfLoaded(cx, cz, sy + 1);
    if (lz === 0) this.queueMeshIfLoaded(cx, cz - 1, sy);
    if (lz === SECTION_SIZE - 1) this.queueMeshIfLoaded(cx, cz + 1, sy);
  }

  private onSectionLoaded(data: { sectionId: string }): void {
    this.queueMesh(data.sectionId);
  }

  private queueMeshIfLoaded(cx: number, cz: number, sy: number): void {
    const section = this.world.getSection(cx, cz, sy);
    if (section) {
      this.queueMesh(section.id);
    }
  }

  queueMesh(sectionId: string): void {
    if (!this.meshQueue.includes(sectionId)) {
      this.meshQueue.push(sectionId);
    }
  }

  async update(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    let meshesBuilt = 0;
    const startTime = performance.now();
    const maxTime = 16; // 16ms budget per frame (one full frame)

    while (this.meshQueue.length > 0 && meshesBuilt < this.maxMeshesPerFrame) {
      if (performance.now() - startTime > maxTime) break;

      const sectionId = this.meshQueue.shift()!;
      const section = this.world.getSectionById(sectionId);
      if (!section) continue;

      await this.buildMesh(section);
      meshesBuilt++;
    }

    this.processing = false;
  }

  private async buildMesh(section: SectionData): Promise<void> {
    const existing = this.sectionMeshes.get(section.id);

    // Skip if already up to date
    if (existing && existing.version === section.version && !section.dirty) {
      return;
    }

    // Skip if already processing
    if (existing?.pending) {
      return;
    }

    // Mark as pending
    if (existing) {
      existing.pending = true;
    } else {
      this.sectionMeshes.set(section.id, {
        sectionId: section.id,
        mesh: null,
        geometry: null,
        version: -1,
        pending: true
      });
    }

    try {
      // Get neighbor data for proper face culling at section boundaries
      const neighbors = this.world.getNeighborBlocks(section as any);

      // Request mesh from worker
      const result = await this.workerPool.requestMesh(
        section.id,
        section.blocks,
        neighbors,
        0 // Priority - could be based on distance from player
      );

      // Create Three.js geometry from result
      this.applyMeshResult(section.id, result, section.version);

      // Mark section as clean
      section.dirty = false;
    } catch (error) {
      if ((error as Error).message !== 'Job cancelled') {
        console.error('[ChunkMesh] Build error:', error);
      }
    }

    // Clear pending flag
    const entry = this.sectionMeshes.get(section.id);
    if (entry) {
      entry.pending = false;
    }
  }

  private applyMeshResult(sectionId: string, result: MeshResult, version: number): void {
    let entry = this.sectionMeshes.get(sectionId);

    // Dispose old geometry
    if (entry?.geometry) {
      entry.geometry.dispose();
    }
    if (entry?.mesh) {
      this.meshGroup.remove(entry.mesh);
    }

    // Skip empty meshes
    if (result.indices.length === 0) {
      if (entry) {
        entry.mesh = null;
        entry.geometry = null;
        entry.version = version;
      }
      return;
    }

    // Create new geometry
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(result.positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(result.normals, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(result.uvs, 2));
    geometry.setIndex(new THREE.BufferAttribute(result.indices, 1));
    geometry.computeBoundingSphere();

    // Create mesh
    const mesh = new THREE.Mesh(geometry, materials.getOpaqueMaterial());
    mesh.name = `section_${sectionId}`;

    // Position mesh in world space
    const { cx, cz, sy } = parseSectionId(sectionId);
    const worldX = cx * SECTION_SIZE;
    const worldY = sy * SECTION_SIZE;
    const worldZ = cz * SECTION_SIZE;
    mesh.position.set(worldX, worldY, worldZ);

    // Add to scene
    this.meshGroup.add(mesh);

    // Update entry
    if (!entry) {
      entry = {
        sectionId,
        mesh: null,
        geometry: null,
        version: -1,
        pending: false
      };
      this.sectionMeshes.set(sectionId, entry);
    }

    entry.mesh = mesh;
    entry.geometry = geometry;
    entry.version = version;
  }

  unloadSection(sectionId: string): void {
    const entry = this.sectionMeshes.get(sectionId);
    if (entry) {
      if (entry.mesh) {
        this.meshGroup.remove(entry.mesh);
      }
      if (entry.geometry) {
        entry.geometry.dispose();
      }
      this.sectionMeshes.delete(sectionId);
    }

    // Remove from queue
    const queueIndex = this.meshQueue.indexOf(sectionId);
    if (queueIndex !== -1) {
      this.meshQueue.splice(queueIndex, 1);
    }

    // Cancel pending worker job
    this.workerPool.cancelJob(sectionId);
  }

  getMeshCount(): number {
    return this.sectionMeshes.size;
  }

  getQueueLength(): number {
    return this.meshQueue.length;
  }

  dispose(): void {
    // Remove all meshes
    for (const [, entry] of this.sectionMeshes) {
      if (entry.mesh) {
        this.meshGroup.remove(entry.mesh);
      }
      if (entry.geometry) {
        entry.geometry.dispose();
      }
    }
    this.sectionMeshes.clear();
    this.meshQueue = [];

    // Remove group from scene
    this.scene.remove(this.meshGroup);

    // Dispose worker pool
    this.workerPool.dispose();
  }
}
