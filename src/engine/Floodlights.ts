import * as THREE from 'three';

export interface FloodlightsConfig {
  trackStraightHalfLength: number;
  trackOuterRadius: number;
}

export class Floodlights extends THREE.Group {
  private readonly config: FloodlightsConfig;
  private lampFaceMaterial!: THREE.MeshStandardMaterial;
  private spotlights: THREE.SpotLight[] = [];
  private beams: THREE.Mesh[] = [];

  constructor(config: FloodlightsConfig) {
    super();
    this.config = config;
    this.build();
    this.setLightsEnabled(false);
  }

  private build() {
    const mastMaterial = new THREE.MeshStandardMaterial({
      color: 0x242d32, // Dark slate metal structure
      roughness: 0.65,
      metalness: 0.35,
    });
    const lampHousingMaterial = new THREE.MeshStandardMaterial({
      color: 0x111719,
      roughness: 0.42,
    });
    this.lampFaceMaterial = new THREE.MeshStandardMaterial({
      color: 0xfff2c2,
      emissive: 0xffd98a,
      emissiveIntensity: 2.2, // Higher emissivity for brighter look
      roughness: 0.15,
    });
    const lampFaceMaterial = this.lampFaceMaterial;
    const beamMaterial = new THREE.MeshBasicMaterial({
      color: 0xfff4d6,
      transparent: true,
      opacity: 0.08,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });

    const positions = [
      new THREE.Vector3(-this.config.trackStraightHalfLength - 14, 0, -this.config.trackOuterRadius - 13),
      new THREE.Vector3(this.config.trackStraightHalfLength + 14, 0, -this.config.trackOuterRadius - 13),
      new THREE.Vector3(-this.config.trackStraightHalfLength - 14, 0, this.config.trackOuterRadius + 13),
      new THREE.Vector3(this.config.trackStraightHalfLength + 14, 0, this.config.trackOuterRadius + 13),
    ];

    const createBeam = (p1: THREE.Vector3, p2: THREE.Vector3, thickness: number, material: THREE.Material) => {
      const direction = new THREE.Vector3().subVectors(p2, p1);
      const length = direction.length();
      const geom = new THREE.BoxGeometry(thickness, length, thickness);
      const mesh = new THREE.Mesh(geom, material);
      const midpoint = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
      mesh.position.copy(midpoint);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
      mesh.castShadow = true;
      return mesh;
    };

    positions.forEach((position) => {
      // 1. Procedural Square-Tapered Lattice Tower (Truss Mast)
      const bottomW = 2.4;
      const topW = 0.9;
      const height = 24.0;
      const sections = 4;
      const cornerOffsets = [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ];

      // Corner Legs
      for (const [sx, sz] of cornerOffsets) {
        const p1 = new THREE.Vector3(position.x + (sx * bottomW) / 2, 0, position.z + (sz * bottomW) / 2);
        const p2 = new THREE.Vector3(position.x + (sx * topW) / 2, height, position.z + (sz * topW) / 2);
        this.add(createBeam(p1, p2, 0.18, mastMaterial));
      }

      // Panels: Horizontal struts and X-braces
      for (let s = 0; s <= sections; s++) {
        const y = (s / sections) * height;
        const w = bottomW - (s / sections) * (bottomW - topW);

        // Horizontal perimeter frames
        if (s > 0) {
          for (let c = 0; c < 4; c++) {
            const c1 = cornerOffsets[c];
            const c2 = cornerOffsets[(c + 1) % 4];
            const p1 = new THREE.Vector3(position.x + (c1[0] * w) / 2, y, position.z + (c1[1] * w) / 2);
            const p2 = new THREE.Vector3(position.x + (c2[0] * w) / 2, y, position.z + (c2[1] * w) / 2);
            this.add(createBeam(p1, p2, 0.12, mastMaterial));
          }
        }

        // X-Braces
        if (s < sections) {
          const y1 = y;
          const y2 = ((s + 1) / sections) * height;
          const w1 = w;
          const w2 = bottomW - ((s + 1) / sections) * (bottomW - topW);

          for (let c = 0; c < 4; c++) {
            const c1 = cornerOffsets[c];
            const c2 = cornerOffsets[(c + 1) % 4];

            const botLeft = new THREE.Vector3(position.x + (c1[0] * w1) / 2, y1, position.z + (c1[1] * w1) / 2);
            const botRight = new THREE.Vector3(position.x + (c2[0] * w1) / 2, y1, position.z + (c2[1] * w1) / 2);
            const topLeft = new THREE.Vector3(position.x + (c1[0] * w2) / 2, y2, position.z + (c1[1] * w2) / 2);
            const topRight = new THREE.Vector3(position.x + (c2[0] * w2) / 2, y2, position.z + (c2[1] * w2) / 2);

            this.add(createBeam(botLeft, topRight, 0.08, mastMaterial));
            this.add(createBeam(botRight, topLeft, 0.08, mastMaterial));
          }
        }
      }

      // 2. Gantry Platform at the Top (aligned to face track center)
      const dirToTrack = new THREE.Vector3(-position.x, 0, -position.z).normalize();
      const angleY = Math.atan2(dirToTrack.x, dirToTrack.z);

      const platformGroup = new THREE.Group();
      platformGroup.position.set(position.x, height, position.z);
      platformGroup.rotation.y = angleY;
      this.add(platformGroup);

      // Walk deck floor
      const deck = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.1, 1.8), mastMaterial);
      deck.castShadow = true;
      deck.receiveShadow = true;
      platformGroup.add(deck);

      // Safety railings around back and sides
      const railPosts = [
        new THREE.Vector3(-2.1, 0.5, -0.8), // back-left
        new THREE.Vector3(2.1, 0.5, -0.8),  // back-right
        new THREE.Vector3(-2.1, 0.5, 0.8),  // front-left
        new THREE.Vector3(2.1, 0.5, 0.8),   // front-right
      ];
      railPosts.forEach((rPos) => {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.0, 0.08), mastMaterial);
        post.position.copy(rPos);
        post.castShadow = true;
        platformGroup.add(post);
      });

      const backRail1 = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.06, 0.06), mastMaterial);
      backRail1.position.set(0, 1.0, -0.8);
      platformGroup.add(backRail1);

      const backRail2 = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.06, 0.06), mastMaterial);
      backRail2.position.set(0, 0.5, -0.8);
      platformGroup.add(backRail2);

      for (const side of [-1, 1]) {
        const sideRail1 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 1.6), mastMaterial);
        sideRail1.position.set(side * 2.1, 1.0, 0);
        platformGroup.add(sideRail1);

        const sideRail2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 1.6), mastMaterial);
        sideRail2.position.set(side * 2.1, 0.5, 0);
        platformGroup.add(sideRail2);
      }

      // 3. 2x4 Light Array (Rack of 8 adjustable lamps)
      const targetPos = new THREE.Vector3().copy(position).add(dirToTrack.clone().multiplyScalar(42));
      targetPos.y = 0.5;

      const rowOffsets = [0.35, 1.15];
      const colOffsets = [-1.5, -0.5, 0.5, 1.5];

      rowOffsets.forEach((rowY) => {
        colOffsets.forEach((colX) => {
          const lampGroup = new THREE.Group();
          lampGroup.position.set(colX, rowY, 0.9); // mounted on the front edge
          platformGroup.add(lampGroup);

          // Rear mounting bracket hinge
          const bracket = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.28, 6), mastMaterial);
          bracket.rotation.x = Math.PI / 2;
          bracket.position.z = -0.15;
          lampGroup.add(bracket);

          // Lamp housing
          const housing = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.52, 0.32), lampHousingMaterial);
          housing.castShadow = true;
          lampGroup.add(housing);

          // Emissive lamp face glass
          const face = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.38, 0.04), lampFaceMaterial);
          face.position.z = 0.165;
          lampGroup.add(face);

          // Direct each lamp to point at target position
          lampGroup.lookAt(targetPos);
        });
      });

      // 4. Spotlight Sources (Light casting with shadow support)
      const spotlight = new THREE.SpotLight(0xffe6b0, 32.0, 180.0, Math.PI / 4, 0.45, 0.85);
      spotlight.position.set(position.x, height + 0.8, position.z);
      
      const trackTarget = new THREE.Object3D();
      trackTarget.position.copy(targetPos);
      this.add(trackTarget);
      spotlight.target = trackTarget;

      spotlight.castShadow = true;
      spotlight.shadow.mapSize.width = 512;
      spotlight.shadow.mapSize.height = 512;
      spotlight.shadow.camera.near = 10;
      spotlight.shadow.camera.far = 250;
      spotlight.shadow.bias = -0.0006;
      this.add(spotlight);
      this.spotlights.push(spotlight);

      // 5. Misty Atmospheric Light Cone Mesh (Volumetric glow)
      const lightTop = new THREE.Vector3(position.x, height + 0.8, position.z);
      const beamDir = new THREE.Vector3().subVectors(targetPos, lightTop);
      const dirNorm = beamDir.clone().normalize();
      const beamLen = beamDir.length();

      // Shift the starting point of the cone forward along its pointing axis by 1.15 units
      // to align it perfectly with the front face of the 2x4 spotlight array.
      const lightTopShifted = new THREE.Vector3().copy(lightTop).add(dirNorm.clone().multiplyScalar(1.15));
      const adjustedLen = beamLen - 1.15;

      const beamGeom = new THREE.CylinderGeometry(0.6, adjustedLen * 0.46, adjustedLen, 16, 1, true);
      beamGeom.translate(0, -adjustedLen / 2, 0); // pivot at top center

      const beamMesh = new THREE.Mesh(beamGeom, beamMaterial);
      beamMesh.position.copy(lightTopShifted);
      beamMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dirNorm);
      this.add(beamMesh);
      this.beams.push(beamMesh);
    });
  }

  public setLightsEnabled(enabled: boolean) {
    if (this.lampFaceMaterial) {
      this.lampFaceMaterial.emissiveIntensity = enabled ? 2.2 : 0.0;
    }
    this.spotlights.forEach((light) => {
      light.visible = enabled;
    });
    this.beams.forEach((beam) => {
      beam.visible = enabled;
    });
  }
}
