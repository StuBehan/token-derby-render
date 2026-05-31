import * as THREE from 'three';
import { createTexturedMaterial, getSurfaceTexture } from './Textures';
import { TAU, createPathAwareHills, isOnParkPath } from './ParkLayout';

export function addParkTerrain(scene: THREE.Scene) {
  const hillMaterial = createTexturedMaterial('hill', 0x637854, 8, 3, { roughness: 1 });
  const farHillMaterial = createTexturedMaterial('hill', 0x819071, 7, 3, { roughness: 1 });

  const hills = [
    { x: -96, z: -108, width: 92, height: 15, depth: 10, color: farHillMaterial },
    { x: 8, z: -116, width: 128, height: 19, depth: 12, color: hillMaterial },
    { x: 106, z: -102, width: 78, height: 13, depth: 10, color: farHillMaterial },
    { x: -120, z: 100, width: 40, height: 8.6, depth: 15, color: hillMaterial },
    { x: 80, z: 104, width: 118, height: 16, depth: 11, color: hillMaterial },
  ];

  for (const hill of createPathAwareHills(hills)) {
    const mound = new THREE.Mesh(
      new THREE.SphereGeometry(1, 24, 10),
      hill.color,
    );
    mound.scale.set(hill.width, hill.height, hill.depth);
    mound.position.set(hill.x, -3.6, hill.z);
    mound.receiveShadow = true;
    scene.add(mound);
  }

  const canopyMaterials = [0x2f4a2e, 0x41643a, 0x5d7446].map(
    (color) => new THREE.MeshStandardMaterial({
      color,
      map: getSurfaceTexture('leaves', 3, 3),
      roughness: 0.88,
    }),
  );
  const trunkMaterial = createTexturedMaterial('bark', 0x483626, 2, 6, { roughness: 0.88 });

  const trunkMatrices: THREE.Matrix4[] = [];
  const pineMatrices: THREE.Matrix4[][] = canopyMaterials.map(() => []);
  const deciduousMatrices: THREE.Matrix4[][] = canopyMaterials.map(() => []);

  let placedTrees = 0;
  const rings = [
    { rx: 132, rz: 88, count: 90 },
    { rx: 144, rz: 98, count: 110 },
    { rx: 156, rz: 108, count: 130 },
    { rx: 168, rz: 118, count: 150 },
  ];

  for (let r = 0; r < rings.length; r += 1) {
    const ring = rings[r];
    for (let i = 0; i < ring.count; i += 1) {
      const angle = (i / ring.count) * TAU;
      const jitterRadius = Math.sin(i * 2.3 + r * 7.1) * 3.5;
      const x = Math.cos(angle) * (ring.rx + jitterRadius);
      const z = Math.sin(angle) * (ring.rz + jitterRadius);

      if (isOnParkPath(x, z, 5.0)) continue;
      if (Math.abs(x) < 95 && Math.abs(z) < 62) continue;

      const seedIndex = placedTrees;
      const height = 6.4 + (seedIndex % 5) * 0.75;
      const canopyRadius = 3.2 + (seedIndex % 3) * 0.42;
      const isPine = seedIndex % 3 === 0;
      const matIdx = seedIndex % canopyMaterials.length;

      trunkMatrices.push(new THREE.Matrix4().compose(
        new THREE.Vector3(x, 0.4, z),
        new THREE.Quaternion(),
        new THREE.Vector3(0.42, 0.8, 0.42),
      ));

      const shaftHeight = height - 0.8;
      const shaftPosY = (height + 0.8) / 2 - 0.4;
      trunkMatrices.push(new THREE.Matrix4().compose(
        new THREE.Vector3(x, shaftPosY, z),
        new THREE.Quaternion(),
        new THREE.Vector3(0.24, shaftHeight, 0.24),
      ));

      if (isPine) {
        const layers = 3;
        const layerSpacing = canopyRadius * 0.52;
        for (let l = 0; l < layers; l += 1) {
          const layerScale = 1.0 - l * 0.22;
          const layerHeight = canopyRadius * 1.1 * layerScale;
          const layerRadius = canopyRadius * layerScale;
          const yPos = height - 0.5 + l * layerSpacing;
          pineMatrices[matIdx].push(new THREE.Matrix4().compose(
            new THREE.Vector3(x, yPos, z),
            new THREE.Quaternion(),
            new THREE.Vector3(layerRadius, layerHeight, layerRadius),
          ));
        }
      } else {
        trunkMatrices.push(new THREE.Matrix4().compose(
          new THREE.Vector3(x + 0.4, height - 1.2, z),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -0.4)),
          new THREE.Vector3(0.14, 1.8, 0.14),
        ));

        trunkMatrices.push(new THREE.Matrix4().compose(
          new THREE.Vector3(x - 0.3, height - 1.3, z + 0.3),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.3, 0, 0.4)),
          new THREE.Vector3(0.14, 1.6, 0.14),
        ));

        const rCentral = canopyRadius * 0.82;
        deciduousMatrices[matIdx].push(new THREE.Matrix4().compose(
          new THREE.Vector3(x, height, z),
          new THREE.Quaternion(),
          new THREE.Vector3(rCentral, rCentral, rCentral),
        ));

        const rOffset1 = canopyRadius * 0.54;
        deciduousMatrices[matIdx].push(new THREE.Matrix4().compose(
          new THREE.Vector3(x + 0.8, height - 0.4, z),
          new THREE.Quaternion(),
          new THREE.Vector3(rOffset1, rOffset1, rOffset1),
        ));

        const rOffset2 = canopyRadius * 0.48;
        deciduousMatrices[matIdx].push(new THREE.Matrix4().compose(
          new THREE.Vector3(x - 0.6, height - 0.6, z + 0.6),
          new THREE.Quaternion(),
          new THREE.Vector3(rOffset2, rOffset2, rOffset2),
        ));
      }

      placedTrees += 1;
    }
  }

  if (trunkMatrices.length > 0) {
    const trunkGeom = new THREE.CylinderGeometry(0.57, 1.0, 1.0, 5);
    const trunkMesh = new THREE.InstancedMesh(trunkGeom, trunkMaterial, trunkMatrices.length);
    trunkMesh.name = 'tree_trunk';
    trunkMesh.castShadow = true;
    trunkMesh.receiveShadow = true;
    trunkMatrices.forEach((matrix, index) => trunkMesh.setMatrixAt(index, matrix));
    scene.add(trunkMesh);
  }

  const pineGeom = new THREE.ConeGeometry(1.0, 1.0, 5);
  for (let m = 0; m < canopyMaterials.length; m += 1) {
    const matrices = pineMatrices[m];
    if (matrices.length > 0) {
      const pineMesh = new THREE.InstancedMesh(pineGeom, canopyMaterials[m], matrices.length);
      pineMesh.name = 'tree_pine';
      pineMesh.castShadow = true;
      matrices.forEach((matrix, index) => pineMesh.setMatrixAt(index, matrix));
      scene.add(pineMesh);
    }
  }

  const deciduousGeom = new THREE.DodecahedronGeometry(1.0, 0);
  for (let m = 0; m < canopyMaterials.length; m += 1) {
    const matrices = deciduousMatrices[m];
    if (matrices.length > 0) {
      const deciduousMesh = new THREE.InstancedMesh(deciduousGeom, canopyMaterials[m], matrices.length);
      deciduousMesh.name = 'tree_deciduous';
      deciduousMesh.castShadow = true;
      matrices.forEach((matrix, index) => deciduousMesh.setMatrixAt(index, matrix));
      scene.add(deciduousMesh);
    }
  }
}
