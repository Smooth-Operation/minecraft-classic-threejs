import type { SupabaseClient } from '@supabase/supabase-js';

interface WorldSession {
  ws_url: string;
  player_count: number;
}

interface WorldData {
  id: string;
  name: string;
  max_players: number;
  world_sessions: WorldSession[] | null;
}

interface JoinInfo {
  world_id: string;
  ws_url: string;
  name: string;
}

type JoinCallback = (info: JoinInfo) => void;

export class ServerListScreen {
  private element: HTMLElement;
  private listContainer: HTMLElement;
  private supabase: SupabaseClient | null = null;
  private joinCallback: JoinCallback | null = null;

  constructor() {
    this.element = document.createElement('div');
    this.element.id = 'server-list-screen';
    this.element.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.9);
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    `;

    const container = document.createElement('div');
    container.style.cssText = `
      background: #1a1a2e;
      border-radius: 8px;
      padding: 24px;
      width: 500px;
      max-width: 90vw;
      max-height: 80vh;
      display: flex;
      flex-direction: column;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
    `;

    const title = document.createElement('h1');
    title.textContent = 'Select World';
    title.style.cssText = `
      margin: 0 0 20px 0;
      color: #fff;
      font-size: 24px;
      text-align: center;
    `;
    container.appendChild(title);

    this.listContainer = document.createElement('div');
    this.listContainer.style.cssText = `
      flex: 1;
      overflow-y: auto;
      margin-bottom: 16px;
      min-height: 200px;
      max-height: 400px;
    `;
    container.appendChild(this.listContainer);

    const buttonRow = document.createElement('div');
    buttonRow.style.cssText = `
      display: flex;
      gap: 12px;
      justify-content: center;
    `;

    const refreshBtn = this.createButton('Refresh', () => this.refresh());
    const createBtn = this.createButton('Create World', () => {
      console.log('Create world not yet implemented');
    });
    createBtn.style.background = '#16213e';

    buttonRow.appendChild(refreshBtn);
    buttonRow.appendChild(createBtn);
    container.appendChild(buttonRow);

    this.element.appendChild(container);
    document.body.appendChild(this.element);
  }

  private createButton(text: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.style.cssText = `
      padding: 10px 20px;
      background: #0f3460;
      color: #fff;
      border: none;
      border-radius: 4px;
      font-size: 14px;
      cursor: pointer;
      transition: background 0.2s;
    `;
    btn.addEventListener('mouseenter', () => {
      btn.style.background = '#1a5293';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = btn === this.element.querySelector('button:last-child') ? '#16213e' : '#0f3460';
    });
    btn.addEventListener('click', onClick);
    return btn;
  }

  async show(supabaseClient: SupabaseClient): Promise<void> {
    this.supabase = supabaseClient;
    this.element.style.display = 'flex';
    await this.refresh();
  }

  hide(): void {
    this.element.style.display = 'none';
  }

  onJoin(callback: JoinCallback): void {
    this.joinCallback = callback;
  }

  private async refresh(): Promise<void> {
    if (!this.supabase) return;

    this.listContainer.innerHTML = `
      <div style="color: #888; text-align: center; padding: 40px;">
        Loading worlds...
      </div>
    `;

    try {
      const { data, error } = await this.supabase
        .from('worlds')
        .select('id, name, max_players, world_sessions(ws_url, player_count)')
        .eq('is_public', true);

      if (error) throw error;

      this.renderWorldList(data as WorldData[] | null);
    } catch (err) {
      console.error('Failed to fetch worlds:', err);
      this.listContainer.innerHTML = `
        <div style="color: #e74c3c; text-align: center; padding: 40px;">
          Failed to load worlds. Click Refresh to retry.
        </div>
      `;
    }
  }

  private renderWorldList(worlds: WorldData[] | null): void {
    this.listContainer.innerHTML = '';

    if (!worlds || worlds.length === 0) {
      this.listContainer.innerHTML = `
        <div style="color: #888; text-align: center; padding: 40px;">
          No worlds available
        </div>
      `;
      return;
    }

    for (const world of worlds) {
      // world_sessions comes back as an array from Supabase join
      const sessions = world.world_sessions;
      const session = sessions && sessions.length > 0 ? sessions[0] : null;
      const playerCount = session?.player_count ?? 0;
      const isOnline = session !== null;

      const row = document.createElement('div');
      row.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        background: #16213e;
        border-radius: 6px;
        margin-bottom: 8px;
      `;

      const info = document.createElement('div');
      info.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 4px;
      `;

      const nameEl = document.createElement('div');
      nameEl.textContent = world.name;
      nameEl.style.cssText = `
        color: #fff;
        font-size: 16px;
        font-weight: 500;
      `;
      info.appendChild(nameEl);

      const statusEl = document.createElement('div');
      statusEl.style.cssText = `
        font-size: 12px;
        color: ${isOnline ? '#2ecc71' : '#888'};
      `;
      statusEl.textContent = isOnline
        ? `${playerCount}/${world.max_players} players`
        : 'Offline';
      info.appendChild(statusEl);

      row.appendChild(info);

      const joinBtn = document.createElement('button');
      joinBtn.textContent = 'Join';
      joinBtn.disabled = !isOnline;
      joinBtn.style.cssText = `
        padding: 8px 16px;
        background: ${isOnline ? '#27ae60' : '#555'};
        color: #fff;
        border: none;
        border-radius: 4px;
        font-size: 14px;
        cursor: ${isOnline ? 'pointer' : 'not-allowed'};
        transition: background 0.2s;
      `;

      if (isOnline) {
        joinBtn.addEventListener('mouseenter', () => {
          joinBtn.style.background = '#2ecc71';
        });
        joinBtn.addEventListener('mouseleave', () => {
          joinBtn.style.background = '#27ae60';
        });
        joinBtn.addEventListener('click', () => {
          if (this.joinCallback && session) {
            this.joinCallback({
              world_id: world.id,
              ws_url: session.ws_url,
              name: world.name,
            });
          }
        });
      }

      row.appendChild(joinBtn);
      this.listContainer.appendChild(row);
    }
  }

  dispose(): void {
    this.element.remove();
  }
}
