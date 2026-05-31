import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Share geometries across all Bench instances to optimize memory and GPU buffer allocations
const frontLegGeom = new THREE.BoxGeometry(0.12, 0.6, 0.12);
const backLegGeom = new THREE.BoxGeometry(0.12, 0.6, 0.12);
const seatBracketGeom = new THREE.BoxGeometry(0.12, 0.08, 0.54);
const backBracketGeom = new THREE.BoxGeometry(0.08, 0.72, 0.08);
const armrestGeom = new THREE.BoxGeometry(0.1, 0.08, 0.44);
const seatSlatGeom = new THREE.BoxGeometry(5.2, 0.05, 0.09);
const backSlatGeom = new THREE.BoxGeometry(5.2, 0.12, 0.04);

export class Bench {
  public readonly group: THREE.Group;

  constructor(position: THREE.Vector3, rotation: number, ironMaterial: THREE.Material, woodMaterial: THREE.Material) {
    this.group = new THREE.Group();
    this.group.position.copy(position);
    this.group.rotation.y = rotation;

    this.buildModel(ironMaterial, woodMaterial);
  }

  private buildModel(ironMaterial: THREE.Material, woodMaterial: THREE.Material) {
    const ironGeoms: THREE.BufferGeometry[] = [];
    const woodGeoms: THREE.BufferGeometry[] = [];

    const _pos = new THREE.Vector3();
    const _quat = new THREE.Quaternion();
    const _scale = new THREE.Vector3(1, 1, 1);
    const _euler = new THREE.Euler();
    const _matrix = new THREE.Matrix4();

    function addGeom(
      list: THREE.BufferGeometry[],
      geom: THREE.BufferGeometry,
      x: number,
      y: number,
      z: number,
      rx = 0,
      ry = 0,
      rz = 0,
      sx = 1,
      sy = 1,
      sz = 1
    ) {
      const cloned = geom.clone();
      _pos.set(x, y, z);
      _euler.set(rx, ry, rz);
      _quat.setFromEuler(_euler);
      _scale.set(sx, sy, sz);
      _matrix.compose(_pos, _quat, _scale);
      cloned.applyMatrix4(_matrix);
      list.push(cloned);
    }

    // 1. Ornate Cast Iron Frames (left and right sides)
    for (const x of [-2.1, 2.1]) {
      // Front leg
      addGeom(ironGeoms, frontLegGeom, x, 0.3, 0.22);

      // Back leg
      addGeom(ironGeoms, backLegGeom, x, 0.3, -0.22, -0.15);

      // Seat bracket (horizontal support)
      addGeom(ironGeoms, seatBracketGeom, x, 0.6, 0);

      // Backrest bracket (inclined support)
      addGeom(ironGeoms, backBracketGeom, x, 0.95, -0.24, -0.22);

      // Armrest
      addGeom(ironGeoms, armrestGeom, x, 0.8, 0.1, 0.05);
    }

    // 2. Seat bottom slats (Wood)
    const seatZPositions = [-0.18, -0.04, 0.10, 0.22];
    for (const z of seatZPositions) {
      addGeom(woodGeoms, seatSlatGeom, 0, 0.64, z);
    }

    // 3. Seat backrest slats (Wood)
    // Tilted to align with the back bracket (rotation.x = -0.22)
    const backSlatPoints = [
      { y: 0.85, z: -0.21 },
      { y: 1.02, z: -0.25 },
      { y: 1.19, z: -0.29 }
    ];
    for (const point of backSlatPoints) {
      addGeom(woodGeoms, backSlatGeom, 0, point.y, point.z, -0.22);
    }

    // Merge and add iron meshes
    if (ironGeoms.length > 0) {
      const merged = mergeGeometries(ironGeoms);
      const mesh = new THREE.Mesh(merged, ironMaterial);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      ironGeoms.forEach(g => g.dispose());
    }

    // Merge and add wood meshes
    if (woodGeoms.length > 0) {
      const merged = mergeGeometries(woodGeoms);
      const mesh = new THREE.Mesh(merged, woodMaterial);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      woodGeoms.forEach(g => g.dispose());
    }
  }
}

