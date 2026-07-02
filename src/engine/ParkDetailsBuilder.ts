import * as THREE from 'three';
import { Bench } from './Bench';
import { StreetLight } from './StreetLight';
import { TerraceHouse } from './TerraceHouse';
import { createTexturedMaterial, getSurfaceTexture } from './Textures';
import {
  PARK_BOUNDARY_HALF_DEPTH,
  PARK_BOUNDARY_HALF_WIDTH,
  PARK_PATHS,
  isOnParkPath,
  isStreetOpening,
} from './ParkLayout';

export function addLondonParkDetails(scene: THREE.Scene, streetLights: StreetLight[]) {
  const pathMaterial = createTexturedMaterial('path', 0xc9bda5, 38, 5, { roughness: 0.96 });
  const ironMaterial = new THREE.MeshStandardMaterial({ color: 0x111719, roughness: 0.55 });
  const stoneMaterial = new THREE.MeshStandardMaterial({ color: 0xa89478, roughness: 0.9 });
  const brickMaterials = [0x8d7462, 0x9a7d68, 0x74675d, 0x92705e].map(
    (color) => new THREE.MeshStandardMaterial({
      color,
      map: getSurfaceTexture('brick', 4, 5),
      roughness: 0.86,
    }),
  );

  for (const path of PARK_PATHS) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(path.width, 0.05, path.depth), pathMaterial);
    mesh.position.set(path.x, 0.075, path.z);
    mesh.rotation.y = path.rotation;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  addParkBoundaryRailings(scene, PARK_BOUNDARY_HALF_WIDTH, PARK_BOUNDARY_HALF_DEPTH, ironMaterial);

  for (const lamp of [
    [-74, 0, 54],
    [-32, 0, 64],
    [32, 0, 64],
    [74, 0, 54],
    [-84, 0, -46],
    [84, 0, -46],
  ] as const) {
    const streetLight = new StreetLight(new THREE.Vector3(...lamp), ironMaterial);
    scene.add(streetLight.group);
    streetLights.push(streetLight);
  }

  for (const bench of [
    [-58, 0, 48, 0.12],
    [58, 0, 48, -0.12],
    [-80, 0, -38, -0.18],
    [80, 0, -38, 0.18],
  ] as const) {
    if (isOnParkPath(bench[0], bench[2], 3)) continue;

    const newBench = new Bench(new THREE.Vector3(bench[0], bench[1], bench[2]), bench[3], ironMaterial, stoneMaterial);
    scene.add(newBench.group);
  }

  addCityHorizon(scene, streetLights, brickMaterials, ironMaterial);
}

function addCityHorizon(
  scene: THREE.Scene,
  streetLights: StreetLight[],
  brickMaterials: THREE.Material[],
  ironMaterial: THREE.Material,
) {
  const spacing = 14;
  const northZ = -PARK_BOUNDARY_HALF_DEPTH - 45;
  const southZ = PARK_BOUNDARY_HALF_DEPTH + 45;
  const westX = -PARK_BOUNDARY_HALF_WIDTH - 42;
  const eastX = PARK_BOUNDARY_HALF_WIDTH + 42;

  for (let x = -PARK_BOUNDARY_HALF_WIDTH - 34, index = 0; x <= PARK_BOUNDARY_HALF_WIDTH + 34; x += spacing, index += 1) {
    if (!isStreetOpening(x, northZ, 8)) {
      const house = new TerraceHouse(new THREE.Vector3(x, 0, northZ - (index % 2) * 2), {
        index,
        brickMaterials,
        rotationY: 0,
      });
      scene.add(house.group);
    }

    if (!isStreetOpening(x, southZ, 8)) {
      const house = new TerraceHouse(new THREE.Vector3(x, 0, southZ + (index % 2) * 2), {
        index: index + 30,
        brickMaterials,
        rotationY: Math.PI,
      });
      scene.add(house.group);
    }
  }

  for (let z = -PARK_BOUNDARY_HALF_DEPTH - 24, index = 0; z <= PARK_BOUNDARY_HALF_DEPTH + 24; z += spacing, index += 1) {
    if (!isStreetOpening(westX, z, 8)) {
      const house = new TerraceHouse(new THREE.Vector3(westX - (index % 2) * 2, 0, z), {
        index: index + 60,
        brickMaterials,
        rotationY: Math.PI / 2,
      });
      scene.add(house.group);
    }

    if (!isStreetOpening(eastX, z, 8)) {
      const house = new TerraceHouse(new THREE.Vector3(eastX + (index % 2) * 2, 0, z), {
        index: index + 90,
        brickMaterials,
        rotationY: -Math.PI / 2,
      });
      scene.add(house.group);
    }
  }

  const streetlightSpacing = 35;

  for (let x = -PARK_BOUNDARY_HALF_WIDTH - 25; x <= PARK_BOUNDARY_HALF_WIDTH + 25; x += streetlightSpacing) {
    if (!isStreetOpening(x, -122, 6)) {
      const streetLight = new StreetLight(new THREE.Vector3(x, 0, -122), ironMaterial, {
        castShadow: false,
        disableLight: true,
      });
      scene.add(streetLight.group);
      streetLights.push(streetLight);
    }
  }

  for (let x = -PARK_BOUNDARY_HALF_WIDTH - 25; x <= PARK_BOUNDARY_HALF_WIDTH + 25; x += streetlightSpacing) {
    if (!isStreetOpening(x, 122, 6)) {
      const streetLight = new StreetLight(new THREE.Vector3(x, 0, 122), ironMaterial, {
        castShadow: false,
        disableLight: true,
      });
      scene.add(streetLight.group);
      streetLights.push(streetLight);
    }
  }

  for (let z = -PARK_BOUNDARY_HALF_DEPTH - 25; z <= PARK_BOUNDARY_HALF_DEPTH + 25; z += streetlightSpacing) {
    if (!isStreetOpening(-158, z, 6)) {
      const streetLight = new StreetLight(new THREE.Vector3(-158, 0, z), ironMaterial, {
        castShadow: false,
        disableLight: true,
      });
      streetLight.group.rotation.y = Math.PI / 2;
      scene.add(streetLight.group);
      streetLights.push(streetLight);
    }
  }

  for (let z = -PARK_BOUNDARY_HALF_DEPTH - 25; z <= PARK_BOUNDARY_HALF_DEPTH + 25; z += streetlightSpacing) {
    if (!isStreetOpening(158, z, 6)) {
      const streetLight = new StreetLight(new THREE.Vector3(158, 0, z), ironMaterial, {
        castShadow: false,
        disableLight: true,
      });
      streetLight.group.rotation.y = Math.PI / 2;
      scene.add(streetLight.group);
      streetLights.push(streetLight);
    }
  }
}

function addParkBoundaryRailings(
  scene: THREE.Scene,
  halfWidth: number,
  halfDepth: number,
  material: THREE.Material,
) {
  const sideGaps = PARK_PATHS
    .filter((path) => path.width > path.depth)
    .map((path) => ({ center: path.z, width: path.depth + 8 }));
  const endGaps = PARK_PATHS
    .filter((path) => path.depth > path.width)
    .map((path) => ({ center: path.x, width: path.width + 8 }));

  const railMatrices: THREE.Matrix4[] = [];
  const postMatrices: THREE.Matrix4[] = [];
  const postCapMatrices: THREE.Matrix4[] = [];
  const picketMatrices: THREE.Matrix4[] = [];
  const picketCapMatrices: THREE.Matrix4[] = [];

  for (const x of [-halfWidth, halfWidth]) {
    for (const segment of createFenceRuns(-halfDepth, halfDepth, sideGaps)) {
      addFenceSegment(
        new THREE.Vector3(x, 0, segment.start),
        new THREE.Vector3(x, 0, segment.end),
        railMatrices,
        postMatrices,
        postCapMatrices,
        picketMatrices,
        picketCapMatrices,
      );
    }
  }

  for (const z of [-halfDepth, halfDepth]) {
    for (const segment of createFenceRuns(-halfWidth, halfWidth, endGaps)) {
      addFenceSegment(
        new THREE.Vector3(segment.start, 0, z),
        new THREE.Vector3(segment.end, 0, z),
        railMatrices,
        postMatrices,
        postCapMatrices,
        picketMatrices,
        picketCapMatrices,
      );
    }
  }

  addInstancedMesh(scene, 'fence_rail', new THREE.BoxGeometry(1.0, 1.0, 1.0), material, railMatrices);
  addInstancedMesh(scene, 'fence_post', new THREE.BoxGeometry(0.14, 2.3, 0.14), material, postMatrices);
  addInstancedMesh(scene, 'fence_post_cap', new THREE.ConeGeometry(0.10, 0.22, 6), material, postCapMatrices);
  addInstancedMesh(scene, 'fence_picket', new THREE.BoxGeometry(0.04, 1.8, 0.04), material, picketMatrices);
  addInstancedMesh(scene, 'fence_picket_cap', new THREE.ConeGeometry(0.04, 0.12, 4), material, picketCapMatrices);
}

function createFenceRuns(
  start: number,
  end: number,
  gaps: Array<{ center: number; width: number }>,
) {
  const runs: Array<{ start: number; end: number }> = [];
  let cursor = start;

  for (const gap of [...gaps].sort((a, b) => a.center - b.center)) {
    const gapStart = Math.max(start, gap.center - gap.width / 2);
    const gapEnd = Math.min(end, gap.center + gap.width / 2);

    if (gapStart > cursor) {
      runs.push({ start: cursor, end: gapStart });
    }

    cursor = Math.max(cursor, gapEnd);
  }

  if (cursor < end) {
    runs.push({ start: cursor, end });
  }

  return runs;
}

function addFenceSegment(
  start: THREE.Vector3,
  end: THREE.Vector3,
  railMatrices: THREE.Matrix4[],
  postMatrices: THREE.Matrix4[],
  postCapMatrices: THREE.Matrix4[],
  picketMatrices: THREE.Matrix4[],
  picketCapMatrices: THREE.Matrix4[],
) {
  const length = start.distanceTo(end);
  const isVerticalRun = Math.abs(start.x - end.x) < 0.01;
  const rotationY = isVerticalRun ? Math.PI / 2 : 0;
  const midpoint = start.clone().add(end).multiplyScalar(0.5);
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);

  const getWorldPos = (lx: number, ly: number, lz: number) => {
    return new THREE.Vector3(
      midpoint.x + lx * cos - lz * sin,
      ly,
      midpoint.z + lx * sin + lz * cos,
    );
  };

  for (const y of [0.25, 1.1, 1.95]) {
    railMatrices.push(new THREE.Matrix4().compose(
      getWorldPos(0, y, 0),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotationY, 0)),
      new THREE.Vector3(length, 0.05, 0.08),
    ));
  }

  const postCount = Math.max(2, Math.floor(length / 4));
  const halfLength = length / 2;

  for (let i = 0; i <= postCount; i += 1) {
    const postLocalX = -halfLength + (i / postCount) * length;
    postMatrices.push(new THREE.Matrix4().compose(
      getWorldPos(postLocalX, 1.15, 0),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotationY, 0)),
      new THREE.Vector3(1, 1, 1),
    ));

    postCapMatrices.push(new THREE.Matrix4().compose(
      getWorldPos(postLocalX, 2.41, 0),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotationY, 0)),
      new THREE.Vector3(1, 1, 1),
    ));

    if (i < postCount) {
      const nextPostLocalX = -halfLength + ((i + 1) / postCount) * length;
      const subDistance = nextPostLocalX - postLocalX;
      const pickets = Math.floor(subDistance / 0.65) - 1;
      const actualSpacing = subDistance / (pickets + 1);

      for (let p = 1; p <= pickets; p += 1) {
        const picketLocalX = postLocalX + p * actualSpacing;
        picketMatrices.push(new THREE.Matrix4().compose(
          getWorldPos(picketLocalX, 1.15, 0),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotationY, 0)),
          new THREE.Vector3(1, 1, 1),
        ));

        picketCapMatrices.push(new THREE.Matrix4().compose(
          getWorldPos(picketLocalX, 2.11, 0),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotationY, 0)),
          new THREE.Vector3(1, 1, 1),
        ));
      }
    }
  }
}

function addInstancedMesh(
  scene: THREE.Scene,
  name: string,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  matrices: THREE.Matrix4[],
) {
  if (matrices.length === 0) return;

  const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
  mesh.name = name;
  mesh.castShadow = false;
  matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
  scene.add(mesh);
}
