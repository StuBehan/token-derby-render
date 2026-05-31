import * as THREE from 'three';
import { FinishLine } from './FinishLine';
import {
  TRACK_CENTER_RADIUS,
  TRACK_INNER_RADIUS,
  TRACK_OUTER_RADIUS,
  TRACK_STRAIGHT_HALF_LENGTH,
} from './TrackLayout';

export function createFinishLine() {
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xd7ae3f, roughness: 0.35, metalness: 0.6 });
  const redMat = new THREE.MeshStandardMaterial({ color: 0xb8493b, roughness: 0.5 });
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0xa89478, roughness: 0.9 });
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x111719, roughness: 0.55 });
  const bannerMat = new THREE.MeshStandardMaterial({ color: 0xf5efe0, roughness: 0.45 });

  const finishLine = new FinishLine(
    new THREE.Vector3(-TRACK_STRAIGHT_HALF_LENGTH, 0, -TRACK_CENTER_RADIUS),
    { whiteMat, goldMat, redMat, stoneMat, ironMat, bannerMat },
    {
      trackWidth: TRACK_OUTER_RADIUS - TRACK_INNER_RADIUS,
      trackInnerRadius: TRACK_INNER_RADIUS,
      trackOuterRadius: TRACK_OUTER_RADIUS,
      trackCenterRadius: TRACK_CENTER_RADIUS,
    },
  );
  finishLine.group.name = 'finish_line';
  return finishLine.group;
}
