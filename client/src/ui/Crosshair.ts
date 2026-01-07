export class Crosshair {
  private element: HTMLElement;

  constructor() {
    this.element = document.createElement('div');
    this.element.id = 'crosshair';
    this.element.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 2px;
      height: 20px;
      background: white;
      z-index: 50;
      pointer-events: none;
      mix-blend-mode: difference;
    `;

    // Horizontal bar
    const horizontal = document.createElement('div');
    horizontal.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 20px;
      height: 2px;
      background: white;
    `;
    this.element.appendChild(horizontal);

    document.body.appendChild(this.element);
  }

  show(): void {
    this.element.style.display = 'block';
  }

  hide(): void {
    this.element.style.display = 'none';
  }

  dispose(): void {
    this.element.remove();
  }
}
