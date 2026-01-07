import * as THREE from 'three';
import { MOBILE_VIEW_DISTANCE, DESKTOP_VIEW_DISTANCE, SECTION_SIZE } from '../constants';

export class Renderer {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private isMobile: boolean;
  private viewDistance: number;

  constructor(container: HTMLElement) {
    this.container = container;
    this.isMobile = this.detectMobile();
    this.viewDistance = this.isMobile ? MOBILE_VIEW_DISTANCE : DESKTOP_VIEW_DISTANCE;

    // Create renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isMobile,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(this.isMobile ? Math.min(window.devicePixelRatio, 2) : window.devicePixelRatio);
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setClearColor(0x87CEEB); // Sky blue
    container.appendChild(this.renderer.domElement);

    // Create scene
    this.scene = new THREE.Scene();
    // Add fog for depth and to hide chunk loading
    this.scene.fog = new THREE.Fog(0x87CEEB, 50, 200);

    // Create camera
    const aspect = container.clientWidth / container.clientHeight;
    const fov = this.isMobile ? 75 : 70;
    const far = 1000; // Large far plane for debugging
    this.camera = new THREE.PerspectiveCamera(fov, aspect, 0.1, far);
    // Position camera above and behind spawn, looking toward center
    this.camera.position.set(512, 20, 470);
    this.camera.lookAt(512, 5, 512);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(100, 200, 50);
    this.scene.add(directionalLight);

    // Handle resize
    window.addEventListener('resize', this.onResize);

    // Debug: Add axes helper and reference geometry
    if (import.meta.env.DEV) {
      const axes = new THREE.AxesHelper(20);
      axes.position.set(512, 5, 512);
      this.scene.add(axes);

      // Add a red box at spawn point for reference
      const debugBox = new THREE.Mesh(
        new THREE.BoxGeometry(2, 2, 2),
        new THREE.MeshBasicMaterial({ color: 0xff0000 })
      );
      debugBox.position.set(512, 6, 512);
      this.scene.add(debugBox);

      // Add a grid helper at ground level
      const gridHelper = new THREE.GridHelper(64, 64);
      gridHelper.position.set(512, 5, 512);
      this.scene.add(gridHelper);

      console.log('[Renderer] Camera position:', this.camera.position);
      console.log('[Renderer] Camera looking at: (512, 0, 512)');
    }
  }

  private detectMobile(): boolean {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
           ('ontouchstart' in window) ||
           (window.innerWidth < 768);
  }

  private onResize = (): void => {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  getScene(): THREE.Scene {
    return this.scene;
  }

  getCamera(): THREE.PerspectiveCamera {
    return this.camera;
  }

  getThreeRenderer(): THREE.WebGLRenderer {
    return this.renderer;
  }

  getDomElement(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  isMobileDevice(): boolean {
    return this.isMobile;
  }

  getViewDistance(): number {
    return this.viewDistance;
  }

  setViewDistance(chunks: number): void {
    this.viewDistance = chunks;
    this.camera.far = (chunks + 2) * SECTION_SIZE;
    this.camera.updateProjectionMatrix();
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.far = chunks * SECTION_SIZE;
    }
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    this.renderer.dispose();
    this.container.removeChild(this.renderer.domElement);
  }
}
