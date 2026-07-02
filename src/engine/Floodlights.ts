import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

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

    const createBeamGeom = (p1: THREE.Vector3, p2: THREE.Vector3, thickness: number) => {
      const direction = new THREE.Vector3().subVectors(p2, p1);
      const length = direction.length();
      const geom = new THREE.BoxGeometry(thickness, length, thickness);
      const midpoint = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
      
      const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
      const matrix = new THREE.Matrix4().compose(midpoint, quat, new THREE.Vector3(1, 1, 1));
      geom.applyMatrix4(matrix);
      return geom;
    };

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

    positions.forEach((position, mastIndex) => {
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

      const towerGeoms: THREE.BufferGeometry[] = [];

      // Corner Legs
      for (const [sx, sz] of cornerOffsets) {
        const p1 = new THREE.Vector3(position.x + (sx * bottomW) / 2, 0, position.z + (sz * bottomW) / 2);
        const p2 = new THREE.Vector3(position.x + (sx * topW) / 2, height, position.z + (sz * topW) / 2);
        towerGeoms.push(createBeamGeom(p1, p2, 0.18));
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
            towerGeoms.push(createBeamGeom(p1, p2, 0.12));
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

            towerGeoms.push(createBeamGeom(botLeft, topRight, 0.08));
            towerGeoms.push(createBeamGeom(botRight, topLeft, 0.08));
          }
        }
      }

      if (towerGeoms.length > 0) {
        const merged = mergeGeometries(towerGeoms);
        const mesh = new THREE.Mesh(merged, mastMaterial);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.add(mesh);
        towerGeoms.forEach(g => g.dispose());
      }

      // 2. Gantry Platform at the Top (aligned to face track center)
      const dirToTrack = new THREE.Vector3(-position.x, 0, -position.z).normalize();
      const angleY = Math.atan2(dirToTrack.x, dirToTrack.z);

      const platformGroup = new THREE.Group();
      platformGroup.position.set(position.x, height, position.z);
      platformGroup.rotation.y = angleY;
      this.add(platformGroup);

      const platformGeoms: THREE.BufferGeometry[] = [];
      addGeom(platformGeoms, new THREE.BoxGeometry(4.4, 0.1, 1.8), 0, 0, 0);

      // Safety railings around back and sides
      const railPosts = [
        new THREE.Vector3(-2.1, 0.5, -0.8), // back-left
        new THREE.Vector3(2.1, 0.5, -0.8),  // back-right
        new THREE.Vector3(-2.1, 0.5, 0.8),  // front-left
        new THREE.Vector3(2.1, 0.5, 0.8),   // front-right
      ];
      railPosts.forEach((rPos) => {
        addGeom(platformGeoms, new THREE.BoxGeometry(0.08, 1.0, 0.08), rPos.x, rPos.y, rPos.z);
      });

      addGeom(platformGeoms, new THREE.BoxGeometry(4.2, 0.06, 0.06), 0, 1.0, -0.8);
      addGeom(platformGeoms, new THREE.BoxGeometry(4.2, 0.06, 0.06), 0, 0.5, -0.8);

      for (const side of [-1, 1]) {
        addGeom(platformGeoms, new THREE.BoxGeometry(0.06, 0.06, 1.6), side * 2.1, 1.0, 0);
        addGeom(platformGeoms, new THREE.BoxGeometry(0.06, 0.06, 1.6), side * 2.1, 0.5, 0);
      }

      if (platformGeoms.length > 0) {
        const merged = mergeGeometries(platformGeoms);
        const platformMesh = new THREE.Mesh(merged, mastMaterial);
        platformMesh.castShadow = true;
        platformMesh.receiveShadow = true;
        platformGroup.add(platformMesh);
        platformGeoms.forEach(g => g.dispose());
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

      spotlight.castShadow = (mastIndex === 2);
      spotlight.shadow.mapSize.width = 256;
      spotlight.shadow.mapSize.height = 256;
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
