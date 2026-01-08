export class Hotbar {
  private element: HTMLElement;
  private slots: HTMLElement[] = [];
  private selectedIndex = 0;
  private blockIds: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9]; // Stone, Grass, Dirt, Cobble, Planks, Brick, Sand, Gravel, Gold

  constructor() {
    this.element = document.createElement('div');
    this.element.id = 'hotbar';
    this.element.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      gap: 4px;
      padding: 4px;
      background: rgba(0, 0, 0, 0.5);
      border-radius: 4px;
      z-index: 150;
      pointer-events: auto;
    `;

    // Create slots
    for (let i = 0; i < 9; i++) {
      const slot = document.createElement('div');
      slot.style.cssText = `
        width: 50px;
        height: 50px;
        border: 2px solid rgba(255, 255, 255, 0.3);
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        cursor: pointer;
        background: rgba(0, 0, 0, 0.3);
      `;

      // Block preview (colored square)
      const preview = document.createElement('div');
      preview.style.cssText = `
        width: 36px;
        height: 36px;
        border-radius: 2px;
      `;
      preview.style.background = this.getBlockColor(this.blockIds[i]);
      slot.appendChild(preview);

      // Slot number
      const number = document.createElement('div');
      number.textContent = String(i + 1);
      number.style.cssText = `
        position: absolute;
        top: 2px;
        left: 4px;
        font-size: 10px;
        color: white;
        text-shadow: 1px 1px 1px black;
      `;
      slot.appendChild(number);

      // Click handler
      slot.addEventListener('click', () => this.selectSlot(i));
      slot.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.selectSlot(i);
      });

      this.slots.push(slot);
      this.element.appendChild(slot);
    }

    document.body.appendChild(this.element);
    this.updateSelection();

    // Keyboard shortcuts
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('wheel', this.onWheel);
  }

  private getBlockColor(blockId: number): string {
    const colors: Record<number, string> = {
      1: '#808080',  // Stone
      2: '#7EC850',  // Grass
      3: '#8B4513',  // Dirt
      4: '#696969',  // Cobblestone
      5: '#DEB887',  // Planks
      6: '#B22222',  // Brick
      7: '#F4E4A6',  // Sand
      8: '#A9A9A9',  // Gravel
      9: '#FFD700',  // Gold
    };
    return colors[blockId] || '#FF00FF';
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    const num = parseInt(e.key);
    if (num >= 1 && num <= 9) {
      this.selectSlot(num - 1);
    }
  };

  private onWheel = (e: WheelEvent): void => {
    if (e.deltaY > 0) {
      this.selectSlot((this.selectedIndex + 1) % 9);
    } else {
      this.selectSlot((this.selectedIndex + 8) % 9);
    }
  };

  selectSlot(index: number): void {
    this.selectedIndex = index;
    this.updateSelection();
  }

  private updateSelection(): void {
    this.slots.forEach((slot, i) => {
      if (i === this.selectedIndex) {
        slot.style.borderColor = 'white';
        slot.style.transform = 'scale(1.1)';
      } else {
        slot.style.borderColor = 'rgba(255, 255, 255, 0.3)';
        slot.style.transform = 'scale(1)';
      }
    });
  }

  getSelectedBlockId(): number {
    return this.blockIds[this.selectedIndex];
  }

  getSelectedIndex(): number {
    return this.selectedIndex;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('wheel', this.onWheel);
    this.element.remove();
  }
}
