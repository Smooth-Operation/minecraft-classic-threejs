import * as THREE from 'three';
import { World } from '../world/World';
import { BlockHighlight } from '../renderer/BlockHighlight';
import { Hotbar } from '../ui/Hotbar';
import { BLOCK_AIR, isInBounds } from '../constants';

interface RaycastResult {
  hit: boolean;
  blockPos: THREE.Vector3 | null;
  faceNormal: THREE.Vector3 | null;
}

export class BlockInteraction {
  private world: World;
  private highlight: BlockHighlight;
  private hotbar: Hotbar;
  private camera: THREE.Camera;

  private maxReach = 5;
  private breakCooldown = 0;
  private placeCooldown = 0;
  private cooldownTime = 0.2; // 200ms between actions

  // Current target
  private targetBlock: THREE.Vector3 | null = null;
  private targetNormal: THREE.Vector3 | null = null;

  constructor(
    world: World,
    scene: THREE.Scene,
    camera: THREE.Camera
  ) {
    this.world = world;
    this.camera = camera;
    this.highlight = new BlockHighlight(scene);
    this.hotbar = new Hotbar();
  }

  update(dt: number): void {
    // Update cooldowns
    if (this.breakCooldown > 0) this.breakCooldown -= dt;
    if (this.placeCooldown > 0) this.placeCooldown -= dt;

    // Raycast to find targeted block
    this.updateTarget();
  }

  private updateTarget(): void {
    const result = this.raycast();

    if (result.hit && result.blockPos) {
      this.targetBlock = result.blockPos;
      this.targetNormal = result.faceNormal;
      this.highlight.setPosition(result.blockPos.x, result.blockPos.y, result.blockPos.z);
    } else {
      this.targetBlock = null;
      this.targetNormal = null;
      this.highlight.hide();
    }
  }

  private raycast(): RaycastResult {
    // Get ray from camera
    const direction = new THREE.Vector3();
    this.camera.getWorldDirection(direction);
    const origin = this.camera.position.clone();

    // DDA voxel traversal
    const pos = origin.clone();
    const step = new THREE.Vector3(
      direction.x > 0 ? 1 : -1,
      direction.y > 0 ? 1 : -1,
      direction.z > 0 ? 1 : -1
    );

    // Distance to next voxel boundary on each axis
    const tDelta = new THREE.Vector3(
      Math.abs(1 / direction.x),
      Math.abs(1 / direction.y),
      Math.abs(1 / direction.z)
    );

    // Current voxel
    const voxel = new THREE.Vector3(
      Math.floor(pos.x),
      Math.floor(pos.y),
      Math.floor(pos.z)
    );

    // Distance to first boundary
    const tMax = new THREE.Vector3(
      direction.x > 0
        ? (voxel.x + 1 - pos.x) * tDelta.x
        : (pos.x - voxel.x) * tDelta.x,
      direction.y > 0
        ? (voxel.y + 1 - pos.y) * tDelta.y
        : (pos.y - voxel.y) * tDelta.y,
      direction.z > 0
        ? (voxel.z + 1 - pos.z) * tDelta.z
        : (pos.z - voxel.z) * tDelta.z
    );

    let lastNormal = new THREE.Vector3(0, 1, 0);
    let distance = 0;

    while (distance < this.maxReach) {
      // Check current voxel
      if (isInBounds(voxel.x, voxel.y, voxel.z)) {
        const blockId = this.world.getBlock(voxel.x, voxel.y, voxel.z);
        if (blockId !== BLOCK_AIR) {
          return {
            hit: true,
            blockPos: voxel.clone(),
            faceNormal: lastNormal.clone()
          };
        }
      }

      // Step to next voxel
      if (tMax.x < tMax.y && tMax.x < tMax.z) {
        distance = tMax.x;
        tMax.x += tDelta.x;
        voxel.x += step.x;
        lastNormal.set(-step.x, 0, 0);
      } else if (tMax.y < tMax.z) {
        distance = tMax.y;
        tMax.y += tDelta.y;
        voxel.y += step.y;
        lastNormal.set(0, -step.y, 0);
      } else {
        distance = tMax.z;
        tMax.z += tDelta.z;
        voxel.z += step.z;
        lastNormal.set(0, 0, -step.z);
      }
    }

    return { hit: false, blockPos: null, faceNormal: null };
  }

  breakBlock(): { x: number; y: number; z: number } | null {
    if (this.breakCooldown > 0 || !this.targetBlock) return null;

    const { x, y, z } = this.targetBlock;
    if (this.world.setBlock(x, y, z, BLOCK_AIR)) {
      this.breakCooldown = this.cooldownTime;
      console.log(`[Block] Broke block at (${x}, ${y}, ${z})`);
      return { x, y, z };
    }
    return null;
  }

  placeBlock(): { x: number; y: number; z: number; blockId: number } | null {
    if (this.placeCooldown > 0 || !this.targetBlock || !this.targetNormal) return null;

    // Place on adjacent face
    const placePos = this.targetBlock.clone().add(this.targetNormal);

    if (!isInBounds(placePos.x, placePos.y, placePos.z)) return null;

    // Check not placing inside player (simple check)
    const playerPos = this.camera.position;
    const dx = Math.abs(playerPos.x - (placePos.x + 0.5));
    const dy = playerPos.y - placePos.y;
    const dz = Math.abs(playerPos.z - (placePos.z + 0.5));

    // Player hitbox check
    if (dx < 0.8 && dz < 0.8 && dy > -0.1 && dy < 1.9) {
      return null; // Would place inside player
    }

    const blockId = this.hotbar.getSelectedBlockId();
    if (this.world.setBlock(placePos.x, placePos.y, placePos.z, blockId)) {
      this.placeCooldown = this.cooldownTime;
      console.log(`[Block] Placed block ${blockId} at (${placePos.x}, ${placePos.y}, ${placePos.z})`);
      return { x: placePos.x, y: placePos.y, z: placePos.z, blockId };
    }
    return null;
  }

  getTargetBlock(): THREE.Vector3 | null {
    return this.targetBlock;
  }

  getHotbar(): Hotbar {
    return this.hotbar;
  }

  dispose(): void {
    this.highlight.dispose();
    this.hotbar.dispose();
  }
}
