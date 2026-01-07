import nipplejs from 'nipplejs';
import { InputProvider, InputState, LookDelta } from './InputManager';

export class TouchControls extends InputProvider {
  private joystick: nipplejs.JoystickManager | null = null;

  // Movement state from joystick
  private moveX = 0;
  private moveY = 0;

  // Look state from touch
  private lookDeltaX = 0;
  private lookDeltaY = 0;
  private lookSensitivity = 0.004;

  // Button states
  private jumping = false;
  private breaking = false;
  private placing = false;

  // Touch tracking for look
  private lookTouchId: number | null = null;
  private lastLookX = 0;
  private lastLookY = 0;

  // UI elements
  private jumpButton: HTMLElement | null = null;
  private placeButton: HTMLElement | null = null;
  private lookZone: HTMLElement | null = null;

  constructor(_container: HTMLElement) {
    super();
    void _container; // May use later for scoped events
    this.setupUI();
    this.setupJoystick();
    this.setupLookZone();
  }

  private setupUI(): void {
    // Create mobile controls container
    const controlsContainer = document.createElement('div');
    controlsContainer.id = 'mobile-controls';
    controlsContainer.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 100;
      display: none;
    `;
    document.body.appendChild(controlsContainer);

    // Joystick zone (left side)
    const joystickZone = document.createElement('div');
    joystickZone.id = 'joystick-zone';
    joystickZone.style.cssText = `
      position: absolute;
      left: 0;
      bottom: 0;
      width: 50%;
      height: 50%;
      pointer-events: auto;
    `;
    controlsContainer.appendChild(joystickZone);

    // Look zone (right side)
    this.lookZone = document.createElement('div');
    this.lookZone.id = 'look-zone';
    this.lookZone.style.cssText = `
      position: absolute;
      right: 0;
      top: 0;
      width: 50%;
      height: 100%;
      pointer-events: auto;
    `;
    controlsContainer.appendChild(this.lookZone);

    // Jump button
    this.jumpButton = document.createElement('div');
    this.jumpButton.id = 'jump-button';
    this.jumpButton.innerHTML = '⬆';
    this.jumpButton.style.cssText = `
      position: absolute;
      right: 20px;
      bottom: 20px;
      width: 70px;
      height: 70px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.3);
      border: 3px solid rgba(255, 255, 255, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 28px;
      color: white;
      pointer-events: auto;
      user-select: none;
      -webkit-user-select: none;
    `;
    controlsContainer.appendChild(this.jumpButton);

    // Show controls on touch devices
    if ('ontouchstart' in window) {
      controlsContainer.style.display = 'block';
    }

    // Jump button events
    this.jumpButton.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.jumping = true;
      this.jumpButton!.style.background = 'rgba(255, 255, 255, 0.5)';
    });
    this.jumpButton.addEventListener('touchend', () => {
      this.jumping = false;
      this.jumpButton!.style.background = 'rgba(255, 255, 255, 0.3)';
    });

    // Place button (above jump)
    this.placeButton = document.createElement('div');
    this.placeButton.id = 'place-button';
    this.placeButton.innerHTML = '◼';
    this.placeButton.style.cssText = `
      position: absolute;
      right: 20px;
      bottom: 110px;
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: rgba(100, 200, 100, 0.3);
      border: 3px solid rgba(100, 200, 100, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      color: white;
      pointer-events: auto;
      user-select: none;
      -webkit-user-select: none;
    `;
    controlsContainer.appendChild(this.placeButton);

    // Place button events
    this.placeButton.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.placing = true;
      this.placeButton!.style.background = 'rgba(100, 200, 100, 0.5)';
    });
    this.placeButton.addEventListener('touchend', () => {
      this.placing = false;
      this.placeButton!.style.background = 'rgba(100, 200, 100, 0.3)';
    });
  }

  private setupJoystick(): void {
    const joystickZone = document.getElementById('joystick-zone');
    if (!joystickZone) return;

    this.joystick = nipplejs.create({
      zone: joystickZone,
      mode: 'dynamic',
      position: { left: '50%', top: '50%' },
      color: 'white',
      size: 120,
      fadeTime: 100
    });

    this.joystick.on('move', (_, data) => {
      if (data.vector) {
        this.moveX = data.vector.x;
        this.moveY = data.vector.y; // Up on joystick = forward
      }
    });

    this.joystick.on('end', () => {
      this.moveX = 0;
      this.moveY = 0;
    });
  }

  private setupLookZone(): void {
    if (!this.lookZone) return;

    this.lookZone.addEventListener('touchstart', (e) => {
      if (this.lookTouchId === null) {
        const touch = e.changedTouches[0];
        this.lookTouchId = touch.identifier;
        this.lastLookX = touch.clientX;
        this.lastLookY = touch.clientY;
      }
    });

    this.lookZone.addEventListener('touchmove', (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === this.lookTouchId) {
          const dx = touch.clientX - this.lastLookX;
          const dy = touch.clientY - this.lastLookY;

          this.lookDeltaX += dx * this.lookSensitivity;
          this.lookDeltaY += dy * this.lookSensitivity;

          this.lastLookX = touch.clientX;
          this.lastLookY = touch.clientY;
          break;
        }
      }
    });

    this.lookZone.addEventListener('touchend', (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === this.lookTouchId) {
          this.lookTouchId = null;
          break;
        }
      }
    });

    // Tap to break/place (short tap = break, long tap = place)
    let tapStart = 0;
    this.lookZone.addEventListener('touchstart', () => {
      tapStart = Date.now();
    });

    this.lookZone.addEventListener('touchend', (e) => {
      const duration = Date.now() - tapStart;
      if (duration < 200 && e.changedTouches.length === 1) {
        // Short tap - break block
        this.breaking = true;
        setTimeout(() => { this.breaking = false; }, 50);
      }
    });
  }

  getState(): InputState {
    // Convert joystick to directional input
    const threshold = 0.3;
    return {
      forward: this.moveY > threshold,
      backward: this.moveY < -threshold,
      left: this.moveX < -threshold,
      right: this.moveX > threshold,
      jump: this.jumping,
      sneak: false,
      primaryAction: this.breaking,
      secondaryAction: this.placing
    };
  }

  getLookDelta(): LookDelta {
    const delta = { dx: this.lookDeltaX, dy: this.lookDeltaY };
    this.lookDeltaX = 0;
    this.lookDeltaY = 0;
    return delta;
  }

  isTouch(): boolean {
    return 'ontouchstart' in window;
  }

  setLookSensitivity(value: number): void {
    this.lookSensitivity = value;
  }

  dispose(): void {
    if (this.joystick) {
      this.joystick.destroy();
    }
    const controls = document.getElementById('mobile-controls');
    if (controls) {
      controls.remove();
    }
  }
}
