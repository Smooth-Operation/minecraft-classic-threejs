import 'dotenv/config';
import { GameServer, GameServerConfig } from './network/GameServer.js';

// Load configuration from environment
const config: GameServerConfig = {
  port: parseInt(process.env.PORT || '8080', 10),
  host: process.env.HOST || '127.0.0.1',
  allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:3000').split(','),
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  wsPublicUrl: process.env.WS_PUBLIC_URL || `ws://localhost:${process.env.PORT || '8080'}/ws`,
  serverRegion: process.env.SERVER_REGION || 'local',
};

// Validate required config
if (!config.supabaseUrl) {
  console.error('SUPABASE_URL environment variable is required');
  process.exit(1);
}

if (!config.supabaseServiceKey) {
  console.error('SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  process.exit(1);
}

// Create and start server
const server = new GameServer(config);

async function main() {
  try {
    await server.start();

    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║         Minecraft Classic WebSocket Server Started            ║
╠═══════════════════════════════════════════════════════════════╣
║  Port: ${config.port.toString().padEnd(54)}║
║  Host: ${config.host.padEnd(54)}║
║  Region: ${config.serverRegion.padEnd(52)}║
║  Instance: ${server.getInstanceId().substring(0, 36).padEnd(50)}║
╚═══════════════════════════════════════════════════════════════╝
    `);

    // Log stats periodically
    setInterval(() => {
      const stats = server.getStats();
      console.log(`[Stats] Connections: ${stats.connections}, Players: ${stats.players}, Dirty sections: ${stats.dirtySections}`);
    }, 30000);

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle shutdown gracefully
process.on('SIGINT', async () => {
  console.log('\nReceived SIGINT, shutting down...');
  await server.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nReceived SIGTERM, shutting down...');
  await server.stop();
  process.exit(0);
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  server.stop().then(() => process.exit(1));
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
});

main();
