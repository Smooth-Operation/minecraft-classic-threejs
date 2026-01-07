import * as THREE from 'three';

const ATLAS_SIZE = 16; // 16x16 tiles
const TILE_SIZE = 16; // 16 pixels per tile
const TEXTURE_SIZE = ATLAS_SIZE * TILE_SIZE; // 256x256

// Simple seeded random for reproducible textures
class SeededRandom {
  private seed: number;
  constructor(seed: number) {
    this.seed = seed;
  }
  next(): number {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }
  nextInt(max: number): number {
    return Math.floor(this.next() * max);
  }
}

class MaterialsManager {
  private atlasTexture: THREE.Texture | null = null;
  private opaqueMaterial: THREE.MeshLambertMaterial | null = null;
  private cutoutMaterial: THREE.MeshLambertMaterial | null = null;
  private loaded = false;
  private loadPromise: Promise<void> | null = null;

  async load(): Promise<void> {
    if (this.loaded) return;
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = this.doLoad();
    return this.loadPromise;
  }

  private async doLoad(): Promise<void> {
    // Always generate procedural - no external textures needed
    this.atlasTexture = this.generateProceduralAtlas();

    // Configure texture for pixel art
    this.atlasTexture.magFilter = THREE.NearestFilter;
    this.atlasTexture.minFilter = THREE.NearestFilter;
    this.atlasTexture.colorSpace = THREE.SRGBColorSpace;
    this.atlasTexture.generateMipmaps = false;

    // Create materials
    this.opaqueMaterial = new THREE.MeshLambertMaterial({
      map: this.atlasTexture,
      side: THREE.FrontSide
    });

    this.cutoutMaterial = new THREE.MeshLambertMaterial({
      map: this.atlasTexture,
      side: THREE.DoubleSide,
      alphaTest: 0.5,
      transparent: false
    });

    this.loaded = true;
    console.log('[Materials] Procedural atlas generated');
  }

  private generateProceduralAtlas(): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = TEXTURE_SIZE;
    canvas.height = TEXTURE_SIZE;
    const ctx = canvas.getContext('2d')!;

    // Fill with magenta (missing texture indicator)
    ctx.fillStyle = '#FF00FF';
    ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);

    // Generate each tile
    this.drawTile(ctx, 0, this.generateGrassTop.bind(this));      // Grass top
    this.drawTile(ctx, 1, this.generateStone.bind(this));         // Stone
    this.drawTile(ctx, 2, this.generateDirt.bind(this));          // Dirt
    this.drawTile(ctx, 3, this.generateGrassSide.bind(this));     // Grass side
    this.drawTile(ctx, 4, this.generatePlanks.bind(this));        // Wood planks
    this.drawTile(ctx, 7, this.generateBrick.bind(this));         // Brick
    this.drawTile(ctx, 16, this.generateCobblestone.bind(this));  // Cobblestone
    this.drawTile(ctx, 17, this.generateBedrock.bind(this));      // Bedrock
    this.drawTile(ctx, 18, this.generateSand.bind(this));         // Sand
    this.drawTile(ctx, 19, this.generateGravel.bind(this));       // Gravel
    this.drawTile(ctx, 20, this.generateLogSide.bind(this));      // Log side
    this.drawTile(ctx, 21, this.generateLogTop.bind(this));       // Log top
    this.drawTile(ctx, 22, this.generateIronBlock.bind(this));    // Iron block
    this.drawTile(ctx, 23, this.generateGoldBlock.bind(this));    // Gold block
    this.drawTile(ctx, 52, this.generateLeaves.bind(this));       // Leaves

    const texture = new THREE.CanvasTexture(canvas);
    return texture;
  }

  private drawTile(ctx: CanvasRenderingContext2D, index: number, generator: () => ImageData): void {
    const col = index % ATLAS_SIZE;
    const row = Math.floor(index / ATLAS_SIZE);
    const x = col * TILE_SIZE;
    const y = row * TILE_SIZE;
    const imageData = generator();
    ctx.putImageData(imageData, x, y);
  }

  private createImageData(): ImageData {
    return new ImageData(TILE_SIZE, TILE_SIZE);
  }

  private setPixel(data: Uint8ClampedArray, x: number, y: number, r: number, g: number, b: number): void {
    const i = (y * TILE_SIZE + x) * 4;
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  }

  private generateGrassTop(): ImageData {
    const img = this.createImageData();
    const rng = new SeededRandom(1);

    for (let y = 0; y < TILE_SIZE; y++) {
      for (let x = 0; x < TILE_SIZE; x++) {
        const variation = rng.nextInt(30) - 15;
        const r = 100 + variation;
        const g = 180 + rng.nextInt(40);
        const b = 60 + variation;
        this.setPixel(img.data, x, y, r, g, b);
      }
    }
    return img;
  }

  private generateStone(): ImageData {
    const img = this.createImageData();
    const rng = new SeededRandom(2);

    // Base stone color
    for (let y = 0; y < TILE_SIZE; y++) {
      for (let x = 0; x < TILE_SIZE; x++) {
        const base = 128 + rng.nextInt(20) - 10;
        this.setPixel(img.data, x, y, base, base, base);
      }
    }

    // Add darker cracks/spots
    for (let i = 0; i < 20; i++) {
      const cx = rng.nextInt(TILE_SIZE);
      const cy = rng.nextInt(TILE_SIZE);
      const shade = 90 + rng.nextInt(30);
      this.setPixel(img.data, cx, cy, shade, shade, shade);
    }

    return img;
  }

  private generateDirt(): ImageData {
    const img = this.createImageData();
    const rng = new SeededRandom(3);

    for (let y = 0; y < TILE_SIZE; y++) {
      for (let x = 0; x < TILE_SIZE; x++) {
        const variation = rng.nextInt(30) - 15;
        const r = 134 + variation;
        const g = 96 + variation;
        const b = 67 + variation;
        this.setPixel(img.data, x, y, r, g, b);
      }
    }

    // Add some darker clumps
    for (let i = 0; i < 15; i++) {
      const cx = rng.nextInt(TILE_SIZE);
      const cy = rng.nextInt(TILE_SIZE);
      this.setPixel(img.data, cx, cy, 100, 70, 50);
    }

    return img;
  }

  private generateGrassSide(): ImageData {
    const img = this.createImageData();
    const rng = new SeededRandom(4);

    // Dirt base
    for (let y = 0; y < TILE_SIZE; y++) {
      for (let x = 0; x < TILE_SIZE; x++) {
        const variation = rng.nextInt(20) - 10;
        const r = 134 + variation;
        const g = 96 + variation;
        const b = 67 + variation;
        this.setPixel(img.data, x, y, r, g, b);
      }
    }

    // Green grass top with jagged edge
    for (let x = 0; x < TILE_SIZE; x++) {
      const grassHeight = 3 + rng.nextInt(3);
      for (let y = 0; y < grassHeight; y++) {
        const variation = rng.nextInt(30) - 15;
        const r = 100 + variation;
        const g = 180 + rng.nextInt(30);
        const b = 60 + variation;
        this.setPixel(img.data, x, y, r, g, b);
      }
    }

    return img;
  }

  private generatePlanks(): ImageData {
    const img = this.createImageData();
    const rng = new SeededRandom(5);

    // Wood plank pattern - 4 horizontal planks
    const plankHeight = 4;
    for (let y = 0; y < TILE_SIZE; y++) {
      const plankIndex = Math.floor(y / plankHeight);
      const isGap = y % plankHeight === plankHeight - 1;

      for (let x = 0; x < TILE_SIZE; x++) {
        if (isGap) {
          // Dark gap between planks
          this.setPixel(img.data, x, y, 100, 70, 40);
        } else {
          // Wood grain
          const variation = rng.nextInt(20) - 10;
          const grainOffset = (plankIndex * 3 + x) % 8 < 4 ? 10 : 0;
          const r = 180 + variation + grainOffset;
          const g = 140 + variation + grainOffset;
          const b = 90 + variation;
          this.setPixel(img.data, x, y, r, g, b);
        }
      }
    }

    return img;
  }

  private generateBrick(): ImageData {
    const img = this.createImageData();
    const rng = new SeededRandom(6);

    const brickHeight = 4;
    const brickWidth = 8;

    for (let y = 0; y < TILE_SIZE; y++) {
      const row = Math.floor(y / brickHeight);
      const yInBrick = y % brickHeight;
      const offset = (row % 2) * (brickWidth / 2);

      for (let x = 0; x < TILE_SIZE; x++) {
        const xOffset = (x + offset) % brickWidth;
        const isMortar = yInBrick === brickHeight - 1 || xOffset === brickWidth - 1;

        if (isMortar) {
          // Mortar - gray
          const shade = 160 + rng.nextInt(20);
          this.setPixel(img.data, x, y, shade, shade, shade - 10);
        } else {
          // Brick - red/brown
          const variation = rng.nextInt(30) - 15;
          this.setPixel(img.data, x, y, 160 + variation, 80 + variation, 60 + variation);
        }
      }
    }

    return img;
  }

  private generateCobblestone(): ImageData {
    const img = this.createImageData();
    const rng = new SeededRandom(7);

    // Base gray
    for (let y = 0; y < TILE_SIZE; y++) {
      for (let x = 0; x < TILE_SIZE; x++) {
        const base = 110 + rng.nextInt(30);
        this.setPixel(img.data, x, y, base, base, base);
      }
    }

    // Add irregular stone shapes with different shades
    for (let i = 0; i < 8; i++) {
      const cx = rng.nextInt(TILE_SIZE);
      const cy = rng.nextInt(TILE_SIZE);
      const size = 2 + rng.nextInt(3);
      const shade = 80 + rng.nextInt(60);

      for (let dy = 0; dy < size; dy++) {
        for (let dx = 0; dx < size; dx++) {
          const px = (cx + dx) % TILE_SIZE;
          const py = (cy + dy) % TILE_SIZE;
          this.setPixel(img.data, px, py, shade, shade, shade);
        }
      }
    }

    return img;
  }

  private generateBedrock(): ImageData {
    const img = this.createImageData();
    const rng = new SeededRandom(8);

    for (let y = 0; y < TILE_SIZE; y++) {
      for (let x = 0; x < TILE_SIZE; x++) {
        const base = 40 + rng.nextInt(40);
        this.setPixel(img.data, x, y, base, base, base);
      }
    }

    return img;
  }

  private generateSand(): ImageData {
    const img = this.createImageData();
    const rng = new SeededRandom(9);

    for (let y = 0; y < TILE_SIZE; y++) {
      for (let x = 0; x < TILE_SIZE; x++) {
        const variation = rng.nextInt(25) - 12;
        const r = 220 + variation;
        const g = 200 + variation;
        const b = 150 + variation;
        this.setPixel(img.data, x, y, r, g, b);
      }
    }

    // Add some darker grains
    for (let i = 0; i < 25; i++) {
      const x = rng.nextInt(TILE_SIZE);
      const y = rng.nextInt(TILE_SIZE);
      this.setPixel(img.data, x, y, 200, 180, 130);
    }

    return img;
  }

  private generateGravel(): ImageData {
    const img = this.createImageData();
    const rng = new SeededRandom(10);

    // Mix of different gray pebbles
    for (let y = 0; y < TILE_SIZE; y++) {
      for (let x = 0; x < TILE_SIZE; x++) {
        const pebbleType = rng.nextInt(3);
        let shade: number;
        if (pebbleType === 0) shade = 100 + rng.nextInt(20);
        else if (pebbleType === 1) shade = 140 + rng.nextInt(20);
        else shade = 170 + rng.nextInt(20);
        this.setPixel(img.data, x, y, shade, shade, shade);
      }
    }

    return img;
  }

  private generateLogSide(): ImageData {
    const img = this.createImageData();
    const rng = new SeededRandom(11);

    for (let y = 0; y < TILE_SIZE; y++) {
      for (let x = 0; x < TILE_SIZE; x++) {
        // Vertical bark lines
        const linePhase = (x + rng.nextInt(2)) % 4;
        const isLine = linePhase === 0;

        if (isLine) {
          this.setPixel(img.data, x, y, 60, 40, 25);
        } else {
          const variation = rng.nextInt(15);
          this.setPixel(img.data, x, y, 100 + variation, 75 + variation, 50 + variation);
        }
      }
    }

    return img;
  }

  private generateLogTop(): ImageData {
    const img = this.createImageData();
    const rng = new SeededRandom(12);

    const cx = TILE_SIZE / 2;
    const cy = TILE_SIZE / 2;

    for (let y = 0; y < TILE_SIZE; y++) {
      for (let x = 0; x < TILE_SIZE; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 6) {
          // Bark (outer ring)
          const variation = rng.nextInt(15);
          this.setPixel(img.data, x, y, 100 + variation, 75 + variation, 50 + variation);
        } else {
          // Inner wood with rings
          const ringPhase = Math.floor(dist * 1.5) % 2;
          const variation = rng.nextInt(10);
          if (ringPhase === 0) {
            this.setPixel(img.data, x, y, 180 + variation, 150 + variation, 100 + variation);
          } else {
            this.setPixel(img.data, x, y, 160 + variation, 130 + variation, 80 + variation);
          }
        }
      }
    }

    return img;
  }

  private generateIronBlock(): ImageData {
    const img = this.createImageData();
    const rng = new SeededRandom(13);

    for (let y = 0; y < TILE_SIZE; y++) {
      for (let x = 0; x < TILE_SIZE; x++) {
        const variation = rng.nextInt(20) - 10;
        const base = 200 + variation;
        this.setPixel(img.data, x, y, base, base, base + 5);
      }
    }

    // Add metallic highlights
    for (let i = 0; i < 10; i++) {
      const x = rng.nextInt(TILE_SIZE);
      const y = rng.nextInt(TILE_SIZE);
      this.setPixel(img.data, x, y, 230, 235, 240);
    }

    // Add border indent
    for (let i = 0; i < TILE_SIZE; i++) {
      this.setPixel(img.data, i, 0, 170, 170, 175);
      this.setPixel(img.data, i, TILE_SIZE - 1, 220, 220, 225);
      this.setPixel(img.data, 0, i, 170, 170, 175);
      this.setPixel(img.data, TILE_SIZE - 1, i, 220, 220, 225);
    }

    return img;
  }

  private generateGoldBlock(): ImageData {
    const img = this.createImageData();
    const rng = new SeededRandom(14);

    for (let y = 0; y < TILE_SIZE; y++) {
      for (let x = 0; x < TILE_SIZE; x++) {
        const variation = rng.nextInt(30) - 15;
        this.setPixel(img.data, x, y, 250 + variation, 200 + variation, 50 + variation);
      }
    }

    // Add shiny highlights
    for (let i = 0; i < 8; i++) {
      const x = rng.nextInt(TILE_SIZE);
      const y = rng.nextInt(TILE_SIZE);
      this.setPixel(img.data, x, y, 255, 240, 100);
    }

    // Add border indent
    for (let i = 0; i < TILE_SIZE; i++) {
      this.setPixel(img.data, i, 0, 180, 140, 30);
      this.setPixel(img.data, i, TILE_SIZE - 1, 255, 220, 80);
      this.setPixel(img.data, 0, i, 180, 140, 30);
      this.setPixel(img.data, TILE_SIZE - 1, i, 255, 220, 80);
    }

    return img;
  }

  private generateLeaves(): ImageData {
    const img = this.createImageData();
    const rng = new SeededRandom(15);

    for (let y = 0; y < TILE_SIZE; y++) {
      for (let x = 0; x < TILE_SIZE; x++) {
        // Create leafy pattern with gaps
        const noise = rng.next();

        if (noise > 0.2) {
          // Leaf pixel - various greens
          const variation = rng.nextInt(40) - 20;
          const r = 50 + variation;
          const g = 140 + rng.nextInt(50);
          const b = 30 + variation;
          this.setPixel(img.data, x, y, r, g, b);
        } else {
          // Darker gap/shadow
          const variation = rng.nextInt(20);
          this.setPixel(img.data, x, y, 30 + variation, 80 + variation, 20 + variation);
        }
      }
    }

    // Add some highlights
    for (let i = 0; i < 15; i++) {
      const x = rng.nextInt(TILE_SIZE);
      const y = rng.nextInt(TILE_SIZE);
      this.setPixel(img.data, x, y, 80, 200, 60);
    }

    return img;
  }

  getOpaqueMaterial(): THREE.MeshLambertMaterial {
    if (!this.opaqueMaterial) {
      throw new Error('Materials not loaded. Call load() first.');
    }
    return this.opaqueMaterial;
  }

  getCutoutMaterial(): THREE.MeshLambertMaterial {
    if (!this.cutoutMaterial) {
      throw new Error('Materials not loaded. Call load() first.');
    }
    return this.cutoutMaterial;
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  dispose(): void {
    this.atlasTexture?.dispose();
    this.opaqueMaterial?.dispose();
    this.cutoutMaterial?.dispose();
    this.atlasTexture = null;
    this.opaqueMaterial = null;
    this.cutoutMaterial = null;
    this.loaded = false;
    this.loadPromise = null;
  }
}

export const materials = new MaterialsManager();
