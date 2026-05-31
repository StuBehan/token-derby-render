import * as THREE from 'three';
import { Horse } from './Horse';

export class HorsePicker {
  private readonly mouse = new THREE.Vector2();
  private readonly raycaster = new THREE.Raycaster();
  private hoveredHorse: Horse | null = null;

  constructor(
    private readonly element: HTMLElement,
    private readonly camera: THREE.Camera,
    private readonly horses: Horse[],
  ) {}

  updateHover(event: PointerEvent) {
    const horse = this.pick(event);
    if (horse === this.hoveredHorse) return;

    this.hoveredHorse?.setHovered(false);
    this.hoveredHorse = horse;
    this.hoveredHorse?.setHovered(true);
  }

  clearHover() {
    this.hoveredHorse?.setHovered(false);
    this.hoveredHorse = null;
  }

  pick(event: PointerEvent) {
    this.updateMouse(event);
    this.raycaster.setFromCamera(this.mouse, this.camera);

    const horseGroups = this.horses.map((horse) => horse.group);
    const intersects = this.raycaster.intersectObjects(horseGroups, true);
    if (intersects.length === 0) return null;

    let object: THREE.Object3D | null = intersects[0].object;
    while (object) {
      const horse = this.horses.find((candidate) => candidate.group === object);
      if (horse) return horse;
      object = object.parent;
    }

    return null;
  }

  private updateMouse(event: PointerEvent) {
    const rect = this.element.getBoundingClientRect();
    this.mouse.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
  }
}
