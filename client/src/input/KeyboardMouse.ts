import { InputProvider, InputState, LookDelta } from './InputManager';

export class KeyboardMouseInput extends InputProvider {
  private keys: Set<string> = new Set();
  private mouseButtons: Set<number> = new Set();
  private mouseDeltaX = 0;
  private mouseDeltaY = 0;
  private sensitivity = 0.002;
  private canvas: HTMLCanvasElement;
  private isPointerLocked = false;

  constructor(canvas: HTMLCanvasElement) {
    super();
    this.canvas = canvas;

    // Keyboard events
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);

    // Mouse events
    canvas.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    document.addEventListener('mousemove', this.onMouseMove);

    // Pointer lock
    canvas.addEventListener('click', this.requestPointerLock);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    this.keys.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private onMouseDown = (e: MouseEvent): void => {
    this.mouseButtons.add(e.button);
  };

  private onMouseUp = (e: MouseEvent): void => {
    this.mouseButtons.delete(e.button);
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (this.isPointerLocked) {
      this.mouseDeltaX += e.movementX * this.sensitivity;
      this.mouseDeltaY += e.movementY * this.sensitivity;
    }
  };

  private requestPointerLock = (): void => {
    this.canvas.requestPointerLock();
  };

  private onPointerLockChange = (): void => {
    this.isPointerLocked = document.pointerLockElement === this.canvas;
  };

  getState(): InputState {
    return {
      forward: this.keys.has('KeyW') || this.keys.has('ArrowUp'),
      backward: this.keys.has('KeyS') || this.keys.has('ArrowDown'),
      left: this.keys.has('KeyA') || this.keys.has('ArrowLeft'),
      right: this.keys.has('KeyD') || this.keys.has('ArrowRight'),
      jump: this.keys.has('Space'),
      sneak: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'),
      primaryAction: this.mouseButtons.has(0), // Left click
      secondaryAction: this.mouseButtons.has(2) // Right click
    };
  }

  getLookDelta(): LookDelta {
    const delta = { dx: this.mouseDeltaX, dy: this.mouseDeltaY };
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
    return delta;
  }

  isLocked(): boolean {
    return this.isPointerLocked;
  }

  setSensitivity(value: number): void {
    this.sensitivity = value;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    document.removeEventListener('mousemove', this.onMouseMove);
    this.canvas.removeEventListener('click', this.requestPointerLock);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);

    if (this.isPointerLocked) {
      document.exitPointerLock();
    }
  }
}
