import * as THREE from 'three';
import { Horse } from './Horse';

export interface ScreenPosition {
  x: number;
  y: number;
  isBehind: boolean;
}

export function getSelectedHorseScreenPosition(
  horse: Horse | null,
  camera: THREE.Camera,
  scratch: THREE.Vector3,
): ScreenPosition | null {
  if (!horse) return null;

  horse.group.getWorldPosition(scratch);
  scratch.y += 3.4;
  scratch.project(camera);

  return {
    x: (scratch.x * 0.5 + 0.5) * 100,
    y: (-scratch.y * 0.5 + 0.5) * 100,
    isBehind: scratch.z > 1,
  };
}
