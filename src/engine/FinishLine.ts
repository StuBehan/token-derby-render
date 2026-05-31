import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface FinishLineMaterials {
  whiteMat: THREE.Material;
  goldMat: THREE.Material;
  redMat: THREE.Material;
  stoneMat: THREE.Material;
  ironMat: THREE.Material;
  bannerMat: THREE.Material;
}

export interface FinishLineConfig {
  trackWidth: number;
  trackInnerRadius: number;
  trackOuterRadius: number;
  trackCenterRadius: number;
}

export class FinishLine {
  public readonly group: THREE.Group;

  constructor(
    position: THREE.Vector3,
    materials: FinishLineMaterials,
    config: FinishLineConfig
  ) {
    this.group = new THREE.Group();
    this.group.position.copy(position);

    this.buildModel(materials, config);
  }

  private buildModel(materials: FinishLineMaterials, config: FinishLineConfig) {
    const { whiteMat, goldMat, redMat, stoneMat, ironMat, bannerMat } = materials;
    const { trackWidth, trackInnerRadius, trackOuterRadius, trackCenterRadius } = config;

    const stoneGeoms: THREE.BufferGeometry[] = [];
    const ironGeoms: THREE.BufferGeometry[] = [];
    const goldGeoms: THREE.BufferGeometry[] = [];
    const redGeoms: THREE.BufferGeometry[] = [];
    const bannerGeoms: THREE.BufferGeometry[] = [];

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

    // 1. Solid White Start Line on Ground (local center is at Z = 0)
    const lineDepth = 0.56;
    const startLineGeom = new THREE.BoxGeometry(lineDepth, 0.05, trackWidth);
    const startLine = new THREE.Mesh(startLineGeom, whiteMat);
    startLine.position.set(0, 0.065, 0);
    startLine.receiveShadow = true;
    this.group.add(startLine);

    // 2. Pillars / Posts (Truss Columns) at the start line
    const zOffset = trackOuterRadius + 1.1 - trackCenterRadius; // e.g. 32 + 1.1 - 24 = 9.1

    const pedestalGeom = new THREE.BoxGeometry(0.8, 1.4, 0.8);
    const columnGeom = new THREE.CylinderGeometry(0.18, 0.28, 5.6, 8);
    const ringGeom = new THREE.CylinderGeometry(0.24, 0.24, 0.1, 8);
    const finialGeom = new THREE.SphereGeometry(0.22, 8, 8);

    for (const z of [-zOffset, zOffset]) {
      // Concrete Pedestal
      addGeom(stoneGeoms, pedestalGeom, 0, 0.7, z);

      // Tapered Column
      addGeom(ironGeoms, columnGeom, 0, 4.2, z);

      // Decorative Gold Rings
      for (const yRing of [2.8, 4.2, 5.6]) {
        addGeom(goldGeoms, ringGeom, 0, yRing, z);
      }

      // Gold Sphere Finial
      addGeom(goldGeoms, finialGeom, 0, 7.1, z);
    }

    // 3. Overhead Banner
    const bannerWidth = zOffset * 2; // 18.2 (exactly the distance between column centers)
    const boardWidth = bannerWidth - 0.8; // 17.4 (fits inside the columns)

    // Truss Frame (top and bottom horizontal rails)
    const topRailGeom = new THREE.BoxGeometry(0.1, 0.1, bannerWidth);
    addGeom(ironGeoms, topRailGeom, 0, 6.95, 0);

    const bottomRailGeom = new THREE.BoxGeometry(0.1, 0.1, bannerWidth);
    addGeom(ironGeoms, bottomRailGeom, 0, 5.65, 0);

    // Banner Board
    const bannerGeom = new THREE.BoxGeometry(0.28, 1.2, boardWidth);
    addGeom(bannerGeoms, bannerGeom, 0, 6.3, 0);

    // Rosette / Crest (Center Medallion facing oncoming horses)
    const medallionRingGeom = new THREE.CylinderGeometry(0.65, 0.65, 0.12, 8);
    addGeom(goldGeoms, medallionRingGeom, -0.18, 6.3, 0, 0, 0, Math.PI / 2);

    const medallionCenterGeom = new THREE.CylinderGeometry(0.42, 0.42, 0.16, 8);
    addGeom(redGeoms, medallionCenterGeom, -0.20, 6.3, 0, 0, 0, Math.PI / 2);

    // Clean up temporary base geometries
    pedestalGeom.dispose();
    columnGeom.dispose();
    ringGeom.dispose();
    finialGeom.dispose();
    topRailGeom.dispose();
    bottomRailGeom.dispose();
    bannerGeom.dispose();
    medallionRingGeom.dispose();
    medallionCenterGeom.dispose();

    // Merge and add meshes by material
    if (stoneGeoms.length > 0) {
      const merged = mergeGeometries(stoneGeoms);
      const mesh = new THREE.Mesh(merged, stoneMat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      stoneGeoms.forEach(g => g.dispose());
    }

    if (ironGeoms.length > 0) {
      const merged = mergeGeometries(ironGeoms);
      const mesh = new THREE.Mesh(merged, ironMat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      ironGeoms.forEach(g => g.dispose());
    }

    if (goldGeoms.length > 0) {
      const merged = mergeGeometries(goldGeoms);
      const mesh = new THREE.Mesh(merged, goldMat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      goldGeoms.forEach(g => g.dispose());
    }

    if (redGeoms.length > 0) {
      const merged = mergeGeometries(redGeoms);
      const mesh = new THREE.Mesh(merged, redMat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      redGeoms.forEach(g => g.dispose());
    }

    if (bannerGeoms.length > 0) {
      const merged = mergeGeometries(bannerGeoms);
      const mesh = new THREE.Mesh(merged, bannerMat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      bannerGeoms.forEach(g => g.dispose());
    }
  }
}
