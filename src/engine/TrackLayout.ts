import * as THREE from 'three';

export const TRACK_STRAIGHT_HALF_LENGTH = 31;
export const TRACK_CENTER_RADIUS = 24;
export const TRACK_INNER_RADIUS = 16;
export const TRACK_OUTER_RADIUS = 32;
export const TRACK_LANE_COUNT = 6;
export const TRACK_LANE_WIDTH = (TRACK_OUTER_RADIUS - TRACK_INNER_RADIUS) / TRACK_LANE_COUNT;

export function getLaneCenterRadius(laneIndex: number) {
  return TRACK_INNER_RADIUS + TRACK_LANE_WIDTH * (laneIndex + 0.5);
}

export function getLaneCenterOffset(laneIndex: number) {
  return TRACK_CENTER_RADIUS - getLaneCenterRadius(laneIndex);
}

export function createTrackCurve() {
  return createStadiumCurve(TRACK_STRAIGHT_HALF_LENGTH, TRACK_CENTER_RADIUS, 0.08, 28);
}

export function createStadiumShape(halfStraightLength: number, radius: number) {
  return createStadiumPath(halfStraightLength, radius, false) as THREE.Shape;
}

export function createStadiumPath(halfStraightLength: number, radius: number, reverse: boolean) {
  const path = reverse ? new THREE.Path() : new THREE.Shape();

  if (reverse) {
    path.moveTo(-halfStraightLength, -radius);
    path.absarc(-halfStraightLength, 0, radius, -Math.PI / 2, Math.PI / 2, true);
    path.lineTo(halfStraightLength, radius);
    path.absarc(halfStraightLength, 0, radius, Math.PI / 2, -Math.PI / 2, true);
    path.lineTo(-halfStraightLength, -radius);
    return path;
  }

  path.moveTo(-halfStraightLength, -radius);
  path.lineTo(halfStraightLength, -radius);
  path.absarc(halfStraightLength, 0, radius, -Math.PI / 2, Math.PI / 2, false);
  path.lineTo(-halfStraightLength, radius);
  path.absarc(-halfStraightLength, 0, radius, Math.PI / 2, Math.PI * 1.5, false);
  path.lineTo(-halfStraightLength, -radius);
  return path;
}

export function createStadiumCurve(
  halfStraightLength: number,
  radius: number,
  y: number,
  segmentCount: number,
) {
  const points: THREE.Vector3[] = [];

  for (let index = 0; index <= segmentCount; index += 1) {
    const t = index / segmentCount;
    points.push(new THREE.Vector3(
      -halfStraightLength + t * halfStraightLength * 2,
      y,
      -radius,
    ));
  }

  for (let index = 1; index <= segmentCount; index += 1) {
    const angle = -Math.PI / 2 + (index / segmentCount) * Math.PI;
    points.push(new THREE.Vector3(
      halfStraightLength + Math.cos(angle) * radius,
      y,
      Math.sin(angle) * radius,
    ));
  }

  for (let index = 1; index <= segmentCount; index += 1) {
    const t = index / segmentCount;
    points.push(new THREE.Vector3(
      halfStraightLength - t * halfStraightLength * 2,
      y,
      radius,
    ));
  }

  for (let index = 1; index <= segmentCount; index += 1) {
    const angle = Math.PI / 2 + (index / segmentCount) * Math.PI;
    points.push(new THREE.Vector3(
      -halfStraightLength + Math.cos(angle) * radius,
      y,
      Math.sin(angle) * radius,
    ));
  }

  return new THREE.CatmullRomCurve3(points, true, 'centripetal');
}
