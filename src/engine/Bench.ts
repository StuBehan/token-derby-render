import * as THREE from 'three';

export class Bench {
  public readonly group: THREE.Group;

  constructor(position: THREE.Vector3, rotation: number, ironMaterial: THREE.Material, woodMaterial: THREE.Material) {
    this.group = new THREE.Group();
    this.group.position.copy(position);
    this.group.rotation.y = rotation;

    this.buildModel(ironMaterial, woodMaterial);
  }

  private buildModel(ironMaterial: THREE.Material, woodMaterial: THREE.Material) {
    const width = 5.2;

    // 1. Ornate Cast Iron Frames (left and right sides)
    for (const x of [-2.1, 2.1]) {
      const frameGroup = new THREE.Group();
      frameGroup.position.set(x, 0, 0);

      // Front leg
      const frontLeg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.6, 0.12), ironMaterial);
      frontLeg.position.set(0, 0.3, 0.22);
      frontLeg.castShadow = true;
      frameGroup.add(frontLeg);

      // Back leg
      const backLeg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.6, 0.12), ironMaterial);
      backLeg.position.set(0, 0.3, -0.22);
      backLeg.rotation.x = -0.15; // angle slightly backwards for stability look
      backLeg.castShadow = true;
      frameGroup.add(backLeg);

      // Seat bracket (horizontal support)
      const seatBracket = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.54), ironMaterial);
      seatBracket.position.set(0, 0.6, 0);
      seatBracket.castShadow = true;
      frameGroup.add(seatBracket);

      // Backrest bracket (inclined support)
      const backBracket = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.72, 0.08), ironMaterial);
      backBracket.position.set(0, 0.95, -0.24);
      backBracket.rotation.x = -0.22; // tilt back
      backBracket.castShadow = true;
      frameGroup.add(backBracket);

      // Armrest
      const armrest = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.44), ironMaterial);
      armrest.position.set(0, 0.8, 0.1);
      armrest.rotation.x = 0.05;
      armrest.castShadow = true;
      frameGroup.add(armrest);

      this.group.add(frameGroup);
    }

    // 2. Seat bottom slats (Wood)
    const seatZPositions = [-0.18, -0.04, 0.10, 0.22];
    for (const z of seatZPositions) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(width, 0.05, 0.09), woodMaterial);
      slat.position.set(0, 0.64, z);
      slat.castShadow = true;
      this.group.add(slat);
    }

    // 3. Seat backrest slats (Wood)
    // Tilted to align with the back bracket (rotation.x = -0.22)
    const backSlatPoints = [
      { y: 0.85, z: -0.21 },
      { y: 1.02, z: -0.25 },
      { y: 1.19, z: -0.29 }
    ];
    for (const point of backSlatPoints) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(width, 0.12, 0.04), woodMaterial);
      slat.position.set(0, point.y, point.z);
      slat.rotation.x = -0.22;
      slat.castShadow = true;
      this.group.add(slat);
    }
  }
}
