import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { addHorizonGround } from './locations/horizonGround';

// Warning light blink timing configuration (in seconds)
const BLINK_PERIOD = 4.8;
const FLASH_DURATION = 0.3;

// ─── Shared module-level geometry helpers ────────────────────────────────────

/** Bake a geometry's transform and push into a list. Returns the source geom untouched. */
function bakeGeom(
  list: THREE.BufferGeometry[],
  geom: THREE.BufferGeometry,
  x: number, y: number, z: number,
  rx = 0, ry = 0, rz = 0,
  sx = 1, sy = 1, sz = 1,
): void {
  const g = geom.clone();
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz),
  );
  g.applyMatrix4(m);
  list.push(g);
}

/** Merge a list of baked geometries into a single Mesh, then dispose intermediates. */
function flushMesh(
  list: THREE.BufferGeometry[],
  material: THREE.Material,
  castShadow = true,
  receiveShadow = false,
): THREE.Mesh | null {
  if (list.length === 0) return null;
  const merged = mergeGeometries(list);
  const mesh = new THREE.Mesh(merged, material);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  list.forEach(g => g.dispose());
  list.length = 0;
  return mesh;
}

// ─────────────────────────────────────────────────────────────────────────────

export class LondonSkyline extends THREE.Group {
  private londonEyeWheel?: THREE.Group;
  private londonEyeIronwork?: THREE.InstancedMesh;
  private londonEyePods?: THREE.InstancedMesh;

  // Warning Lights Beacons
  private warningLights: THREE.Mesh[] = [];
  private blinkTimer = 0.0;
  private lightsOn = true;

  // Shared geometry/material for beacon efficiency
  private beaconGeom = new THREE.BoxGeometry(0.4, 0.4, 0.4);
  private redLightMaterial = new THREE.MeshBasicMaterial({
    color: 0xff0000,
    toneMapped: false, // Glow bright in HDR/Bloom
    fog: false,        // Cut through weather fog
  });

  constructor() {
    super();
    this.buildSkyline();
    this.buildHorizonFill();
  }

  private buildSkyline() {
    const skylineMaterial = new THREE.MeshStandardMaterial({
      color: 0x76878e, // Misty slate-blue silhouette color
      roughness: 0.9,
      metalness: 0.1,
    });

    const clockFaceMaterial = new THREE.MeshStandardMaterial({
      color: 0xdfd4bc, // Cream clock face
      roughness: 0.5,
    });

    // We will accumulate ALL static landmark parts sharing skylineMaterial into a single list
    const staticLandmarkGeoms: THREE.BufferGeometry[] = [];
    const clockFaceGeoms: THREE.BufferGeometry[] = [];

    // ── 1. Elizabeth Tower (Big Ben) ──────────────────────────────────────────
    const bbX = -110;
    const bbZ = -165;
    // Tower shaft
    bakeGeom(staticLandmarkGeoms, new THREE.BoxGeometry(6.4, 42.0, 6.4), bbX, 21.0, bbZ);
    // Clock belfry section
    bakeGeom(staticLandmarkGeoms, new THREE.BoxGeometry(7.2, 6.0, 7.2), bbX, 45.0, bbZ);
    // Pyramid roof spire
    bakeGeom(staticLandmarkGeoms, new THREE.ConeGeometry(5.2, 14.0, 4), bbX, 55.0, bbZ, 0, Math.PI / 4, 0);
    // Spire tip finial
    bakeGeom(staticLandmarkGeoms, new THREE.CylinderGeometry(0.1, 0.4, 4.0, 4), bbX, 63.0, bbZ);

    // Clock faces on 4 sides (baked individually with rotated positions relative to Big Ben center)
    for (const rot of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const basePos = new THREE.Vector3(0, 45.0, 3.65);
      basePos.applyAxisAngle(new THREE.Vector3(0, 1, 0), rot);
      basePos.add(new THREE.Vector3(bbX, 0, bbZ));
      const g = new THREE.BoxGeometry(2.8, 2.8, 0.15).clone();
      g.applyMatrix4(
        new THREE.Matrix4().compose(
          basePos,
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rot, 0)),
          new THREE.Vector3(1, 1, 1),
        ),
      );
      clockFaceGeoms.push(g);
    }

    const clockFaceMesh = flushMesh(clockFaceGeoms, clockFaceMaterial);
    if (clockFaceMesh) this.add(clockFaceMesh);

    // Blinking red warning beacon for Big Ben (world coordinates)
    const bigBenLight = new THREE.Mesh(this.beaconGeom, this.redLightMaterial);
    bigBenLight.position.set(bbX, 65.2, bbZ);
    bigBenLight.userData = { phaseOffset: 0.08 * BLINK_PERIOD };
    this.add(bigBenLight);
    this.warningLights.push(bigBenLight);

    // ── 2. The Shard ─────────────────────────────────────────────────────────
    const shX = 130;
    const shZ = -175;
    // Tall pyramid shape
    bakeGeom(staticLandmarkGeoms, new THREE.ConeGeometry(8.5, 78.0, 4), shX, 39.0, shZ, 0, Math.PI / 4, 0);
    // Wing facades
    bakeGeom(staticLandmarkGeoms, new THREE.ConeGeometry(6.0, 68.0, 3), shX - 2, 34, shZ + 1, 0, 0.5, 0);
    bakeGeom(staticLandmarkGeoms, new THREE.ConeGeometry(5.0, 58.0, 3), shX + 2, 29, shZ - 2, 0, -0.5, 0);

    // Blinking red warning beacon for The Shard (world coordinates)
    const shardLight = new THREE.Mesh(this.beaconGeom, this.redLightMaterial);
    shardLight.position.set(shX, 78.2, shZ);
    shardLight.userData = { phaseOffset: 0.5 * BLINK_PERIOD };
    this.add(shardLight);
    this.warningLights.push(shardLight);

    // ── 3. The London Eye ─────────────────────────────────────────────────────
    const leX = 25;
    const leZ = -185;

    // Static base structure: legs + brace + hub
    bakeGeom(staticLandmarkGeoms, new THREE.BoxGeometry(1.2, 50.6, 1.2), leX - 8.0, 24.0, leZ, 0, 0, -0.322);
    bakeGeom(staticLandmarkGeoms, new THREE.BoxGeometry(1.2, 50.6, 1.2), leX + 8.0, 24.0, leZ, 0, 0,  0.322);
    bakeGeom(staticLandmarkGeoms, new THREE.BoxGeometry(1.0, 50.6, 1.0), leX,   24.0, leZ - 8.0, 0.322, 0, 0);
    bakeGeom(staticLandmarkGeoms, new THREE.CylinderGeometry(2.2, 2.2, 6.0, 8), leX, 48.0, leZ, Math.PI / 2, 0, 0);

    // Static blinking hub beacon
    const hubLight = new THREE.Mesh(this.beaconGeom, this.redLightMaterial);
    hubLight.position.set(leX, 50.5, leZ);
    hubLight.userData = { phaseOffset: 0.25 * BLINK_PERIOD };
    this.add(hubLight);
    this.warningLights.push(hubLight);

    // Rotating wheel group (positioned in world coordinates)
    this.londonEyeWheel = new THREE.Group();
    this.londonEyeWheel.position.set(leX, 48.0, leZ);

    // Wheel rings + all 8 spokes → merged into single static mesh on the wheel
    const wheelGeoms: THREE.BufferGeometry[] = [];
    bakeGeom(wheelGeoms, new THREE.TorusGeometry(26.0, 0.5, 4, 32), 0, 0, 0);
    bakeGeom(wheelGeoms, new THREE.TorusGeometry(23.5, 0.25, 4, 32), 0, 0, 0);
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI;
      bakeGeom(wheelGeoms, new THREE.BoxGeometry(0.15, 52.0, 0.15), 0, 0, 0, 0, 0, angle);
    }
    const wheelStructureMesh = flushMesh(wheelGeoms, skylineMaterial, true, false);
    if (wheelStructureMesh) this.londonEyeWheel.add(wheelStructureMesh);

    // 8 rim warning beacons (stay as individual meshes — they rotate with the wheel)
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const eyeLight = new THREE.Mesh(this.beaconGeom, this.redLightMaterial);
      eyeLight.position.set(Math.cos(angle) * 26.3, Math.sin(angle) * 26.3, 0);
      eyeLight.userData = { phaseOffset: (i / 8) * BLINK_PERIOD };
      this.londonEyeWheel.add(eyeLight);
      this.warningLights.push(eyeLight);
    }

    // 16 gondolas — using InstancedMesh to draw all 16 gondola ironworks and pods in just 2 draw calls!
    const capsuleCount = 16;

    // Glass pod material (transparent, laminated-glass look)
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0xeaf2f6,
      roughness: 0.1,
      metalness: 0.9,
      transparent: true,
      opacity: 0.7,
    });

    const POD_DROP = 0.95;

    // Shared base geometries for InstancedMesh setup
    const mountPinBaseGeom = new THREE.BoxGeometry(0.2, 1.3, 0.4);
    const bearingRingBaseGeom = new THREE.TorusGeometry(0.5, 0.06, 4, 16);
    const hangerArmBaseGeom = new THREE.BoxGeometry(0.06, POD_DROP, 0.06);
    const podBaseGeom = new THREE.SphereGeometry(0.5, 10, 8);

    // Accumulate all mount pin geometries (baked into wheel-local space) for single merged mesh
    const allMountPinGeoms: THREE.BufferGeometry[] = [];
    for (let i = 0; i < capsuleCount; i++) {
      const angle = (i / capsuleCount) * Math.PI * 2;
      const mountX = Math.cos(angle) * 26.6;
      const mountY = Math.sin(angle) * 26.6;
      bakeGeom(allMountPinGeoms, mountPinBaseGeom, mountX, mountY, 0, 0, 0, angle - Math.PI / 2);
    }
    const mountPinMesh = flushMesh(allMountPinGeoms, skylineMaterial, true, false);
    if (mountPinMesh) this.londonEyeWheel.add(mountPinMesh);

    // Combine bearing ring and hanger arms for the instanced ironwork
    const ironGeoms: THREE.BufferGeometry[] = [];
    ironGeoms.push(bearingRingBaseGeom.clone());
    for (const sx of [-0.34, 0.34]) {
      bakeGeom(ironGeoms, hangerArmBaseGeom, sx, -POD_DROP / 2, 0);
    }
    const combinedIronGeom = mergeGeometries(ironGeoms);
    ironGeoms.forEach(g => g.dispose());

    this.londonEyeIronwork = new THREE.InstancedMesh(combinedIronGeom, skylineMaterial, capsuleCount);
    this.londonEyeIronwork.castShadow = true;
    this.londonEyeWheel.add(this.londonEyeIronwork);

    // Scale and translate pod vertices down by POD_DROP so the pivot point remains at (0, 0, 0)
    const podGeom = podBaseGeom.clone();
    podGeom.scale(0.7, 0.6, 1.4);
    podGeom.translate(0, -POD_DROP, 0);

    this.londonEyePods = new THREE.InstancedMesh(podGeom, glassMat, capsuleCount);
    this.londonEyePods.castShadow = true;
    this.londonEyeWheel.add(this.londonEyePods);

    // Initialize instanced matrices for the first frame
    const initPos = new THREE.Vector3();
    const initQuat = new THREE.Quaternion();
    const initScale = new THREE.Vector3(1, 1, 1);
    const initMatrix = new THREE.Matrix4();
    for (let i = 0; i < capsuleCount; i++) {
      const angle = (i / capsuleCount) * Math.PI * 2;
      const pivotX = Math.cos(angle) * 27.2;
      const pivotY = Math.sin(angle) * 27.2;

      initPos.set(pivotX, pivotY, 0);
      initQuat.setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0);
      initMatrix.compose(initPos, initQuat, initScale);

      this.londonEyeIronwork.setMatrixAt(i, initMatrix);
      this.londonEyePods.setMatrixAt(i, initMatrix);
    }

    // Dispose base geometries
    mountPinBaseGeom.dispose();
    bearingRingBaseGeom.dispose();
    hangerArmBaseGeom.dispose();
    podBaseGeom.dispose();

    this.add(this.londonEyeWheel);

    // ── 4. Westminster silhouette ─────────────────────────────────────────────
    const wmX = -155;
    const wmZ = -170;
    // Wide base
    bakeGeom(staticLandmarkGeoms, new THREE.BoxGeometry(22.0, 14.0, 8.0), wmX, 7.0, wmZ);
    // Spires (columns + cone tips)
    for (const offset of [-8, -4, 4, 8]) {
      bakeGeom(staticLandmarkGeoms, new THREE.BoxGeometry(1.6, 12.0, 1.6), wmX + offset, 18.0, wmZ);
      bakeGeom(staticLandmarkGeoms, new THREE.ConeGeometry(1.1, 5.0, 4), wmX + offset, 25.5, wmZ, 0, Math.PI / 4, 0);
    }

    // Flush ALL accumulated skyline landmark geoms into a single merged mesh
    const landmarkMesh = flushMesh(staticLandmarkGeoms, skylineMaterial);
    if (landmarkMesh) this.add(landmarkMesh);
  }

  private buildHorizonFill() {
    // Deterministic noise for consistent layout
    const noise = (i: number, salt: number) => {
      const v = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
      return v - Math.floor(v);
    };

    // Materials – 3 tonal variations for depth layering
    const horizonMats = [
      new THREE.MeshStandardMaterial({ color: 0x5e6b73, roughness: 0.92, metalness: 0.08 }),
      new THREE.MeshStandardMaterial({ color: 0x6d7980, roughness: 0.94, metalness: 0.06 }),
      new THREE.MeshStandardMaterial({ color: 0x7a868d, roughness: 0.96, metalness: 0.04 }),
    ];

    // One geometry accumulator per material layer
    const horizonGeoms: THREE.BufferGeometry[][] = horizonMats.map(() => []);

    const sides = [
      // North edge (behind track, left to right)
      { label: 'N', startX: -180, startZ: -155, dx: 1, dz: 0, normalX: 0, normalZ: -1, length: 360, facingY: 0 },
      // South edge
      { label: 'S', startX: -180, startZ: 155, dx: 1, dz: 0, normalX: 0, normalZ: 1, length: 360, facingY: Math.PI },
      // West edge
      { label: 'W', startX: -175, startZ: -150, dx: 0, dz: 1, normalX: -1, normalZ: 0, length: 300, facingY: -Math.PI / 2 },
      // East edge
      { label: 'E', startX: 175, startZ: -150, dx: 0, dz: 1, normalX: 1, normalZ: 0, length: 300, facingY: Math.PI / 2 },
    ];

    addHorizonGround(this);

    // Exclusion zones where named landmarks sit
    const exclusions = [
      { x: -110, z: -165, r: 20 },  // Big Ben
      { x: 25,   z: -185, r: 35 },  // London Eye
      { x: 130,  z: -175, r: 22 },  // Shard
      { x: -155, z: -170, r: 25 },  // Westminster
    ];

    const isExcluded = (px: number, pz: number) => {
      return exclusions.some(e => {
        const dx = px - e.x;
        const dz = pz - e.z;
        return Math.sqrt(dx * dx + dz * dz) < e.r;
      });
    };

    const rowDepths = [0, 14, 30];
    const rowHeightRanges: [number, number][] = [[8, 22], [14, 32], [18, 45]];
    const rowSpacings = [8, 10, 12];

    let globalIdx = 0;

    for (const side of sides) {
      for (let row = 0; row < 3; row++) {
        const geomList = horizonGeoms[row]; // accumulate into the matching material bucket
        const depth = rowDepths[row];
        const [minH, maxH] = rowHeightRanges[row];
        const spacing = rowSpacings[row];
        const steps = Math.floor(side.length / spacing);

        for (let i = 0; i < steps; i++) {
          const t = (i + 0.5) / steps;
          const bx = side.startX + side.dx * t * side.length + side.normalX * depth;
          const bz = side.startZ + side.dz * t * side.length + side.normalZ * depth;

          if (isExcluded(bx, bz)) continue;

          const n = noise(globalIdx, row * 17 + 3);
          globalIdx++;

          if (n < 0.12) continue;

          const height = minH + noise(globalIdx, 7) * (maxH - minH);
          const width = spacing * (0.55 + noise(globalIdx, 11) * 0.4);
          const blockDepth = 5 + noise(globalIdx, 13) * 6;

          // Main building block
          bakeGeom(geomList, new THREE.BoxGeometry(width, height, blockDepth),
            bx, height / 2, bz,
            0, side.facingY, 0);

          let peakY = height;

          // Some buildings get a taller tower/penthouse on top (20% chance)
          if (noise(globalIdx, 19) > 0.80) {
            const towerWidth = width * (0.3 + noise(globalIdx, 23) * 0.3);
            const towerHeight = height * (0.3 + noise(globalIdx, 29) * 0.5);
            bakeGeom(geomList, new THREE.BoxGeometry(towerWidth, towerHeight, blockDepth * 0.5),
              bx, height + towerHeight / 2, bz,
              0, side.facingY, 0);
            if (height + towerHeight > peakY) peakY = height + towerHeight;
          }

          // Some buildings get a pitched roof cap (30% chance on shorter buildings)
          if (height < 20 && noise(globalIdx, 31) > 0.70) {
            const roofHeight = 2.5 + noise(globalIdx, 37) * 2.5;
            bakeGeom(geomList, new THREE.ConeGeometry(width * 0.52, roofHeight, 4),
              bx, height + roofHeight / 2, bz,
              0, side.facingY + Math.PI / 4, 0);
            if (height + roofHeight > peakY) peakY = height + roofHeight;
          }

          // Some taller buildings get a thin spire (15% chance on row 2+)
          if (row >= 1 && height > 25 && noise(globalIdx, 41) > 0.85) {
            const spireH = 6 + noise(globalIdx, 43) * 10;
            bakeGeom(geomList, new THREE.ConeGeometry(0.8, spireH, 4),
              bx, height + spireH / 2, bz,
              0, Math.PI / 4, 0);
            if (height + spireH > peakY) peakY = height + spireH;
          }

          // Warning beacon — stays as an individual Mesh (animates independently)
          if (peakY > 30.0) {
            const light = new THREE.Mesh(this.beaconGeom, this.redLightMaterial);
            light.position.set(bx, peakY + 0.4, bz);
            light.userData = { phaseOffset: (((globalIdx * 7.3) % 100) / 100) * BLINK_PERIOD };
            this.add(light);
            this.warningLights.push(light);
          }
        }
      }
    }

    // Flush each material bucket to a single merged mesh
    for (let i = 0; i < horizonMats.length; i++) {
      const mesh = flushMesh(horizonGeoms[i], horizonMats[i], true, false);
      if (mesh) this.add(mesh);
    }
  }


  public update(delta: number, running: boolean) {
    if (running && this.londonEyeWheel && this.londonEyeIronwork && this.londonEyePods) {
      this.londonEyeWheel.rotation.z += delta * 0.03;

      const upright = -this.londonEyeWheel.rotation.z;
      const position = new THREE.Vector3();
      const quaternion = new THREE.Quaternion();
      const scale = new THREE.Vector3(1, 1, 1);
      const matrix = new THREE.Matrix4();

      for (let i = 0; i < 16; i++) {
        const angle = (i / 16) * Math.PI * 2;
        const pivotX = Math.cos(angle) * 27.2;
        const pivotY = Math.sin(angle) * 27.2;

        position.set(pivotX, pivotY, 0);
        quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), upright);
        matrix.compose(position, quaternion, scale);

        this.londonEyeIronwork.setMatrixAt(i, matrix);
        this.londonEyePods.setMatrixAt(i, matrix);
      }
      this.londonEyeIronwork.instanceMatrix.needsUpdate = true;
      this.londonEyePods.instanceMatrix.needsUpdate = true;
    }

    // Update desynchronized warning lights visibility based on their respective phase offsets
    this.blinkTimer += delta;
    if (this.blinkTimer >= BLINK_PERIOD) {
      this.blinkTimer = Math.max(0, this.blinkTimer - BLINK_PERIOD);
    }

    this.warningLights.forEach((light) => {
      const offset = light.userData.phaseOffset || 0.0;
      const localTime = (this.blinkTimer + offset) % BLINK_PERIOD;
      light.visible = localTime < FLASH_DURATION;
    });
  }
}
