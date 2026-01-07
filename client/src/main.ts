import { Game } from './core/Game';

let game: Game | null = null;

function init(): void {
  const container = document.getElementById('app');
  if (!container) {
    console.error('Container element not found');
    return;
  }

  game = new Game(container);
  game.start();

  // Expose game instance for debugging
  if (import.meta.env.DEV) {
    (window as unknown as { game: Game }).game = game;
  }
}

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
