import * as THREE from 'three';

export class BlockHighlight {
  private mesh: THREE.LineSegments;
  private visible = false;

  constructor(scene: THREE.Scene) {
    // Create wireframe box geometry (slightly larger than 1x1x1)
    const size = 1.002;
    const geometry = new THREE.BoxGeometry(size, size, size);
    const edges = new THREE.EdgesGeometry(geometry);

    const material = new THREE.LineBasicMaterial({
      color: 0x000000,
      linewidth: 2,
      transparent: true,
      opacity: 0.8
    });

    this.mesh = new THREE.LineSegments(edges, material);
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  setPosition(x: number, y: number, z: number): void {
    // Position at block center
    this.mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
    this.visible = true;
    this.mesh.visible = true;
  }

  hide(): void {
    this.visible = false;
    this.mesh.visible = false;
  }

  isVisible(): boolean {
    return this.visible;
  }

  getPosition(): THREE.Vector3 {
    return new THREE.Vector3(
      Math.floor(this.mesh.position.x),
      Math.floor(this.mesh.position.y),
      Math.floor(this.mesh.position.z)
    );
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
