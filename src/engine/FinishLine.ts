import * as THREE from 'three';

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

    // 1. Solid White Start Line on Ground (local center is at Z = 0)
    const lineDepth = 0.56;
    const startLine = new THREE.Mesh(
      new THREE.BoxGeometry(lineDepth, 0.05, trackWidth),
      whiteMat
    );
    startLine.position.set(0, 0.065, 0);
    startLine.receiveShadow = true;
    this.group.add(startLine);

    // 2. Pillars / Posts (Truss Columns) at the start line
    const zOffset = trackOuterRadius + 1.1 - trackCenterRadius; // e.g. 32 + 1.1 - 24 = 9.1

    for (const z of [-zOffset, zOffset]) {
      // Concrete Pedestal
      const pedestal = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.4, 0.8), stoneMat);
      pedestal.position.set(0, 0.7, z);
      pedestal.castShadow = true;
      pedestal.receiveShadow = true;
      this.group.add(pedestal);

      // Tapered Column
      const column = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 5.6, 8), ironMat);
      column.position.set(0, 4.2, z);
      column.castShadow = true;
      this.group.add(column);

      // Decorative Gold Rings
      for (const yRing of [2.8, 4.2, 5.6]) {
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.1, 8), goldMat);
        ring.position.set(0, yRing, z);
        this.group.add(ring);
      }

      // Gold Sphere Finial
      const finial = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), goldMat);
      finial.position.set(0, 7.1, z);
      finial.castShadow = true;
      this.group.add(finial);
    }

    // 3. Overhead Banner
    const bannerWidth = zOffset * 2; // 18.2 (exactly the distance between column centers)
    const boardWidth = bannerWidth - 0.8; // 17.4 (fits inside the columns)

    // Truss Frame (top and bottom horizontal rails)
    const topRail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, bannerWidth), ironMat);
    topRail.position.set(0, 7.45, 0);
    topRail.castShadow = true;
    this.group.add(topRail);

    const bottomRail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, bannerWidth), ironMat);
    bottomRail.position.set(0, 6.15, 0);
    bottomRail.castShadow = true;
    this.group.add(bottomRail);

    // Banner Board
    const banner = new THREE.Mesh(new THREE.BoxGeometry(0.28, 1.2, boardWidth), bannerMat);
    banner.position.set(0, 6.8, 0);
    banner.castShadow = true;
    this.group.add(banner);

    // Rosette / Crest (Center Medallion facing oncoming horses)
    const medallionRing = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.65, 0.12, 8), goldMat);
    medallionRing.position.set(-0.18, 6.8, 0);
    medallionRing.rotation.z = Math.PI / 2;
    medallionRing.rotation.y = 0;
    medallionRing.castShadow = true;
    this.group.add(medallionRing);

    const medallionCenter = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.16, 8), redMat);
    medallionCenter.position.set(-0.20, 6.8, 0);
    medallionCenter.rotation.z = Math.PI / 2;
    medallionCenter.castShadow = true;
    this.group.add(medallionCenter);
  }
}
