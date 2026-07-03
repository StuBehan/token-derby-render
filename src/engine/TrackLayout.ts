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

export function getDynamicLaneOffset(laneIndex: number, totalHorses: number) {
  const innerLimit = 6.667;
  const outerLimit = -6.667;
  if (totalHorses <= 1) return innerLimit;
  if (totalHorses <= 6) {
    return 6.667 - laneIndex * 2.667;
  }
  const spacing = (innerLimit - outerLimit) / (totalHorses - 1);
  return innerLimit - laneIndex * spacing;
}

export function createTrackCurve() {
  return createStadiumCurve(TRACK_STRAIGHT_HALF_LENGTH, TRACK_CENTER_RADIUS, 0.08, 28);
}

// Scene units are treated as metres elsewhere (grandstand, horse, track dimensions are all sized
// relative to each other on that assumption), so a horse's "progress" speed (fraction of one lap
// per second) converts to real-world mph via the track's actual lap length. Computed once from the
// curve's true arc length rather than the stadium's raw perimeter, since the closed Catmull-Rom
// spline is slightly longer/shorter than the polygon it's fit to.
const TRACK_LAP_LENGTH_METERS = createTrackCurve().getLength();
const METERS_PER_SECOND_TO_MPH = 2.2369362920544;

export function progressPerSecondToMph(progressPerSecond: number) {
  return progressPerSecond * TRACK_LAP_LENGTH_METERS * METERS_PER_SECOND_TO_MPH;
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
