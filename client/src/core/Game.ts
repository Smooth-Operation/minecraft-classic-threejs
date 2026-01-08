import * as THREE from 'three';
import { Renderer } from '../renderer/Renderer';
import { World } from '../world/World';
import { ChunkMeshManager } from '../renderer/ChunkMesh';
import { materials } from '../renderer/Materials';
import { InputManager } from '../input/InputManager';
import { KeyboardMouseInput } from '../input/KeyboardMouse';
import { TouchControls } from '../input/TouchControls';
import { PlayerController } from '../player/PlayerController';
import { BlockInteraction } from '../player/BlockInteraction';
import { terrainGenerator } from '../world/TerrainGenerator';
import { Crosshair } from '../ui/Crosshair';
import { LoginScreen, SimpleSession } from '../ui/LoginScreen';
import { NetworkManager } from '../network/NetworkManager';
import { eventBus, Events } from './EventBus';
import type { GameState, Vec3, PlayerState } from '../types';

export class Game {
  private renderer: Renderer;
  private world: World;
  private chunkMeshManager: ChunkMeshManager | null = null;
  private inputManager: InputManager;
  private playerController: PlayerController | null = null;
  private blockInteraction: BlockInteraction | null = null;
  private crosshair: Crosshair | null = null;
  private state: GameState = 'boot';
  private lastTime = 0;
  private running = false;
  private initialized = false;
  private viewRadius: number;
  private isMobile: boolean;

  // Networking & Auth
  private loginScreen: LoginScreen | null = null;
  private networkManager: NetworkManager | null = null;
  private session: SimpleSession | null = null;
  private playerId: string | null = null;
  private displayName: string | null = null;
  private otherPlayers: Map<string, THREE.Mesh> = new Map();
  private isOnlineMode = true; // false = single player mode

  // Hardcoded server URL for single server setup
  private readonly SERVER_WS_URL = import.meta.env.VITE_WS_URL || 'wss://ws.classic.openworld.lol';
  private readonly WORLD_ID = 'default-world';

  constructor(container: HTMLElement) {
    this.renderer = new Renderer(container);
    this.world = new World();
    this.inputManager = new InputManager();

    // Detect mobile for performance settings
    this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
                    ('ontouchstart' in window) || window.innerWidth < 768;
    this.viewRadius = this.isMobile ? 6 : 10; // Smaller radius on mobile

    // Initialize network manager
    this.networkManager = new NetworkManager(eventBus);
    this.setupNetworkEvents();

    this.setState('boot');
  }

  setState(state: GameState): void {
    const prevState = this.state;
    this.state = state;
    eventBus.emit(Events.STATE_CHANGE, { from: prevState, to: state });
    console.log(`[Game] State: ${prevState} → ${state}`);
  }

  getState(): GameState {
    return this.state;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log('[Game] Initializing...');

    // Load materials
    await materials.load();

    // Create chunk mesh manager
    this.chunkMeshManager = new ChunkMeshManager(
      this.renderer.getScene(),
      this.world
    );

    // Setup input - keyboard/mouse for desktop
    const keyboardMouse = new KeyboardMouseInput(this.renderer.getDomElement());
    this.inputManager.addProvider(keyboardMouse);

    // Touch controls for mobile
    const touchControls = new TouchControls(this.renderer.getDomElement());
    this.inputManager.addProvider(touchControls);

    // Create player controller with spawn on terrain
    const spawnX = 512;
    const spawnZ = 512;
    const spawnY = terrainGenerator.getSpawnHeight(spawnX, spawnZ);
    const spawnPosition = new THREE.Vector3(spawnX, spawnY, spawnZ);
    console.log(`[Game] Spawn position: (${spawnX}, ${spawnY}, ${spawnZ})`);

    this.playerController = new PlayerController(
      this.renderer.getCamera(),
      this.inputManager,
      this.world,
      spawnPosition
    );

    // Create block interaction system
    this.blockInteraction = new BlockInteraction(
      this.world,
      this.renderer.getScene(),
      this.renderer.getCamera()
    );

    // Create crosshair
    this.crosshair = new Crosshair();

    this.initialized = true;
    console.log('[Game] Initialized');
    console.log('[Game] Click to capture mouse, WASD to move, Space to jump');
    console.log('[Game] Left click to break, Right click to place, 1-9 or scroll to select block');
  }

  private showLogin(): void {
    if (!this.loginScreen) {
      this.loginScreen = new LoginScreen();

      // Online mode: connect to server
      this.loginScreen.onSuccess((session: SimpleSession) => {
        this.session = session;
        this.displayName = session.displayName;
        this.isOnlineMode = true;
        this.loginScreen?.hide();
        this.joinWorld();
      });

      // Single player mode: skip server, load locally
      this.loginScreen.onOfflineMode((displayName: string) => {
        this.displayName = displayName;
        this.isOnlineMode = false;
        this.loginScreen?.hide();
        this.startSinglePlayer();
      });
    }
    this.loginScreen.show();
    this.setState('login');
  }

  private joinWorld(): void {
    if (!this.session || !this.networkManager) return;

    this.setState('joining');
    console.log(`[Game] Connecting to ${this.SERVER_WS_URL} for world ${this.WORLD_ID}`);
    this.networkManager.connect(this.SERVER_WS_URL, this.session.access_token, this.WORLD_ID);
  }

  private setupNetworkEvents(): void {
    // Handle WELCOME message - server accepted us
    eventBus.on('welcome', (data: {
      player_id: string;
      spawn_position: Vec3;
      players: PlayerState[];
    }) => {
      console.log('[Game] Welcome received, player_id:', data.player_id);
      this.playerId = data.player_id;

      // Use server's X/Z but calculate Y locally from terrain
      const spawnX = data.spawn_position.x;
      const spawnZ = data.spawn_position.z;
      const spawnY = terrainGenerator.getSpawnHeight(spawnX, spawnZ);

      if (this.playerController) {
        this.playerController.position.set(spawnX, spawnY, spawnZ);
      }

      // Add existing players
      for (const player of data.players) {
        if (player.id !== this.playerId) {
          this.addOtherPlayer(player);
        }
      }

      // Pre-generate terrain locally around spawn (collision needs this immediately)
      const sectionIds = this.world.getSectionsInRadius(spawnX, spawnZ, this.viewRadius);
      for (const id of sectionIds) {
        const [cxStr, czStr, syStr] = id.split(':');
        this.world.getOrCreateSection(parseInt(cxStr), parseInt(czStr), parseInt(syStr));
      }

      // Subscribe to sections from server (will update with any edits)
      this.subscribeToSectionsAround(spawnX, spawnZ);

      // Start loading world
      this.setState('loading');
    });

    // Handle SNAPSHOT - other player positions
    eventBus.on('snapshot', (data: { players: PlayerState[] }) => {
      for (const player of data.players) {
        if (player.id !== this.playerId) {
          this.updateOtherPlayer(player);
        }
      }
    });

    // Handle SECTION_DATA - world chunks from server
    eventBus.on('section_data', (data: {
      section_id: string;
      version: number;
      blocks: string;
      is_baseline: boolean;
    }) => {
      const [cxStr, czStr, syStr] = data.section_id.split(':');
      const cx = parseInt(cxStr);
      const cz = parseInt(czStr);
      const sy = parseInt(syStr);

      const section = this.world.getOrCreateSection(cx, cz, sy);

      if (data.is_baseline) {
        // Baseline section - generate locally with client's terrain generator
        const generatedBlocks = terrainGenerator.generateSection(cx, cz, sy);
        section.blocks.set(generatedBlocks);
      } else {
        // Modified section - use server data (has player edits)
        const binaryStr = atob(data.blocks);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        const blocks = new Uint16Array(bytes.buffer);
        section.blocks.set(blocks);
      }

      section.version = data.version;
      section.dirty = true;
    });

    // Handle BLOCK_EVENT - another player placed/broke a block
    eventBus.on('block_event', (data: {
      x: number;
      y: number;
      z: number;
      block_id: number;
      accepted: boolean;
    }) => {
      if (data.accepted) {
        this.world.setBlock(data.x, data.y, data.z, data.block_id);
      }
    });

    // Handle errors
    eventBus.on('error', (data: { code: string; message: string; fatal: boolean }) => {
      console.error('[Game] Server error:', data.code, data.message);
      if (data.fatal) {
        this.setState('disconnected');
      }
    });

    // Handle disconnection
    eventBus.on(Events.DISCONNECTED, () => {
      console.log('[Game] Disconnected from server');
      if (this.state === 'in_game' || this.state === 'loading') {
        this.setState('disconnected');
      }
    });

    // Handle player join
    eventBus.on('player_join', (data: {
      id: string;
      position: Vec3;
      velocity: Vec3;
      yaw: number;
      pitch: number;
      lastInputSeq: number;
    }) => {
      if (data.id !== this.playerId) {
        this.addOtherPlayer({
          id: data.id,
          position: data.position,
          velocity: data.velocity,
          yaw: data.yaw,
          pitch: data.pitch,
          lastInputSeq: data.lastInputSeq,
        });
      }
    });

    // Handle player leave
    eventBus.on('player_leave', (data: { player_id: string }) => {
      this.removeOtherPlayer(data.player_id);
    });
  }

  private subscribeToSectionsAround(x: number, z: number): void {
    const sectionIds = this.world.getSectionsInRadius(x, z, this.viewRadius);
    this.networkManager?.sendSubscribe(sectionIds);
  }

  private addOtherPlayer(player: PlayerState): void {
    const geometry = new THREE.BoxGeometry(0.6, 1.8, 0.6);
    const material = new THREE.MeshLambertMaterial({ color: 0x00ff00 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(player.position.x, player.position.y + 0.9, player.position.z);
    this.renderer.getScene().add(mesh);
    this.otherPlayers.set(player.id, mesh);
  }

  private updateOtherPlayer(player: PlayerState): void {
    let mesh = this.otherPlayers.get(player.id);
    if (!mesh) {
      this.addOtherPlayer(player);
      mesh = this.otherPlayers.get(player.id);
    }
    if (mesh) {
      mesh.position.set(player.position.x, player.position.y + 0.9, player.position.z);
    }
  }

  private removeOtherPlayer(playerId: string): void {
    const mesh = this.otherPlayers.get(playerId);
    if (mesh) {
      this.renderer.getScene().remove(mesh);
      mesh.geometry.dispose();
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach(m => m.dispose());
      } else {
        mesh.material.dispose();
      }
      this.otherPlayers.delete(playerId);
      console.log(`[Game] Removed player ${playerId}`);
    }
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.loop();
  }

  stop(): void {
    this.running = false;
  }

  private loop = async (): Promise<void> => {
    if (!this.running) return;

    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.1); // Cap dt to avoid physics issues
    this.lastTime = now;

    await this.update(dt);
    this.renderer.render();

    requestAnimationFrame(this.loop);
  };

  private async update(dt: number): Promise<void> {
    switch (this.state) {
      case 'boot':
        await this.initialize();
        this.showLogin();
        break;
      case 'login':
        // LoginScreen handles UI, waiting for onSuccess callback
        break;
      case 'world_list':
        // ServerListScreen handles UI, waiting for onJoin callback
        break;
      case 'joining':
        // Waiting for WELCOME message from server
        break;
      case 'loading':
        // Wait for initial sections to mesh
        await this.chunkMeshManager?.update();
        if (this.chunkMeshManager && this.chunkMeshManager.getQueueLength() === 0) {
          this.setState('in_game');
        }
        break;
      case 'in_game':
        this.updateInGame(dt);
        break;
      case 'disconnected':
        // Show login again on disconnect
        this.showLogin();
        break;
    }
  }

  private startSinglePlayer(): void {
    console.log('[Game] Starting single player mode...');
    this.playerId = 'local_player';
    this._loadInitialWorld();
    this.setState('loading');
  }

  // Keep for offline/local mode fallback
  private _loadInitialWorld(): void {
    console.log(`[Game] Loading initial world... (mobile: ${this.isMobile})`);

    // Load sections around spawn (center of world at 512, 512)
    const spawnX = 512;
    const spawnZ = 512;
    const initialRadius = this.isMobile ? 4 : 8; // Smaller initial load on mobile

    console.log(`[Game] Spawn position: (${spawnX}, ${spawnZ}), initial radius: ${initialRadius} chunks`);

    // Get section IDs to load
    const sectionIds = this.world.getSectionsInRadius(spawnX, spawnZ, initialRadius);
    console.log(`[Game] Loading ${sectionIds.length} sections`);

    // Load each section (creates baseline)
    for (const id of sectionIds) {
      const [cxStr, czStr, syStr] = id.split(':');
      const cx = parseInt(cxStr);
      const cz = parseInt(czStr);
      const sy = parseInt(syStr);
      this.world.getOrCreateSection(cx, cz, sy);
    }

    console.log(`[Game] Loaded ${this.world.getLoadedSections().length} sections`);
  }

  private inputSendTimer = 0;
  private readonly INPUT_SEND_RATE = 50; // ms between input sends

  private updateInGame(dt: number): void {
    // Update player controller
    this.playerController?.update(dt);

    // Update block interaction (raycast, highlight)
    this.blockInteraction?.update(dt);

    // Handle block actions from input
    const input = this.inputManager.getState();
    if (input.primaryAction) {
      const broken = this.blockInteraction?.breakBlock();
      if (broken) {
        if (this.isOnlineMode && this.networkManager) {
          // Send block edit to server (block_id 0 = air = break)
          this.networkManager.sendBlockEdit(broken.x, broken.y, broken.z, 0);
        }
        // Single player: block already updated locally by BlockInteraction
      }
    }
    if (input.secondaryAction) {
      const placed = this.blockInteraction?.placeBlock();
      if (placed) {
        if (this.isOnlineMode && this.networkManager) {
          // Send block edit to server
          this.networkManager.sendBlockEdit(placed.x, placed.y, placed.z, placed.blockId);
        }
        // Single player: block already updated locally by BlockInteraction
      }
    }

    // Send input to server at fixed rate (online mode only)
    if (this.isOnlineMode) {
      this.inputSendTimer += dt * 1000;
      if (this.inputSendTimer >= this.INPUT_SEND_RATE && this.playerController && this.networkManager) {
        this.inputSendTimer = 0;
        const pos = this.playerController.position;
        const vel = this.playerController.velocity;
        this.networkManager.sendInput(
          { x: pos.x, y: pos.y, z: pos.z },
          { x: vel.x, y: vel.y, z: vel.z },
          this.playerController.yaw,
          this.playerController.pitch,
          this.getInputBitfield()
        );
      }
    }

    // Load chunks around player as they move
    this.updateChunkLoading();

    // Update mesh queue
    this.chunkMeshManager?.update();
  }

  private getInputBitfield(): number {
    const state = this.inputManager.getState();
    let bits = 0;
    if (state.forward) bits |= 1;
    if (state.backward) bits |= 2;
    if (state.left) bits |= 4;
    if (state.right) bits |= 8;
    if (state.jump) bits |= 16;
    return bits;
  }

  private updateChunkLoading(): void {
    if (!this.playerController) return;

    const pos = this.playerController.position;
    const chunkX = Math.floor(pos.x / 16);
    const chunkZ = Math.floor(pos.z / 16);

    // Load every frame, not just on chunk change - ensures smooth loading
    // Prioritize chunks closer to player and in movement direction
    const velocity = this.playerController.velocity;
    const moveDirX = Math.sign(velocity.x);
    const moveDirZ = Math.sign(velocity.z);

    // Get all sections that should be loaded
    const sectionsToLoad: { id: string; cx: number; cz: number; sy: number; priority: number }[] = [];

    for (let dx = -this.viewRadius; dx <= this.viewRadius; dx++) {
      for (let dz = -this.viewRadius; dz <= this.viewRadius; dz++) {
        const cx = chunkX + dx;
        const cz = chunkZ + dz;

        // Skip out of bounds
        if (cx < 0 || cx >= 64 || cz < 0 || cz >= 64) continue;

        // Circular check
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > this.viewRadius) continue;

        // Priority: closer = higher priority, moving toward = higher priority
        let priority = dist;
        // Boost priority for chunks in movement direction
        if (moveDirX !== 0 && Math.sign(dx) === moveDirX) priority -= 2;
        if (moveDirZ !== 0 && Math.sign(dz) === moveDirZ) priority -= 2;

        for (let sy = 0; sy < 8; sy++) {
          const id = `${cx}:${cz}:${sy}`;
          // Only add if not already loaded
          if (!this.world.getSectionById(id)) {
            sectionsToLoad.push({ id, cx, cz, sy, priority });
          }
        }
      }
    }

    // Sort by priority and load a batch per frame
    sectionsToLoad.sort((a, b) => a.priority - b.priority);

    // Load fewer sections per frame on mobile for better framerate
    const loadLimit = this.isMobile ? 4 : 16;
    for (let i = 0; i < Math.min(loadLimit, sectionsToLoad.length); i++) {
      const { cx, cz, sy } = sectionsToLoad[i];
      this.world.getOrCreateSection(cx, cz, sy);
    }
  }

  getRenderer(): Renderer {
    return this.renderer;
  }

  getWorld(): World {
    return this.world;
  }

  getChunkMeshManager(): ChunkMeshManager | null {
    return this.chunkMeshManager;
  }

  getPlayerController(): PlayerController | null {
    return this.playerController;
  }

  dispose(): void {
    this.stop();
    this.inputManager.dispose();
    this.blockInteraction?.dispose();
    this.crosshair?.dispose();
    this.chunkMeshManager?.dispose();
    this.renderer.dispose();
    materials.dispose();
    eventBus.clear();
  }
}
