export interface InputState {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
  sneak: boolean;
  primaryAction: boolean;
  secondaryAction: boolean;
}

export interface LookDelta {
  dx: number;
  dy: number;
}

export abstract class InputProvider {
  abstract getState(): InputState;
  abstract getLookDelta(): LookDelta;
  abstract dispose(): void;
}

export class InputManager {
  private providers: InputProvider[] = [];

  addProvider(provider: InputProvider): void {
    this.providers.push(provider);
  }

  removeProvider(provider: InputProvider): void {
    const index = this.providers.indexOf(provider);
    if (index !== -1) {
      this.providers.splice(index, 1);
    }
  }

  getState(): InputState {
    const state: InputState = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      jump: false,
      sneak: false,
      primaryAction: false,
      secondaryAction: false
    };

    for (const provider of this.providers) {
      const ps = provider.getState();
      state.forward = state.forward || ps.forward;
      state.backward = state.backward || ps.backward;
      state.left = state.left || ps.left;
      state.right = state.right || ps.right;
      state.jump = state.jump || ps.jump;
      state.sneak = state.sneak || ps.sneak;
      state.primaryAction = state.primaryAction || ps.primaryAction;
      state.secondaryAction = state.secondaryAction || ps.secondaryAction;
    }

    return state;
  }

  getLookDelta(): LookDelta {
    let dx = 0;
    let dy = 0;

    for (const provider of this.providers) {
      const delta = provider.getLookDelta();
      dx += delta.dx;
      dy += delta.dy;
    }

    return { dx, dy };
  }

  getInputBitfield(): number {
    const state = this.getState();
    let bits = 0;
    if (state.forward) bits |= 1 << 0;
    if (state.backward) bits |= 1 << 1;
    if (state.left) bits |= 1 << 2;
    if (state.right) bits |= 1 << 3;
    if (state.jump) bits |= 1 << 4;
    if (state.sneak) bits |= 1 << 5;
    return bits;
  }

  dispose(): void {
    for (const provider of this.providers) {
      provider.dispose();
    }
    this.providers = [];
  }
}
