import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createTexturedMaterial } from '../Textures';

/** Fills the ground beyond the park's grass boundary with a plain concrete apron, shared by every location's skyline. */
export function addHorizonGround(group: THREE.Object3D) {
  const concreteMaterial = createTexturedMaterial('concrete', 0x85827a, 34, 8, {
    roughness: 0.94,
  });
  const grassHalfWidth = 180;
  const grassHalfDepth = 130;
  const northOuterZ = -212;
  const southOuterZ = 212;
  const westOuterX = -232;
  const eastOuterX = 232;
  const slabs = [
    {
      width: eastOuterX - westOuterX,
      depth: -grassHalfDepth - northOuterZ,
      x: 0,
      z: (northOuterZ - grassHalfDepth) / 2,
    },
    {
      width: eastOuterX - westOuterX,
      depth: southOuterZ - grassHalfDepth,
      x: 0,
      z: (southOuterZ + grassHalfDepth) / 2,
    },
    {
      width: -grassHalfWidth - westOuterX,
      depth: grassHalfDepth * 2,
      x: (westOuterX - grassHalfWidth) / 2,
      z: 0,
    },
    {
      width: eastOuterX - grassHalfWidth,
      depth: grassHalfDepth * 2,
      x: (eastOuterX + grassHalfWidth) / 2,
      z: 0,
    },
  ];

  // Merge all 4 ground slabs into a single mesh
  const groundGeoms: THREE.BufferGeometry[] = [];
  for (const slab of slabs) {
    const g = new THREE.PlaneGeometry(slab.width, slab.depth).clone();
    g.applyMatrix4(
      new THREE.Matrix4().compose(
        new THREE.Vector3(slab.x, -0.01, slab.z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)),
        new THREE.Vector3(1, 1, 1),
      ),
    );
    groundGeoms.push(g);
  }
  const merged = mergeGeometries(groundGeoms);
  const groundMesh = new THREE.Mesh(merged, concreteMaterial);
  groundMesh.receiveShadow = true;
  groundGeoms.forEach((g) => g.dispose());
  group.add(groundMesh);
}
