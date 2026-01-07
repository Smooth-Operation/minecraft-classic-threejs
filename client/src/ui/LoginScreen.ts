// Simple session for display name only (no Supabase auth)
export interface SimpleSession {
  displayName: string;
  odId: string; // Generated player ID
  access_token: string; // Simple token for server
}

export class LoginScreen {
  private element: HTMLElement;
  private form: HTMLFormElement;
  private nameInput: HTMLInputElement;
  private playButton: HTMLButtonElement;
  private offlineButton: HTMLButtonElement | null = null;
  private errorMessage: HTMLElement;
  private successCallback: ((session: SimpleSession) => void) | null = null;
  private offlineCallback: ((displayName: string) => void) | null = null;

  constructor() {
    // Create overlay container
    this.element = document.createElement('div');
    this.element.id = 'login-screen';
    this.element.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: #1a1a2e;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      font-family: 'Courier New', monospace;
    `;

    // Create form container
    const container = document.createElement('div');
    container.style.cssText = `
      background: #16213e;
      padding: 40px;
      border-radius: 8px;
      border: 2px solid #0f3460;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
      width: 100%;
      max-width: 360px;
    `;

    // Title
    const title = document.createElement('h1');
    title.textContent = 'MINECRAFT CLASSIC';
    title.style.cssText = `
      color: #e94560;
      text-align: center;
      margin: 0 0 8px 0;
      font-size: 24px;
      letter-spacing: 2px;
      text-shadow: 2px 2px 0 #0f3460;
    `;
    container.appendChild(title);

    const subtitle = document.createElement('p');
    subtitle.textContent = 'Enter your name to play';
    subtitle.style.cssText = `
      color: #a0a0a0;
      text-align: center;
      margin: 0 0 30px 0;
      font-size: 14px;
    `;
    container.appendChild(subtitle);

    // Form
    this.form = document.createElement('form');
    this.form.style.cssText = `display: flex; flex-direction: column; gap: 16px;`;

    // Name input
    this.nameInput = this.createInput('text', 'Display Name', 'displayName');
    this.nameInput.maxLength = 16;
    this.nameInput.minLength = 2;
    this.form.appendChild(this.nameInput);

    // Error message
    this.errorMessage = document.createElement('div');
    this.errorMessage.style.cssText = `
      color: #ff6b6b;
      font-size: 13px;
      text-align: center;
      min-height: 20px;
      display: none;
    `;
    this.form.appendChild(this.errorMessage);

    // Play button (online multiplayer)
    this.playButton = this.createButton('PLAY ONLINE');
    this.playButton.type = 'submit';
    this.form.appendChild(this.playButton);

    // Offline / single player button
    this.offlineButton = this.createSecondaryButton('SINGLE PLAYER');
    this.offlineButton.type = 'button';
    this.offlineButton.addEventListener('click', () => this.handleOffline());
    this.form.appendChild(this.offlineButton);

    container.appendChild(this.form);
    this.element.appendChild(container);

    // Event listeners
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handlePlay();
    });
  }

  private createInput(type: string, placeholder: string, name: string): HTMLInputElement {
    const input = document.createElement('input');
    input.type = type;
    input.name = name;
    input.placeholder = placeholder;
    input.required = true;
    input.style.cssText = `
      width: 100%;
      padding: 14px 16px;
      border: 2px solid #0f3460;
      border-radius: 4px;
      background: #1a1a2e;
      color: #ffffff;
      font-size: 14px;
      font-family: inherit;
      outline: none;
      box-sizing: border-box;
      transition: border-color 0.2s;
    `;
    input.addEventListener('focus', () => {
      input.style.borderColor = '#e94560';
    });
    input.addEventListener('blur', () => {
      input.style.borderColor = '#0f3460';
    });
    return input;
  }

  private createButton(text: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.textContent = text;
    button.style.cssText = `
      padding: 14px 20px;
      border: 2px solid #e94560;
      border-radius: 4px;
      background: #e94560;
      color: #ffffff;
      font-size: 14px;
      font-family: inherit;
      font-weight: bold;
      letter-spacing: 1px;
      cursor: pointer;
      transition: all 0.2s;
    `;
    button.addEventListener('mouseenter', () => {
      button.style.background = '#ff6b6b';
      button.style.borderColor = '#ff6b6b';
    });
    button.addEventListener('mouseleave', () => {
      button.style.background = '#e94560';
      button.style.borderColor = '#e94560';
    });
    return button;
  }

  private createSecondaryButton(text: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.textContent = text;
    button.style.cssText = `
      padding: 14px 20px;
      border: 2px solid #0f3460;
      border-radius: 4px;
      background: transparent;
      color: #a0a0a0;
      font-size: 14px;
      font-family: inherit;
      font-weight: bold;
      letter-spacing: 1px;
      cursor: pointer;
      transition: all 0.2s;
    `;
    button.addEventListener('mouseenter', () => {
      button.style.background = '#0f3460';
      button.style.color = '#ffffff';
    });
    button.addEventListener('mouseleave', () => {
      button.style.background = 'transparent';
      button.style.color = '#a0a0a0';
    });
    return button;
  }

  private showError(message: string): void {
    this.errorMessage.textContent = message;
    this.errorMessage.style.display = 'block';
  }

  private handlePlay(): void {
    const displayName = this.nameInput.value.trim();

    if (displayName.length < 2) {
      this.showError('Name must be at least 2 characters');
      return;
    }

    if (displayName.length > 16) {
      this.showError('Name must be 16 characters or less');
      return;
    }

    // Generate a simple player ID and token
    const odId = 'player_' + Math.random().toString(36).substr(2, 9);
    const access_token = btoa(JSON.stringify({ displayName, odId, ts: Date.now() }));

    if (this.successCallback) {
      this.successCallback({ displayName, odId, access_token });
    }
  }

  private handleOffline(): void {
    const displayName = this.nameInput.value.trim() || 'Player';

    if (this.offlineCallback) {
      this.offlineCallback(displayName);
    }
  }

  show(): void {
    if (!this.element.parentElement) {
      document.body.appendChild(this.element);
    }
    this.element.style.display = 'flex';
    this.nameInput.focus();
  }

  hide(): void {
    this.element.style.display = 'none';
  }

  onSuccess(callback: (session: SimpleSession) => void): void {
    this.successCallback = callback;
  }

  onOfflineMode(callback: (displayName: string) => void): void {
    this.offlineCallback = callback;
  }

  dispose(): void {
    this.element.remove();
  }
}
