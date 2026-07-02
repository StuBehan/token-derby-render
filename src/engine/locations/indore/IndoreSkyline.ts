import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { addHorizonGround } from '../horizonGround';

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

export class IndoreSkyline extends THREE.Group {
  // Warning Lights Beacons
  private warningLights: THREE.Mesh[] = [];
  private blinkTimer = 0.0;

  // Shared geometry/material for beacon efficiency
  private beaconGeom = new THREE.BoxGeometry(0.4, 0.4, 0.4);
  private redLightMaterial = new THREE.MeshBasicMaterial({
    color: 0xff0000,
    toneMapped: false,
    fog: false,
  });

  constructor() {
    super();
    this.buildSkyline();
    this.buildHorizonFill();
  }

  private buildSkyline() {
    const wallMaterial = new THREE.MeshStandardMaterial({
      color: 0xdfb043, // Saturated butter-yellow plaster (bright daylight washes out paler tones)
      roughness: 0.75,
    });
    const trimMaterial = new THREE.MeshStandardMaterial({
      color: 0x5c1c14, // Deep, richly-saturated maroon-red window/cornice trim
      roughness: 0.6,
    });
    const gateWoodMaterial = new THREE.MeshStandardMaterial({
      color: 0x4a3018,
      roughness: 0.8,
    });
    const stoneMaterial = new THREE.MeshStandardMaterial({
      color: 0x847d6e, // Cooler, darker grey masonry base for contrast against the yellow walls
      roughness: 0.88,
    });
    const openingMaterial = new THREE.MeshStandardMaterial({
      color: 0x14100c, // Deep shadowed window/door recesses
      roughness: 0.9,
    });
    const domeGoldMaterial = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      roughness: 0.35,
      metalness: 0.6,
    });

    const wallGeoms: THREE.BufferGeometry[] = [];
    const trimGeoms: THREE.BufferGeometry[] = [];
    const gateWoodGeoms: THREE.BufferGeometry[] = [];
    const stoneGeoms: THREE.BufferGeometry[] = [];
    const openingGeoms: THREE.BufferGeometry[] = [];
    const domeGoldGeoms: THREE.BufferGeometry[] = [];

    // ── 1. Rajwada Palace (stacked rectangular block + hexagonal gate turrets) ──
    const rjX = -110;
    const rjZ = -165;
    const rjWidth = 34.0;
    const rjDepth = 9.0;
    const layerHeight = 3.0;
    const layerCount = 7; // ground-floor base + 6 replicated layers above it

    // Two hexagonal turrets flank the gate along the palace's front-facing (X) axis
    const hexRadius = 2.3;
    const hexOffset = 6.5;

    // Stack 7 identical rectangular layers into a single uniform block.
    // The ground layer is grey stone; the 6 layers above it are cream-walled.
    let ty = 0;
    for (let L = 0; L < layerCount; L++) {
      const isBase = L === 0;
      bakeGeom(isBase ? stoneGeoms : wallGeoms, new THREE.BoxGeometry(rjWidth, layerHeight, rjDepth), rjX, ty + layerHeight / 2, rjZ);
      bakeGeom(trimGeoms, new THREE.BoxGeometry(rjWidth + 0.3, 0.5, rjDepth + 0.3), rjX, ty + layerHeight, rjZ);

      if (!isBase) {
        const windowCount = 9;
        for (let w = 0; w < windowCount; w++) {
          const wx = rjX - rjWidth / 2 + ((w + 0.5) / windowCount) * rjWidth;
          // leave the two hex turrets room to breathe
          if (Math.abs(wx - (rjX - hexOffset)) < hexRadius + 0.3 || Math.abs(wx - (rjX + hexOffset)) < hexRadius + 0.3) continue;
          bakeGeom(trimGeoms, new THREE.BoxGeometry(1.7, layerHeight * 0.62, 0.3), wx, ty + layerHeight * 0.52, rjZ + rjDepth / 2 - 0.05);
          bakeGeom(openingGeoms, new THREE.BoxGeometry(0.9, layerHeight * 0.4, 0.32), wx, ty + layerHeight * 0.52, rjZ + rjDepth / 2 - 0.02);
        }
      }

      ty += layerHeight;
    }
    const blockTopY = ty;

    // Central wooden gate at ground level
    bakeGeom(gateWoodGeoms, new THREE.BoxGeometry(4.6, 4.2, 0.4), rjX, 2.4, rjZ + rjDepth / 2 + 0.15);
    bakeGeom(openingGeoms, new THREE.BoxGeometry(3.6, 3.6, 0.3), rjX, 2.2, rjZ + rjDepth / 2 + 0.2);
    bakeGeom(stoneGeoms, new THREE.CylinderGeometry(2.3, 2.3, 0.5, 12, 1, false, 0, Math.PI), rjX, 4.4, rjZ + rjDepth / 2 + 0.15, 0, 0, Math.PI / 2);

    // Two hexagonal turrets flanking the gate, straddling the base's front face
    // so roughly half their volume sits inside the block and half projects forward.
    const hexHeight = blockTopY - layerHeight * 0.5;
    const hexZ = rjZ + rjDepth / 2;
    let hexPeakY = hexHeight;
    for (const side of [-1, 1]) {
      const hx = rjX + side * hexOffset;
      bakeGeom(wallGeoms, new THREE.CylinderGeometry(hexRadius, hexRadius, hexHeight, 6), hx, hexHeight / 2, hexZ);

      // Trim bands ringing the turret at each layer height
      for (let L = 1; L < layerCount; L++) {
        bakeGeom(trimGeoms, new THREE.CylinderGeometry(hexRadius + 0.15, hexRadius + 0.15, 0.35, 6), hx, L * layerHeight, hexZ);
      }

      // A window per layer on the turret's front-most face
      const turretLayers = Math.floor(hexHeight / layerHeight);
      for (let L = 0; L < turretLayers; L++) {
        const wy = L * layerHeight + layerHeight * 0.5;
        bakeGeom(trimGeoms, new THREE.BoxGeometry(0.9, layerHeight * 0.5, 0.25), hx, wy, hexZ + hexRadius - 0.1);
        bakeGeom(openingGeoms, new THREE.BoxGeometry(0.6, layerHeight * 0.32, 0.28), hx, wy, hexZ + hexRadius - 0.05);
      }

      // Small domed cap
      bakeGeom(trimGeoms, new THREE.CylinderGeometry(hexRadius * 0.75, hexRadius * 0.75, 0.5, 8), hx, hexHeight + 0.4, hexZ);
      bakeGeom(domeGoldGeoms, new THREE.SphereGeometry(hexRadius * 0.8, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), hx, hexHeight + 0.9, hexZ);
      hexPeakY = hexHeight + 0.9 + hexRadius * 0.8;
    }

    // Blinking warning beacon at the top of the block
    const rajwadaLight = new THREE.Mesh(this.beaconGeom, this.redLightMaterial);
    rajwadaLight.position.set(rjX, Math.max(blockTopY, hexPeakY) + 0.4, rjZ);
    rajwadaLight.userData = { phaseOffset: 0.1 * BLINK_PERIOD };
    this.add(rajwadaLight);
    this.warningLights.push(rajwadaLight);

    const wallMesh = flushMesh(wallGeoms, wallMaterial);
    if (wallMesh) this.add(wallMesh);
    const trimMesh = flushMesh(trimGeoms, trimMaterial);
    if (trimMesh) this.add(trimMesh);
    const gateWoodMesh = flushMesh(gateWoodGeoms, gateWoodMaterial);
    if (gateWoodMesh) this.add(gateWoodMesh);
    const stoneMesh = flushMesh(stoneGeoms, stoneMaterial);
    if (stoneMesh) this.add(stoneMesh);
    const openingMesh = flushMesh(openingGeoms, openingMaterial, false, false);
    if (openingMesh) this.add(openingMesh);

    // ── 2. Mahatma Gandhi Hall (colonial Gothic town hall, formerly King Edward Hall) ──
    const gmX = 25;
    const gmZ = -185;

    const hallWallGeoms: THREE.BufferGeometry[] = [];
    const hallTrimGeoms: THREE.BufferGeometry[] = [];
    const hallWindowGeoms: THREE.BufferGeometry[] = [];
    const clockFaceGeoms: THREE.BufferGeometry[] = [];

    // Main two-floor hall block
    const hallWidth = 20.0;
    const hallDepth = 12.0;
    const hallHeight = 8.0;
    bakeGeom(hallWallGeoms, new THREE.BoxGeometry(hallWidth, hallHeight, hallDepth), gmX, hallHeight / 2, gmZ);
    bakeGeom(hallTrimGeoms, new THREE.BoxGeometry(hallWidth + 0.4, 0.4, hallDepth + 0.4), gmX, hallHeight, gmZ);

    // Two rows of Gothic pointed-arch windows across the front face
    const winRows = 2;
    const winCols = 5;
    const rowHeight = hallHeight / winRows;
    for (let r = 0; r < winRows; r++) {
      const wy = (r + 0.5) * rowHeight;
      for (let c = 0; c < winCols; c++) {
        const wx = gmX - hallWidth / 2 + ((c + 0.5) / winCols) * hallWidth;
        bakeGeom(hallTrimGeoms, new THREE.BoxGeometry(2.0, rowHeight * 0.62, 0.3), wx, wy, gmZ + hallDepth / 2 - 0.05);
        bakeGeom(hallWindowGeoms, new THREE.BoxGeometry(1.5, rowHeight * 0.44, 0.32), wx, wy, gmZ + hallDepth / 2 - 0.02);
        bakeGeom(hallTrimGeoms, new THREE.ConeGeometry(1.0, 0.8, 4), wx, wy + rowHeight * 0.42, gmZ + hallDepth / 2 - 0.05, 0, Math.PI / 4, 0);
      }
    }

    // Four corner pinnacles atop the main hall roof
    for (const [dx, dz] of [[-hallWidth / 2 + 1.5, -hallDepth / 2 + 1.5], [hallWidth / 2 - 1.5, -hallDepth / 2 + 1.5], [-hallWidth / 2 + 1.5, hallDepth / 2 - 1.5], [hallWidth / 2 - 1.5, hallDepth / 2 - 1.5]] as const) {
      bakeGeom(hallTrimGeoms, new THREE.CylinderGeometry(0.4, 0.5, 2.0, 8), gmX + dx, hallHeight + 1.0, gmZ + dz);
      bakeGeom(hallTrimGeoms, new THREE.ConeGeometry(0.5, 1.2, 6), gmX + dx, hallHeight + 2.6, gmZ + dz);
    }

    // Central clock tower rising above the roofline
    const towerWidth = 6.0;
    const towerBaseY = hallHeight;
    const towerHeight = 12.0;
    bakeGeom(hallWallGeoms, new THREE.BoxGeometry(towerWidth, towerHeight, towerWidth), gmX, towerBaseY + towerHeight / 2, gmZ);
    bakeGeom(hallTrimGeoms, new THREE.BoxGeometry(towerWidth + 0.3, 0.3, towerWidth + 0.3), gmX, towerBaseY + towerHeight, gmZ);

    // Clock faces on all 4 sides
    for (const rot of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const basePos = new THREE.Vector3(0, towerBaseY + towerHeight * 0.75, towerWidth / 2 + 0.1);
      basePos.applyAxisAngle(new THREE.Vector3(0, 1, 0), rot);
      basePos.add(new THREE.Vector3(gmX, 0, gmZ));
      const g = new THREE.BoxGeometry(2.4, 2.4, 0.15).clone();
      g.applyMatrix4(
        new THREE.Matrix4().compose(
          basePos,
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rot, 0)),
          new THREE.Vector3(1, 1, 1),
        ),
      );
      clockFaceGeoms.push(g);
    }

    // Pointed spire roof, finial and flagpole
    bakeGeom(hallTrimGeoms, new THREE.ConeGeometry(towerWidth * 0.72, 4.0, 4), gmX, towerBaseY + towerHeight + 2.0, gmZ, 0, Math.PI / 4, 0);
    bakeGeom(domeGoldGeoms, new THREE.SphereGeometry(0.4, 8, 6), gmX, towerBaseY + towerHeight + 4.2, gmZ);
    bakeGeom(domeGoldGeoms, new THREE.ConeGeometry(0.08, 1.2, 6), gmX, towerBaseY + towerHeight + 5.0, gmZ);
    const towerPeakY = towerBaseY + towerHeight + 5.6;

    // Entrance portico with pillars
    for (const side of [-1, 1]) {
      bakeGeom(hallTrimGeoms, new THREE.CylinderGeometry(0.5, 0.5, 4.0, 10), gmX + side * 3.0, 2.0, gmZ + hallDepth / 2 + 1.0);
    }
    bakeGeom(hallTrimGeoms, new THREE.BoxGeometry(7.0, 0.5, 3.0), gmX, 4.2, gmZ + hallDepth / 2 + 1.0);

    // Blinking warning beacon on the flagpole tip
    const gandhiHallLight = new THREE.Mesh(this.beaconGeom, this.redLightMaterial);
    gandhiHallLight.position.set(gmX, towerPeakY, gmZ);
    gandhiHallLight.userData = { phaseOffset: 0.6 * BLINK_PERIOD };
    this.add(gandhiHallLight);
    this.warningLights.push(gandhiHallLight);

    const hallWallMaterial = new THREE.MeshStandardMaterial({
      color: 0xf0e8d4, // Cream-white colonial plaster
      roughness: 0.65,
    });
    const hallTrimMaterial = new THREE.MeshStandardMaterial({
      color: 0xc9c2ac, // Pale grey-stone Gothic trim
      roughness: 0.75,
    });
    const hallWindowMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1e22,
      roughness: 0.3,
      metalness: 0.2,
    });
    const clockFaceMaterial = new THREE.MeshStandardMaterial({
      color: 0xe8ddc0,
      roughness: 0.5,
    });

    const hallWallMesh = flushMesh(hallWallGeoms, hallWallMaterial);
    if (hallWallMesh) this.add(hallWallMesh);
    const hallTrimMesh = flushMesh(hallTrimGeoms, hallTrimMaterial);
    if (hallTrimMesh) this.add(hallTrimMesh);
    const hallWindowMesh = flushMesh(hallWindowGeoms, hallWindowMaterial, false, false);
    if (hallWindowMesh) this.add(hallWindowMesh);
    const clockFaceMesh = flushMesh(clockFaceGeoms, clockFaceMaterial);
    if (clockFaceMesh) this.add(clockFaceMesh);
    const domeGoldMesh = flushMesh(domeGoldGeoms, domeGoldMaterial);
    if (domeGoldMesh) this.add(domeGoldMesh);
  }

  private buildHorizonFill() {
    // Deterministic noise for consistent layout
    const noise = (i: number, salt: number) => {
      const v = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
      return v - Math.floor(v);
    };

    // Materials – muted flat-roofed apartment-block tones
    const horizonMats = [
      new THREE.MeshStandardMaterial({ color: 0xc9b89a, roughness: 0.92, metalness: 0.04 }),
      new THREE.MeshStandardMaterial({ color: 0xb7a688, roughness: 0.94, metalness: 0.04 }),
      new THREE.MeshStandardMaterial({ color: 0xa89478, roughness: 0.96, metalness: 0.02 }),
    ];
    const tankMaterial = new THREE.MeshStandardMaterial({ color: 0x8a8f92, roughness: 0.6, metalness: 0.3 });

    const horizonGeoms: THREE.BufferGeometry[][] = horizonMats.map(() => []);
    const tankGeoms: THREE.BufferGeometry[] = [];

    const sides = [
      { label: 'N', startX: -180, startZ: -155, dx: 1, dz: 0, normalX: 0, normalZ: -1, length: 360, facingY: 0 },
      { label: 'S', startX: -180, startZ: 155, dx: 1, dz: 0, normalX: 0, normalZ: 1, length: 360, facingY: Math.PI },
      { label: 'W', startX: -175, startZ: -150, dx: 0, dz: 1, normalX: -1, normalZ: 0, length: 300, facingY: -Math.PI / 2 },
      { label: 'E', startX: 175, startZ: -150, dx: 0, dz: 1, normalX: 1, normalZ: 0, length: 300, facingY: Math.PI / 2 },
    ];

    addHorizonGround(this);

    // Exclusion zones where named landmarks sit
    const exclusions = [
      { x: -110, z: -165, r: 22 }, // Rajwada Palace
      { x: 25, z: -185, r: 20 },   // Mahatma Gandhi Hall
    ];

    const isExcluded = (px: number, pz: number) => {
      return exclusions.some(e => {
        const dx = px - e.x;
        const dz = pz - e.z;
        return Math.sqrt(dx * dx + dz * dz) < e.r;
      });
    };

    const rowDepths = [0, 14, 30];
    const rowHeightRanges: [number, number][] = [[8, 18], [10, 24], [12, 30]];
    const rowSpacings = [8, 10, 12];

    let globalIdx = 0;

    for (const side of sides) {
      for (let row = 0; row < 3; row++) {
        const geomList = horizonGeoms[row];
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

          // Main flat-roofed building block
          bakeGeom(geomList, new THREE.BoxGeometry(width, height, blockDepth),
            bx, height / 2, bz,
            0, side.facingY, 0);

          // Small parapet trim along the roofline
          bakeGeom(geomList, new THREE.BoxGeometry(width * 0.96, 0.4, blockDepth * 0.96),
            bx, height + 0.2, bz,
            0, side.facingY, 0);

          // Rooftop water tank — very common Indian urban skyline signature (35% chance)
          if (noise(globalIdx, 19) > 0.65) {
            const tankR = 0.5 + noise(globalIdx, 23) * 0.5;
            bakeGeom(tankGeoms, new THREE.CylinderGeometry(tankR, tankR, tankR * 1.6, 8),
              bx + width * 0.25, height + tankR * 0.8, bz,
              0, side.facingY, 0);
          }

          // Warning beacon on taller blocks
          if (height > 24.0) {
            const light = new THREE.Mesh(this.beaconGeom, this.redLightMaterial);
            light.position.set(bx, height + 0.4, bz);
            light.userData = { phaseOffset: (((globalIdx * 7.3) % 100) / 100) * BLINK_PERIOD };
            this.add(light);
            this.warningLights.push(light);
          }
        }
      }
    }

    for (let i = 0; i < horizonMats.length; i++) {
      const mesh = flushMesh(horizonGeoms[i], horizonMats[i], true, false);
      if (mesh) this.add(mesh);
    }
    const tankMesh = flushMesh(tankGeoms, tankMaterial, true, false);
    if (tankMesh) this.add(tankMesh);
  }

  public update(delta: number, _running: boolean) {
    // Update desynchronized warning lights visibility based on their respective phase offsets
    this.blinkTimer += delta;
    if (this.blinkTimer >= BLINK_PERIOD) {
      this.blinkTimer = Math.max(0, this.blinkTimer - BLINK_PERIOD);
    }

    this.warningLights.forEach((light) => {
      const offset = (light.userData.phaseOffset as number) || 0.0;
      const localTime = (this.blinkTimer + offset) % BLINK_PERIOD;
      light.visible = localTime < FLASH_DURATION;
    });
  }
}
