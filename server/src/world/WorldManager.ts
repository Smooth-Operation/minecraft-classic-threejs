import type { WebSocket } from 'ws';
import type { World, Player, Section, BlockEventCache } from '../types/state.js';
import type { Vec3, BlockEventMessage } from '../types/protocol.js';
import {
  MAX_PLAYERS_PER_WORLD,
  MAX_DIRTY_SECTIONS,
  PERSISTENCE_BATCH_WINDOW_MS,
  REQUEST_ID_TTL_MS,
  REGISTRY_VERSION,
  GENERATOR_VERSION,
} from '../types/constants.js';
import {
  worldToSectionId,
  worldToBlockIndex,
  parseSectionId,
} from '../utils/coordinates.js';
import {
  generateBaselineSection,
  getSpawnPosition,
  encodeSectionBlocks,
} from './generator.js';
import {
  loadSection,
  saveSections,
  getWorld,
  checkWorldMembership,
  checkWorldBan,
  recordPlayerJoin,
  recordPlayerLeave,
  getUserDisplayName,
  registerWorldSession,
  updateWorldSessionHeartbeat,
  deregisterWorldSession,
} from '../persistence/supabase.js';

export class WorldManager {
  private worlds: Map<string, World> = new Map();
  private instanceId: string;
  private persistenceTimer: NodeJS.Timeout | null = null;

  constructor(instanceId: string) {
    this.instanceId = instanceId;
    this.startPersistenceLoop();
  }

  private startPersistenceLoop(): void {
    this.persistenceTimer = setInterval(() => {
      this.flushDirtySections();
    }, PERSISTENCE_BATCH_WINDOW_MS);
  }

  stopPersistenceLoop(): void {
    if (this.persistenceTimer) {
      clearInterval(this.persistenceTimer);
      this.persistenceTimer = null;
    }
  }

  async flushDirtySections(): Promise<void> {
    for (const [worldId, world] of this.worlds) {
      // Skip persistence for default-world (no database)
      if (worldId === 'default-world') continue;

      const dirtySections: Section[] = [];

      for (const section of world.loadedSections.values()) {
        if (section.dirty) {
          dirtySections.push(section);
        }
      }

      if (dirtySections.length === 0) continue;

      try {
        await saveSections(worldId, dirtySections);
        // Mark as clean after successful save
        for (const section of dirtySections) {
          section.dirty = false;
        }
        console.log(`Flushed ${dirtySections.length} sections for world ${worldId}`);
      } catch (error) {
        console.error(`Failed to flush sections for world ${worldId}:`, error);
        // Keep dirty flag - will retry next cycle
      }
    }
  }

  private getOrCreateWorld(worldId: string): World {
    let world = this.worlds.get(worldId);
    if (!world) {
      world = {
        worldId,
        generatorVersion: GENERATOR_VERSION,
        registryVersion: REGISTRY_VERSION,
        isPublic: true,
        activePlayers: new Map(),
        loadedSections: new Map(),
        sectionSubscribers: new Map(),
        pendingEdits: new Map(),
      };
      this.worlds.set(worldId, world);
    }
    return world;
  }

  async validateWorldAccess(
    worldId: string,
    userId: string
  ): Promise<{ valid: boolean; error?: string; errorCode?: string }> {
    // Allow "default-world" without database check (public sandbox)
    if (worldId === 'default-world') {
      const world = this.getOrCreateWorld(worldId);
      world.generatorVersion = GENERATOR_VERSION;
      world.registryVersion = REGISTRY_VERSION;
      world.isPublic = true;
      return { valid: true };
    }

    // Check world exists
    const dbWorld = await getWorld(worldId);
    if (!dbWorld) {
      return { valid: false, error: 'World not found', errorCode: 'WORLD_NOT_FOUND' };
    }

    // Check if banned
    const isBanned = await checkWorldBan(worldId, userId);
    if (isBanned) {
      return { valid: false, error: 'You are banned from this world', errorCode: 'PERMISSION_DENIED' };
    }

    // Check membership for private worlds
    if (!dbWorld.is_public) {
      const isMember = await checkWorldMembership(worldId, userId);
      if (!isMember && dbWorld.owner_id !== userId) {
        return { valid: false, error: 'You do not have access to this world', errorCode: 'PERMISSION_DENIED' };
      }
    }

    // Initialize world state from DB
    const world = this.getOrCreateWorld(worldId);
    world.generatorVersion = dbWorld.generator_version;
    world.registryVersion = dbWorld.registry_version;
    world.isPublic = dbWorld.is_public;

    return { valid: true };
  }

  isWorldFull(worldId: string): boolean {
    const world = this.worlds.get(worldId);
    if (!world) return false;
    return world.activePlayers.size >= MAX_PLAYERS_PER_WORLD;
  }

  async addPlayer(
    worldId: string,
    playerId: string,
    connection: WebSocket,
    displayNameHint?: string
  ): Promise<Player> {
    const world = this.getOrCreateWorld(worldId);
    // Use provided display name or fetch from database
    const displayName = displayNameHint || await getUserDisplayName(playerId);
    const spawn = getSpawnPosition();

    const player: Player = {
      playerId,
      displayName,
      position: { ...spawn },
      velocity: { x: 0, y: 0, z: 0 },
      yaw: 0,
      pitch: 0,
      lastInputSeq: 0,
      lastActivity: Date.now(),
      subscribedSections: new Set(),
      connection,
      worldId,
      pendingSections: [],
      bytesSentThisSecond: 0,
      lastBytesReset: Date.now(),
      editCount: 0,
      lastEditReset: Date.now(),
      subscribeCount: 0,
      lastSubscribeReset: Date.now(),
    };

    world.activePlayers.set(playerId, player);

    // Record in database (skip for default-world)
    if (worldId !== 'default-world') {
      await recordPlayerJoin(worldId, playerId, displayName);
    }

    console.log(`Player ${displayName} (${playerId}) joined world ${worldId}`);

    return player;
  }

  async removePlayer(worldId: string, playerId: string): Promise<void> {
    const world = this.worlds.get(worldId);
    if (!world) return;

    const player = world.activePlayers.get(playerId);
    if (!player) return;

    // Unsubscribe from all sections
    for (const sectionId of player.subscribedSections) {
      const subscribers = world.sectionSubscribers.get(sectionId);
      if (subscribers) {
        subscribers.delete(playerId);
        if (subscribers.size === 0) {
          world.sectionSubscribers.delete(sectionId);
        }
      }
    }

    world.activePlayers.delete(playerId);

    // Record in database (skip for default-world)
    if (worldId !== 'default-world') {
      await recordPlayerLeave(worldId, playerId);
    }

    console.log(`Player ${player.displayName} (${playerId}) left world ${worldId}`);

    // Clean up empty world after a delay
    if (world.activePlayers.size === 0) {
      // Flush any remaining dirty sections before potentially removing
      await this.flushDirtySections();
    }
  }

  getPlayer(worldId: string, playerId: string): Player | undefined {
    return this.worlds.get(worldId)?.activePlayers.get(playerId);
  }

  getPlayersInWorld(worldId: string): Player[] {
    const world = this.worlds.get(worldId);
    if (!world) return [];
    return Array.from(world.activePlayers.values());
  }

  getWorld(worldId: string): World | undefined {
    return this.worlds.get(worldId);
  }

  async getSection(worldId: string, sectionId: string): Promise<Section> {
    const world = this.getOrCreateWorld(worldId);

    // Check cache first
    let section = world.loadedSections.get(sectionId);
    if (section) {
      section.lastAccessed = Date.now();
      return section;
    }

    // For default-world, just generate (no database)
    if (worldId === 'default-world') {
      section = generateBaselineSection(sectionId);
    } else {
      // Load from database or generate
      section = await loadSection(worldId, sectionId);
    }
    world.loadedSections.set(sectionId, section);

    return section;
  }

  subscribeToSection(worldId: string, playerId: string, sectionId: string): void {
    const world = this.worlds.get(worldId);
    if (!world) return;

    const player = world.activePlayers.get(playerId);
    if (!player) return;

    player.subscribedSections.add(sectionId);

    let subscribers = world.sectionSubscribers.get(sectionId);
    if (!subscribers) {
      subscribers = new Set();
      world.sectionSubscribers.set(sectionId, subscribers);
    }
    subscribers.add(playerId);
  }

  unsubscribeFromSection(worldId: string, playerId: string, sectionId: string): void {
    const world = this.worlds.get(worldId);
    if (!world) return;

    const player = world.activePlayers.get(playerId);
    if (player) {
      player.subscribedSections.delete(sectionId);
    }

    const subscribers = world.sectionSubscribers.get(sectionId);
    if (subscribers) {
      subscribers.delete(playerId);
      if (subscribers.size === 0) {
        world.sectionSubscribers.delete(sectionId);
      }
    }
  }

  getSectionSubscribers(worldId: string, sectionId: string): Player[] {
    const world = this.worlds.get(worldId);
    if (!world) return [];

    const subscriberIds = world.sectionSubscribers.get(sectionId);
    if (!subscriberIds) return [];

    const players: Player[] = [];
    for (const playerId of subscriberIds) {
      const player = world.activePlayers.get(playerId);
      if (player) players.push(player);
    }
    return players;
  }

  applyBlockEdit(
    worldId: string,
    x: number,
    y: number,
    z: number,
    blockId: number
  ): { section: Section; previousBlockId: number } | null {
    const world = this.worlds.get(worldId);
    if (!world) return null;

    const sectionId = worldToSectionId(x, y, z);
    let section = world.loadedSections.get(sectionId);

    if (!section) {
      // Generate baseline if not loaded (shouldn't happen normally)
      section = generateBaselineSection(sectionId);
      world.loadedSections.set(sectionId, section);
    }

    const blockIndex = worldToBlockIndex(x, y, z);
    const previousBlockId = section.blocks[blockIndex];

    // Apply edit
    section.blocks[blockIndex] = blockId;
    section.version++;
    section.dirty = true;
    section.lastAccessed = Date.now();

    return { section, previousBlockId };
  }

  // Idempotency handling
  getCachedBlockEvent(worldId: string, requestId: string): BlockEventCache | undefined {
    const world = this.worlds.get(worldId);
    return world?.pendingEdits.get(requestId);
  }

  cacheBlockEvent(worldId: string, requestId: string, response: object): void {
    const world = this.worlds.get(worldId);
    if (!world) return;

    world.pendingEdits.set(requestId, {
      requestId,
      response,
      timestamp: Date.now(),
    });

    // Cleanup old entries
    const cutoff = Date.now() - REQUEST_ID_TTL_MS;
    for (const [id, cache] of world.pendingEdits) {
      if (cache.timestamp < cutoff) {
        world.pendingEdits.delete(id);
      }
    }
  }

  updatePlayerPosition(
    worldId: string,
    playerId: string,
    position: Vec3,
    velocity: Vec3,
    yaw: number,
    pitch: number,
    inputSeq: number
  ): void {
    const player = this.getPlayer(worldId, playerId);
    if (!player) return;

    player.position = position;
    player.velocity = velocity;
    player.yaw = yaw;
    player.pitch = pitch;
    player.lastInputSeq = inputSeq;
    player.lastActivity = Date.now();
  }

  getTotalPlayerCount(): number {
    let count = 0;
    for (const world of this.worlds.values()) {
      count += world.activePlayers.size;
    }
    return count;
  }

  getDirtySectionCount(): number {
    let count = 0;
    for (const world of this.worlds.values()) {
      for (const section of world.loadedSections.values()) {
        if (section.dirty) count++;
      }
    }
    return count;
  }
}
