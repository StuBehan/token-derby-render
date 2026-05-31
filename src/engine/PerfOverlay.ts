import * as THREE from 'three';

interface MouseIntersect {
  x: number;
  y: number;
  z: number;
  objectName: string;
}

export class PerfOverlay {
  public readonly enabled: boolean;

  private readonly panel = document.createElement('div');
  private readonly mouseScreenPos = new THREE.Vector2(0, 0);
  private readonly raycaster = new THREE.Raycaster();
  private mouseIntersect: MouseIntersect | null = null;
  private frameCount = 0;
  private elapsed = 0;
  private objectCount = 0;
  private lightCount = 0;

  constructor(
    private readonly host: HTMLElement,
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
  ) {
    this.enabled = new URLSearchParams(window.location.search).get('debug') === 'perf';

    if (this.enabled) {
      this.panel.className = 'perf-panel';
      this.panel.textContent = 'Perf: measuring...';
      this.host.appendChild(this.panel);
    }
  }

  updateMouse(event: PointerEvent) {
    if (!this.enabled) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouseScreenPos.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
  }

  update(delta: number) {
    if (!this.enabled) return;

    this.frameCount += 1;
    this.elapsed += delta;

    if (this.elapsed < 0.25) return;

    this.updateSceneCounts();
    this.updateMouseIntersection();

    const fps = Math.round(this.frameCount / this.elapsed);
    const { render, memory } = this.renderer.info;
    const coordsText = this.mouseIntersect
      ? `Mouse: X: ${this.mouseIntersect.x.toFixed(2)}, Y: ${this.mouseIntersect.y.toFixed(2)}, Z: ${this.mouseIntersect.z.toFixed(2)} (${this.mouseIntersect.objectName})`
      : 'Mouse: no intersection';

    this.panel.innerHTML = [
      `<strong>${fps} FPS</strong>`,
      `${render.calls} calls`,
      `${render.triangles.toLocaleString()} tris`,
      `${this.objectCount.toLocaleString()} objects`,
      `${this.lightCount} lights`,
      `${memory.geometries} geos`,
      `${memory.textures} tex`,
      coordsText,
    ].join('<br>');

    this.frameCount = 0;
    this.elapsed = 0;
  }

  dispose() {
    if (this.enabled) {
      this.panel.remove();
    }
  }

  private updateSceneCounts() {
    let objects = 0;
    let lights = 0;

    this.scene.traverse((object) => {
      if (!object.visible) return;
      objects += 1;
      if (object instanceof THREE.Light) {
        lights += 1;
      }
    });

    this.objectCount = objects;
    this.lightCount = lights;
  }

  private updateMouseIntersection() {
    this.raycaster.setFromCamera(this.mouseScreenPos, this.camera);
    const intersects = this.raycaster.intersectObjects(this.scene.children, true);

    if (intersects.length === 0) {
      this.mouseIntersect = null;
      return;
    }

    const hit = intersects[0];
    let name = '';
    let current: THREE.Object3D | null = hit.object;

    while (current) {
      if (current.name) {
        name = current.name;
        break;
      }
      current = current.parent;
    }

    this.mouseIntersect = {
      x: hit.point.x,
      y: hit.point.y,
      z: hit.point.z,
      objectName: name || hit.object.type,
    };
  }
}
