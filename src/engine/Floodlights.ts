import * as THREE from 'three';

export interface FloodlightsConfig {
  trackStraightHalfLength: number;
  trackOuterRadius: number;
}

export class Floodlights extends THREE.Group {
  private readonly config: FloodlightsConfig;

  constructor(config: FloodlightsConfig) {
    super();
    this.config = config;
    this.build();
  }

  private build() {
    const mastMaterial = new THREE.MeshStandardMaterial({ color: 0x20282d, roughness: 0.58, metalness: 0.25 });
    const lampHousingMaterial = new THREE.MeshStandardMaterial({ color: 0x111719, roughness: 0.42 });
    const lampFaceMaterial = new THREE.MeshStandardMaterial({
      color: 0xfff2c2,
      emissive: 0xffd98a,
      emissiveIntensity: 0.9,
      roughness: 0.2,
    });

    const positions = [
      new THREE.Vector3(-this.config.trackStraightHalfLength - 14, 0, -this.config.trackOuterRadius - 13),
      new THREE.Vector3(this.config.trackStraightHalfLength + 14, 0, -this.config.trackOuterRadius - 13),
      new THREE.Vector3(-this.config.trackStraightHalfLength - 14, 0, this.config.trackOuterRadius + 13),
      new THREE.Vector3(this.config.trackStraightHalfLength + 14, 0, this.config.trackOuterRadius + 13),
    ];

    positions.forEach((position) => {
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.42, 24, 10), mastMaterial);
      mast.position.set(position.x, 12, position.z);
      mast.castShadow = true;
      this.add(mast);

      const crossbar = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.32, 0.32), mastMaterial);
      crossbar.position.set(position.x, 24, position.z);
      crossbar.lookAt(0, 24.2, 0);
      crossbar.rotateX(Math.PI / 2);
      crossbar.castShadow = true;
      this.add(crossbar);

      const directionToTrack = new THREE.Vector3(-position.x, 0, -position.z).normalize();
      const sideVector = new THREE.Vector3(-directionToTrack.z, 0, directionToTrack.x);
      const target = new THREE.Object3D();
      target.position.copy(position).add(directionToTrack.multiplyScalar(24));
      target.position.y = 0.35;
      this.add(target);

      for (const offset of [-2.4, -0.8, 0.8, 2.4]) {
        const lampGroup = new THREE.Group();
        lampGroup.position.copy(position).add(sideVector.clone().multiplyScalar(offset));
        lampGroup.position.y = 23.5;
        lampGroup.lookAt(target.position);

        const housing = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.58, 0.42), lampHousingMaterial);
        housing.castShadow = true;
        lampGroup.add(housing);

        const face = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.4, 0.05), lampFaceMaterial);
        face.position.z = 0.24;
        lampGroup.add(face);

        this.add(lampGroup);
      }

      const light = new THREE.SpotLight(0xffe6b0, 12, 180, Math.PI / 3, 0.35, 0.8);
      light.position.set(position.x, 23.2, position.z);
      light.target = target;
      light.castShadow = false;
      this.add(light);
    });
  }
}
