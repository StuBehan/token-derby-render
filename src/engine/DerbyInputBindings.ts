import type { Horse } from './Horse';
import type { CameraController } from './CameraController';
import type { HorsePicker } from './HorsePicker';
import type { PerfOverlay } from './PerfOverlay';

interface DerbyInputBindingsConfig {
  domElement: HTMLElement;
  cameraController: CameraController;
  horsePicker: HorsePicker;
  perfOverlay: PerfOverlay;
  getSelectedHorse: () => Horse | null;
  selectHorse: (horse: Horse | null) => void;
}

export class DerbyInputBindings {
  private readonly domElement: HTMLElement;
  private readonly cameraController: CameraController;
  private readonly horsePicker: HorsePicker;
  private readonly perfOverlay: PerfOverlay;
  private readonly getSelectedHorse: () => Horse | null;
  private readonly selectHorse: (horse: Horse | null) => void;
  private isPointerLooking = false;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private pointerDownX = 0;
  private pointerDownY = 0;

  constructor(config: DerbyInputBindingsConfig) {
    this.domElement = config.domElement;
    this.cameraController = config.cameraController;
    this.horsePicker = config.horsePicker;
    this.perfOverlay = config.perfOverlay;
    this.getSelectedHorse = config.getSelectedHorse;
    this.selectHorse = config.selectHorse;

    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    this.domElement.addEventListener('pointerdown', this.handlePointerDown);
    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);
    window.addEventListener('pointercancel', this.handlePointerUp);
    this.domElement.addEventListener('pointerleave', this.handlePointerLeave);
  }

  dispose() {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    this.domElement.removeEventListener('pointerdown', this.handlePointerDown);
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
    window.removeEventListener('pointercancel', this.handlePointerUp);
    this.domElement.removeEventListener('pointerleave', this.handlePointerLeave);
  }

  private handleKeyDown = (event: KeyboardEvent) => {
    if (!isCameraKey(event.key)) return;

    event.preventDefault();
    this.cameraController.handleKeyDown(event.key, this.getSelectedHorse());
  };

  private handleKeyUp = (event: KeyboardEvent) => {
    if (!isCameraKey(event.key)) return;

    event.preventDefault();
    this.cameraController.handleKeyUp(event.key);
  };

  private handlePointerDown = (event: PointerEvent) => {
    const selectedHorse = this.getSelectedHorse();
    if (!this.cameraController.beginPointerLook(selectedHorse)) return;

    this.isPointerLooking = true;
    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;
    this.pointerDownX = event.clientX;
    this.pointerDownY = event.clientY;
    this.domElement.setPointerCapture(event.pointerId);
  };

  private handlePointerMove = (event: PointerEvent) => {
    this.perfOverlay.updateMouse(event);

    if (this.isPointerLooking) {
      const deltaX = event.clientX - this.lastPointerX;
      const deltaY = event.clientY - this.lastPointerY;
      this.lastPointerX = event.clientX;
      this.lastPointerY = event.clientY;

      this.cameraController.dragPointerLook(deltaX, deltaY, this.getSelectedHorse());
    } else {
      this.horsePicker.updateHover(event);
    }
  };

  private handlePointerLeave = () => {
    this.horsePicker.clearHover();
  };

  private handlePointerUp = (event: PointerEvent) => {
    this.isPointerLooking = false;

    if (this.domElement.hasPointerCapture(event.pointerId)) {
      this.domElement.releasePointerCapture(event.pointerId);
    }

    const deltaX = Math.abs(event.clientX - this.pointerDownX);
    const deltaY = Math.abs(event.clientY - this.pointerDownY);
    if (deltaX < 5 && deltaY < 5) {
      this.selectHorse(this.horsePicker.pick(event));
    }
  };
}

function isCameraKey(key: string): key is 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown' {
  return key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowDown';
}
