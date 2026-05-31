import * as THREE from 'three';
import { createTexturedMaterial } from './Textures';
import {
  TRACK_INNER_RADIUS,
  TRACK_LANE_COUNT,
  TRACK_LANE_WIDTH,
  TRACK_OUTER_RADIUS,
  TRACK_STRAIGHT_HALF_LENGTH,
  createStadiumCurve,
  createStadiumPath,
  createStadiumShape,
} from './TrackLayout';

export function addTrackSurface(scene: THREE.Scene) {
  const trackShape = createStadiumShape(TRACK_STRAIGHT_HALF_LENGTH, TRACK_OUTER_RADIUS);
  const infieldHole = createStadiumPath(TRACK_STRAIGHT_HALF_LENGTH, TRACK_INNER_RADIUS, true);
  trackShape.holes.push(infieldHole);

  const track = new THREE.Mesh(
    new THREE.ShapeGeometry(trackShape, 128),
    createTexturedMaterial('track', 0xa46d3f, 18, 18, { roughness: 0.98 }),
  );
  track.name = 'track';
  track.rotation.x = -Math.PI / 2;
  track.position.y = 0.04;
  track.receiveShadow = true;
  scene.add(track);

  const laneMaterial = new THREE.MeshStandardMaterial({ color: 0xd7b285, roughness: 0.85 });
  for (let laneIndex = 1; laneIndex < TRACK_LANE_COUNT; laneIndex += 1) {
    const laneRadius = TRACK_INNER_RADIUS + TRACK_LANE_WIDTH * laneIndex;
    const laneLine = new THREE.Mesh(
      new THREE.TubeGeometry(
        createStadiumCurve(TRACK_STRAIGHT_HALF_LENGTH, laneRadius, 0.11, 28),
        192,
        0.035,
        6,
        true,
      ),
      laneMaterial,
    );
    laneLine.name = `lane_line_${laneIndex}`;
    laneLine.receiveShadow = true;
    scene.add(laneLine);
  }
}

export function addTrackRails(scene: THREE.Scene) {
  const railMaterial = new THREE.MeshStandardMaterial({ color: 0xf5efe0, roughness: 0.5 });
  const railLines = [
    { radius: TRACK_INNER_RADIUS - 0.85 },
    { radius: TRACK_OUTER_RADIUS + 0.65 },
  ];

  railLines.forEach(({ radius }) => {
    for (const height of [0.82, 1.42]) {
      const rail = new THREE.Mesh(
        new THREE.TubeGeometry(
          createStadiumCurve(TRACK_STRAIGHT_HALF_LENGTH, radius, height, 28),
          192,
          0.09,
          8,
          true,
        ),
        railMaterial,
      );
      rail.name = 'track_rail';
      rail.castShadow = true;
      scene.add(rail);
    }
  });

  const postGeom = new THREE.CylinderGeometry(0.11, 0.14, 1.8, 8);
  const postMatrices: THREE.Matrix4[] = [];

  railLines.forEach(({ radius }) => {
    const curve = createStadiumCurve(TRACK_STRAIGHT_HALF_LENGTH, radius, 0.9, 28);
    for (let index = 0; index < 76; index += 1) {
      const pos = curve.getPointAt(index / 76);
      const mat = new THREE.Matrix4().makeTranslation(pos.x, pos.y, pos.z);
      postMatrices.push(mat);
    }
  });

  if (postMatrices.length > 0) {
    const instancedPosts = new THREE.InstancedMesh(postGeom, railMaterial, postMatrices.length);
    instancedPosts.name = 'track_rail_post';
    instancedPosts.castShadow = true;
    postMatrices.forEach((m, idx) => instancedPosts.setMatrixAt(idx, m));
    scene.add(instancedPosts);
  }
}
