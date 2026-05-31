import * as THREE from 'three';
import { Horse } from '../engine/Horse';
import type { HorseColors } from '../engine/RaceClient';

interface PodiumPreview {
  canvas: HTMLCanvasElement;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  horse: Horse;
  clock: THREE.Clock;
  animationFrameId: number;
}

export class PodiumPreviewRenderer {
  private readonly activePreviews: Record<string, PodiumPreview> = {};

  init(canvas: HTMLCanvasElement, position: string, colors: HorseColors) {
    if (this.activePreviews[position]) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, canvas.clientWidth / canvas.clientHeight, 0.1, 100);
    camera.position.set(-0.2, 1.35, 4.6);
    camera.lookAt(0.3, 1.1, 0);

    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
    });
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    scene.add(new THREE.AmbientLight(0xffffff, 1.8));

    const dirLight = new THREE.DirectionalLight(0xffffff, 2.5);
    dirLight.position.set(5, 10, 7);
    scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0xffeedd, 1.2);
    fillLight.position.set(-5, 2, -2);
    scene.add(fillLight);

    const horse = new Horse({
      color: 0xffffff,
      index: getPreviewHorseIndex(position),
      initialProgress: 0,
      speed: 0.02,
      laneOffset: 0,
      name: `podium-${position}`,
      colors,
    });
    horse.group.scale.multiplyScalar(0.5);
    scene.add(horse.group);

    const clock = new THREE.Clock();
    let animationFrameId = 0;
    let previewRotation = -Math.PI / 2;

    const animate = () => {
      const delta = Math.min(clock.getDelta(), 0.033);
      horse.updatePreview(delta, 0.02);
      previewRotation += delta * 0.45;
      horse.group.rotation.y = previewRotation;

      renderer.render(scene, camera);
      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    this.activePreviews[position] = {
      canvas,
      scene,
      camera,
      renderer,
      horse,
      clock,
      animationFrameId,
    };
  }

  cleanup(position: string) {
    const prev = this.activePreviews[position];
    if (!prev) return;

    cancelAnimationFrame(prev.animationFrameId);
    prev.renderer.dispose();

    prev.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((material) => material.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });

    delete this.activePreviews[position];
  }

  cleanupAll() {
    Object.keys(this.activePreviews).forEach((position) => this.cleanup(position));
  }
}

function getPreviewHorseIndex(position: string) {
  if (position === 'first') return 0;
  if (position === 'second') return 1;
  return 2;
}
