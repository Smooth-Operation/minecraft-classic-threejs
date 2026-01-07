import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Section } from '../types/state.js';
import { SECTION_BYTES } from '../types/constants.js';
import { decodeSectionBlocksFromDb, generateBaselineSection } from '../world/generator.js';

let supabase: SupabaseClient | null = null;

export function initSupabase(url: string, serviceRoleKey: string): void {
  supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

export function getSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error('Supabase not initialized. Call initSupabase first.');
  }
  return supabase;
}

// Database types matching actual schema
export interface DbWorld {
  id: string;
  name: string;
  owner_id: string;
  is_public: boolean;
  max_players: number;
  generator_version: number;
  registry_version: number;
  created_at: string;
  updated_at: string;
}

export interface DbWorldSection {
  world_id: string;
  section_id: string;
  version: number;
  blocks: ArrayBuffer;
  updated_at: string;
}

export interface DbWorldSession {
  world_id: string;
  server_instance_id: string;
  ws_url: string;
  status: 'online' | 'draining' | 'offline';
  player_count: number;
  last_heartbeat: string;
  started_at: string;
}

export interface DbWorldPlayer {
  world_id: string;
  user_id: string;
  display_name: string;
  joined_at: string;
  last_seen: string;
}

// World queries
export async function getWorld(worldId: string): Promise<DbWorld | null> {
  const { data, error } = await getSupabase()
    .from('worlds')
    .select('*')
    .eq('id', worldId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    throw error;
  }
  return data;
}

export async function checkWorldMembership(worldId: string, userId: string): Promise<boolean> {
  const { data, error } = await getSupabase()
    .from('world_members')
    .select('user_id')
    .eq('world_id', worldId)
    .eq('user_id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return false; // Not found
    throw error;
  }
  return !!data;
}

export async function checkWorldBan(worldId: string, userId: string): Promise<boolean> {
  const { data, error } = await getSupabase()
    .from('world_bans')
    .select('user_id, expires_at')
    .eq('world_id', worldId)
    .eq('user_id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return false; // Not found = not banned
    throw error;
  }

  // Check if ban has expired
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return false;
  }

  return true;
}

// Section queries - using world_sections table
export async function loadSection(worldId: string, sectionId: string): Promise<Section> {
  const { data, error } = await getSupabase()
    .from('world_sections')
    .select('blocks, version')
    .eq('world_id', worldId)
    .eq('section_id', sectionId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // Not found - generate baseline
      return generateBaselineSection(sectionId);
    }
    console.error(`Failed to load section ${sectionId}:`, error);
    // Fallback to baseline on error
    return generateBaselineSection(sectionId);
  }

  // Validate and decode blocks
  if (!data.blocks || data.blocks.byteLength !== SECTION_BYTES) {
    console.warn(`Invalid blocks data for section ${sectionId}, using baseline`);
    return generateBaselineSection(sectionId);
  }

  return {
    sectionId,
    version: data.version || 1,
    blocks: decodeSectionBlocksFromDb(data.blocks),
    dirty: false,
    lastAccessed: Date.now(),
    fromDatabase: true,
  };
}

export async function saveSections(worldId: string, sections: Section[]): Promise<void> {
  if (sections.length === 0) return;

  const records = sections.map(section => ({
    world_id: worldId,
    section_id: section.sectionId,
    blocks: Buffer.from(section.blocks.buffer),
    version: section.version,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await getSupabase()
    .from('world_sections')
    .upsert(records, { onConflict: 'world_id,section_id' });

  if (error) {
    throw error;
  }
}

// World session management (per-world, not per-server)
export async function registerWorldSession(
  worldId: string,
  instanceId: string,
  wsUrl: string
): Promise<void> {
  const { error } = await getSupabase()
    .from('world_sessions')
    .upsert({
      world_id: worldId,
      server_instance_id: instanceId,
      ws_url: wsUrl,
      status: 'online',
      player_count: 0,
      last_heartbeat: new Date().toISOString(),
      started_at: new Date().toISOString(),
    }, { onConflict: 'world_id' });

  if (error) {
    console.error('Failed to register world session:', error);
    throw error;
  }
}

export async function updateWorldSessionHeartbeat(
  worldId: string,
  playerCount: number
): Promise<void> {
  const { error } = await getSupabase()
    .from('world_sessions')
    .update({
      player_count: playerCount,
      last_heartbeat: new Date().toISOString(),
    })
    .eq('world_id', worldId);

  if (error) {
    console.error('Failed to update world session heartbeat:', error);
  }
}

export async function deregisterWorldSession(worldId: string): Promise<void> {
  const { error } = await getSupabase()
    .from('world_sessions')
    .update({ status: 'offline' })
    .eq('world_id', worldId);

  if (error) {
    console.error('Failed to deregister world session:', error);
  }
}

// Player tracking via world_players table
export async function recordPlayerJoin(
  worldId: string,
  playerId: string,
  displayName: string
): Promise<void> {
  const { error } = await getSupabase()
    .from('world_players')
    .upsert({
      world_id: worldId,
      user_id: playerId,
      display_name: displayName,
      joined_at: new Date().toISOString(),
      last_seen: new Date().toISOString(),
    }, { onConflict: 'world_id,user_id' });

  if (error) {
    console.error('Failed to record player join:', error);
  }
}

export async function recordPlayerLeave(worldId: string, playerId: string): Promise<void> {
  const { error } = await getSupabase()
    .from('world_players')
    .update({ last_seen: new Date().toISOString() })
    .eq('world_id', worldId)
    .eq('user_id', playerId);

  if (error) {
    console.error('Failed to record player leave:', error);
  }
}

export async function updatePlayerLastSeen(worldId: string, playerId: string): Promise<void> {
  const { error } = await getSupabase()
    .from('world_players')
    .update({ last_seen: new Date().toISOString() })
    .eq('world_id', worldId)
    .eq('user_id', playerId);

  if (error) {
    console.error('Failed to update player last seen:', error);
  }
}

// Get user display name from auth metadata or generate one
export async function getUserDisplayName(userId: string): Promise<string> {
  // Try to get from auth.users metadata
  const { data, error } = await getSupabase()
    .auth.admin.getUserById(userId);

  if (error || !data.user) {
    return `Player_${userId.slice(0, 8)}`;
  }

  // Check user_metadata for display_name or full_name
  const metadata = data.user.user_metadata;
  if (metadata?.display_name) return metadata.display_name;
  if (metadata?.full_name) return metadata.full_name;
  if (metadata?.name) return metadata.name;

  // Fall back to email prefix or generated name
  const email = data.user.email;
  if (email) {
    return email.split('@')[0];
  }

  return `Player_${userId.slice(0, 8)}`;
}

// Cleanup stale world sessions (for startup)
export async function cleanupStaleWorldSessions(instanceId: string): Promise<void> {
  const { error } = await getSupabase()
    .from('world_sessions')
    .update({ status: 'offline' })
    .eq('server_instance_id', instanceId);

  if (error) {
    console.error('Failed to cleanup stale sessions:', error);
  }
}

// Get active world session
export async function getWorldSession(worldId: string): Promise<DbWorldSession | null> {
  const { data, error } = await getSupabase()
    .from('world_sessions')
    .select('*')
    .eq('world_id', worldId)
    .eq('status', 'online')
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  // Check if heartbeat is stale (> 60 seconds)
  const lastHeartbeat = new Date(data.last_heartbeat);
  if (Date.now() - lastHeartbeat.getTime() > 60000) {
    return null;
  }

  return data;
}
