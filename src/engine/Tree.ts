import * as THREE from 'three';

export interface TreeConfig {
  /** Height of the tree. Defaults to random/procedural. */
  height?: number;
  /** Radius of the canopy. Defaults to random/procedural. */
  radius?: number;
  /** Canopy material. */
  canopyMaterial: THREE.Material;
  /** Seed index for variation. */
  seedIndex: number;
}

export class Tree {
  public readonly group: THREE.Group;

  constructor(position: THREE.Vector3, config: TreeConfig) {
    this.group = new THREE.Group();
    this.group.position.copy(position);

    this.buildModel(config);
  }

  private buildModel(config: TreeConfig) {
    const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x483626, roughness: 0.88 });
    const height = config.height ?? (6.4 + (config.seedIndex % 5) * 0.75);
    const canopyRadius = config.radius ?? (3.2 + (config.seedIndex % 3) * 0.42);

    // 1. Trunk
    // Bottom base flare
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.42, 0.8, 5), trunkMaterial);
    base.position.y = 0.4;
    base.castShadow = true;
    base.receiveShadow = true;
    this.group.add(base);

    // Main shaft
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.24, height - 0.8, 5), trunkMaterial);
    shaft.position.y = (height + 0.8) / 2 - 0.4; // correct centering
    shaft.castShadow = true;
    this.group.add(shaft);

    // Deciduous Tree vs Pine Tree variation
    const isPine = config.seedIndex % 3 === 0;

    if (isPine) {
      // Layered conical pine tree
      const layers = 3;
      const layerSpacing = canopyRadius * 0.52;
      for (let i = 0; i < layers; i++) {
        const layerScale = 1.0 - i * 0.22;
        const layerHeight = canopyRadius * 1.1 * layerScale;
        const layerRadius = canopyRadius * layerScale;
        const pineLayer = new THREE.Mesh(
          new THREE.ConeGeometry(layerRadius, layerHeight, 5),
          config.canopyMaterial
        );
        pineLayer.position.y = height - 0.5 + i * layerSpacing;
        pineLayer.castShadow = true;
        this.group.add(pineLayer);
      }
    } else {
      // Branching deciduous tree (e.g. oak)
      // Main branch 1
      const branch1 = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.14, 1.8, 4), trunkMaterial);
      branch1.position.set(0.4, height - 1.2, 0);
      branch1.rotation.z = -0.4;
      branch1.castShadow = true;
      this.group.add(branch1);

      // Main branch 2
      const branch2 = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.14, 1.6, 4), trunkMaterial);
      branch2.position.set(-0.3, height - 1.3, 0.3);
      branch2.rotation.set(-0.3, 0, 0.4);
      branch2.castShadow = true;
      this.group.add(branch2);

      // Central large canopy
      const centralCanopy = new THREE.Mesh(
        new THREE.DodecahedronGeometry(canopyRadius * 0.82, 0),
        config.canopyMaterial
      );
      centralCanopy.position.set(0, height, 0);
      centralCanopy.castShadow = true;
      this.group.add(centralCanopy);

      // Offset canopy 1 (on branch 1)
      const offsetCanopy1 = new THREE.Mesh(
        new THREE.DodecahedronGeometry(canopyRadius * 0.54, 0),
        config.canopyMaterial
      );
      offsetCanopy1.position.set(0.8, height - 0.4, 0);
      offsetCanopy1.castShadow = true;
      this.group.add(offsetCanopy1);

      // Offset canopy 2 (on branch 2)
      const offsetCanopy2 = new THREE.Mesh(
        new THREE.DodecahedronGeometry(canopyRadius * 0.48, 0),
        config.canopyMaterial
      );
      offsetCanopy2.position.set(-0.6, height - 0.6, 0.6);
      offsetCanopy2.castShadow = true;
      this.group.add(offsetCanopy2);
    }
  }
}
