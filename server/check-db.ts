import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://kxdadjzwtudvjrqbkzyh.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt4ZGFkanp3dHVkdmpycWJrenloIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzgwMjQ3NywiZXhwIjoyMDgzMzc4NDc3fQ.oKsSPGQN3DRz0cdHrbs2rnWsueNgv-V9da8vAMwQDbo';

async function main() {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  console.log('Checking database state...\n');

  // Check worlds
  const { data: worlds, error: worldsErr } = await supabase
    .from('worlds')
    .select('id, name, is_public, owner_id')
    .limit(5);

  console.log('Worlds:', worlds?.length || 0);
  if (worlds?.length) {
    worlds.forEach(w => console.log(`  - ${w.name} (${w.id}) public=${w.is_public}`));
  }
  if (worldsErr) console.log('  Error:', worldsErr.message);

  // Check users
  const { data: users, error: usersErr } = await supabase.auth.admin.listUsers();
  console.log('\nUsers:', users?.users?.length || 0);
  if (users?.users?.length) {
    users.users.slice(0, 5).forEach(u => console.log(`  - ${u.email} (${u.id})`));
  }
  if (usersErr) console.log('  Error:', usersErr.message);

  // Check world_sessions
  const { data: sessions, error: sessErr } = await supabase
    .from('world_sessions')
    .select('world_id, status, player_count, last_heartbeat')
    .limit(5);

  console.log('\nWorld Sessions:', sessions?.length || 0);
  if (sessions?.length) {
    sessions.forEach(s => console.log(`  - ${s.world_id} status=${s.status} players=${s.player_count}`));
  }
  if (sessErr) console.log('  Error:', sessErr.message);
}

main().catch(console.error);
