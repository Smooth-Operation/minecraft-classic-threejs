import * as THREE from 'three';
import { InputManager } from '../input/InputManager';
import { World } from '../world/World';
import { GRAVITY, JUMP_VELOCITY, WALK_SPEED } from '../constants';

export class PlayerController {
  private camera: THREE.PerspectiveCamera;
  private inputManager: InputManager;
  private world: World;

  // Position and rotation
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  yaw = 0; // Horizontal rotation (radians)
  pitch = 0; // Vertical rotation (radians)

  // Physics
  private onGround = false;
  private playerHeight = 1.8;
  private playerWidth = 0.6;
  private eyeHeight = 1.62;

  // Settings
  private moveSpeed = WALK_SPEED;
  private jumpVelocity = JUMP_VELOCITY;
  private gravity = GRAVITY;

  constructor(
    camera: THREE.PerspectiveCamera,
    inputManager: InputManager,
    world: World,
    spawnPosition: THREE.Vector3
  ) {
    this.camera = camera;
    this.inputManager = inputManager;
    this.world = world;
    this.position = spawnPosition.clone();
    this.velocity = new THREE.Vector3();

    // Set initial camera position
    this.updateCamera();
  }

  update(dt: number): void {
    // Get input
    const input = this.inputManager.getState();
    const look = this.inputManager.getLookDelta();

    // Apply look rotation
    this.yaw += look.dx;
    this.pitch -= look.dy; // Negate: mouse down = look down
    this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch));

    // Calculate movement direction
    const moveDir = new THREE.Vector3();

    if (input.forward) moveDir.z -= 1;
    if (input.backward) moveDir.z += 1;
    if (input.left) moveDir.x -= 1;
    if (input.right) moveDir.x += 1;

    // Rotate movement by yaw
    if (moveDir.lengthSq() > 0) {
      moveDir.normalize();
      const cos = Math.cos(this.yaw);
      const sin = Math.sin(this.yaw);
      const newX = moveDir.x * cos - moveDir.z * sin;
      const newZ = moveDir.x * sin + moveDir.z * cos;
      moveDir.x = newX;
      moveDir.z = newZ;
    }

    // Apply horizontal movement
    const speed = input.sneak ? this.moveSpeed * 0.3 : this.moveSpeed;
    this.velocity.x = moveDir.x * speed;
    this.velocity.z = moveDir.z * speed;

    // Apply gravity
    this.velocity.y -= this.gravity * dt;

    // Jump
    if (input.jump && this.onGround) {
      this.velocity.y = this.jumpVelocity;
      this.onGround = false;
    }

    // Move with collision
    this.moveWithCollision(dt);

    // Update camera
    this.updateCamera();
  }

  private moveWithCollision(dt: number): void {
    const movement = this.velocity.clone().multiplyScalar(dt);

    // Move on each axis separately for better collision
    // X axis
    this.position.x += movement.x;
    if (this.checkCollision()) {
      this.position.x -= movement.x;
      this.velocity.x = 0;
    }

    // Y axis
    this.position.y += movement.y;
    if (this.checkCollision()) {
      this.position.y -= movement.y;
      if (this.velocity.y < 0) {
        this.onGround = true;
      }
      this.velocity.y = 0;
    } else {
      this.onGround = false;
    }

    // Z axis
    this.position.z += movement.z;
    if (this.checkCollision()) {
      this.position.z -= movement.z;
      this.velocity.z = 0;
    }
  }

  private checkCollision(): boolean {
    // Simple AABB collision check against world
    const halfWidth = this.playerWidth / 2;
    const minX = Math.floor(this.position.x - halfWidth);
    const maxX = Math.floor(this.position.x + halfWidth);
    const minY = Math.floor(this.position.y);
    const maxY = Math.floor(this.position.y + this.playerHeight);
    const minZ = Math.floor(this.position.z - halfWidth);
    const maxZ = Math.floor(this.position.z + halfWidth);

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          if (this.world.isSolid(x, y, z)) {
            return true;
          }
        }
      }
    }

    return false;
  }

  private updateCamera(): void {
    // Position camera at eye level
    this.camera.position.set(
      this.position.x,
      this.position.y + this.eyeHeight,
      this.position.z
    );

    // Calculate look direction
    const lookDir = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch)
    );

    // Look at point in front of camera
    const lookAt = this.camera.position.clone().add(lookDir);
    this.camera.lookAt(lookAt);
  }

  setPosition(x: number, y: number, z: number): void {
    this.position.set(x, y, z);
    this.updateCamera();
  }

  getPosition(): THREE.Vector3 {
    return this.position.clone();
  }

  getEyePosition(): THREE.Vector3 {
    return new THREE.Vector3(
      this.position.x,
      this.position.y + this.eyeHeight,
      this.position.z
    );
  }

  getLookDirection(): THREE.Vector3 {
    return new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch)
    ).normalize();
  }
}
