export type ParkPath = {
  width: number;
  depth: number;
  x: number;
  z: number;
  rotation: number;
};

export const TAU = Math.PI * 2;
export const PARK_BOUNDARY_HALF_WIDTH = 126;
export const PARK_BOUNDARY_HALF_DEPTH = 86;
export const PARK_PATHS: ParkPath[] = [
  { width: 360, depth: 6.2, x: 0, z: 60, rotation: 0.03 },
  { width: 360, depth: 5.2, x: 12, z: -70, rotation: -0.04 },
  { width: 5.8, depth: 260, x: -72, z: 0, rotation: 0.04 },
];

export function isOnParkPath(x: number, z: number, margin: number) {
  return PARK_PATHS.some((path) => {
    const cos = Math.cos(-path.rotation);
    const sin = Math.sin(-path.rotation);
    const offsetX = x - path.x;
    const offsetZ = z - path.z;
    const localX = offsetX * cos - offsetZ * sin;
    const localZ = offsetX * sin + offsetZ * cos;

    return (
      Math.abs(localX) <= path.width / 2 + margin &&
      Math.abs(localZ) <= path.depth / 2 + margin
    );
  });
}

export function isStreetOpening(x: number, z: number, margin: number) {
  return PARK_PATHS.some((path) => {
    if (path.width > path.depth) {
      return Math.abs(z - path.z) < path.depth / 2 + margin;
    }

    return Math.abs(x - path.x) < path.width / 2 + margin;
  });
}

export function createPathAwareHills<T extends { x: number; z: number; width: number; height: number; depth: number }>(hills: T[]) {
  const result: T[] = [];

  for (const hill of hills) {
    const blockingPath = PARK_PATHS.find((path) => doesFootprintOverlapPath(
      hill.x,
      hill.z,
      hill.width,
      hill.depth,
      path,
      3,
    ));

    if (!blockingPath) {
      result.push(hill);
      continue;
    }

    if (blockingPath.width > blockingPath.depth) {
      const splitOffset = hill.depth * 0.72 + blockingPath.depth / 2;
      const splitDepth = Math.max(3.5, hill.depth * 0.48);
      const splitHeight = hill.height * 0.72;
      result.push(
        { ...hill, z: hill.z - splitOffset, depth: splitDepth, height: splitHeight },
        { ...hill, z: hill.z + splitOffset, depth: splitDepth, height: splitHeight },
      );
      continue;
    }

    const splitOffset = hill.width * 0.56 + blockingPath.width / 2;
    const splitWidth = Math.max(20, hill.width * 0.42);
    const splitHeight = hill.height * 0.74;
    result.push(
      { ...hill, x: hill.x - splitOffset, width: splitWidth, height: splitHeight },
      { ...hill, x: hill.x + splitOffset, width: splitWidth, height: splitHeight },
    );
  }

  return result.map((hill) => moveHillInsideTownhouseKeepout(hill)).filter((hill) => (
    hill.width > 4 &&
    hill.depth > 2 &&
    !PARK_PATHS.some((path) => doesFootprintOverlapPath(hill.x, hill.z, hill.width, hill.depth, path, 1.5))
  ));
}

function moveHillInsideTownhouseKeepout<T extends { x: number; z: number; width: number; depth: number }>(hill: T) {
  const margin = 7;
  const northHouseZ = -PARK_BOUNDARY_HALF_DEPTH - 45;
  const southHouseZ = PARK_BOUNDARY_HALF_DEPTH + 45;
  const westHouseX = -PARK_BOUNDARY_HALF_WIDTH - 42;
  const eastHouseX = PARK_BOUNDARY_HALF_WIDTH + 42;
  const moved = { ...hill };

  if (moved.z - moved.depth / 2 <= northHouseZ + margin) {
    moved.z = northHouseZ + margin + moved.depth / 2;
  }

  if (moved.z + moved.depth / 2 >= southHouseZ - margin) {
    moved.z = southHouseZ - margin - moved.depth / 2;
  }

  if (moved.x - moved.width / 2 <= westHouseX + margin) {
    moved.x = westHouseX + margin + moved.width / 2;
  }

  if (moved.x + moved.width / 2 >= eastHouseX - margin) {
    moved.x = eastHouseX - margin - moved.width / 2;
  }

  return moved;
}

function doesFootprintOverlapPath(
  x: number,
  z: number,
  width: number,
  depth: number,
  path: ParkPath,
  margin: number,
) {
  const cos = Math.cos(-path.rotation);
  const sin = Math.sin(-path.rotation);
  const offsetX = x - path.x;
  const offsetZ = z - path.z;
  const localX = offsetX * cos - offsetZ * sin;
  const localZ = offsetX * sin + offsetZ * cos;
  const hillHalfWidth = width / 2;
  const hillHalfDepth = depth / 2;

  return (
    Math.abs(localX) <= path.width / 2 + hillHalfWidth + margin &&
    Math.abs(localZ) <= path.depth / 2 + hillHalfDepth + margin
  );
}
