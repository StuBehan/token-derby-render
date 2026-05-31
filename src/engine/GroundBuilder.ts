import * as THREE from 'three';
import { createTexturedMaterial } from './Textures';
import { TRACK_INNER_RADIUS, TRACK_STRAIGHT_HALF_LENGTH, createStadiumShape } from './TrackLayout';

export function addGroundSurfaces(scene: THREE.Scene) {
  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(360, 260),
    createTexturedMaterial('grass', 0x4f7b3f, 46, 34, { roughness: 0.95 }),
  );
  grass.name = 'grass';
  grass.rotation.x = -Math.PI / 2;
  grass.receiveShadow = true;
  scene.add(grass);

  const infield = new THREE.Mesh(
    new THREE.ShapeGeometry(createStadiumShape(TRACK_STRAIGHT_HALF_LENGTH, TRACK_INNER_RADIUS), 96),
    createTexturedMaterial('infield', 0x6d934a, 14, 14, { roughness: 0.9 }),
  );
  infield.name = 'infield';
  infield.rotation.x = -Math.PI / 2;
  infield.position.y = 0.02;
  infield.receiveShadow = true;
  scene.add(infield);
}
