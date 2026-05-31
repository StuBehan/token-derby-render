import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { InstancedCrowd } from './InstancedCrowd';
import { createTexturedMaterial } from './Textures';

export interface GrandstandConfig {
  /** Total width of the grandstand. Defaults to 70.4. */
  width?: number;
  /** Number of rows of seats/tiers. Defaults to 7. */
  rowCount?: number;
  /** Number of front roof columns/posts. Defaults to 5. */
  poleCount?: number;
  /** Number of main support columns. Defaults to 4. */
  columnCount?: number;
  /** Number of aisles/staircases. Defaults to 3. */
  aisleCount?: number;
}

export class Grandstand extends THREE.Group {
  private readonly config: Required<GrandstandConfig>;
  private scoreboardCanvas!: HTMLCanvasElement;
  private scoreboardCtx!: CanvasRenderingContext2D;
  private scoreboardTexture!: THREE.CanvasTexture;
  private scrollOffset = 0;
  private crowd!: InstancedCrowd;
  private crowdTime = 0.0;

  constructor(config: GrandstandConfig = {}) {
    super();

    // Set up default parameters
    this.config = {
      width: config.width ?? 70.4,
      rowCount: config.rowCount ?? 7,
      poleCount: config.poleCount ?? 5,
      columnCount: config.columnCount ?? 4,
      aisleCount: config.aisleCount ?? 3,
    };

    this.position.set(-8, 0, -48.5);
    this.scale.set(0.94, 0.84, 0.94);
    this.build();
  }

  private build() {
    // Deferred geometry lists — merged to single meshes at the end of build()
    const _concreteGeoms: THREE.BufferGeometry[] = [];
    const _shadowGeoms: THREE.BufferGeometry[] = [];
    const _roofTrimGeoms: THREE.BufferGeometry[] = [];
    const _railGeoms: THREE.BufferGeometry[] = [];

    /** Helper: clone a geometry, bake in world-space transform, push into list. */
    const _pos = new THREE.Vector3();
    const _quat = new THREE.Quaternion();
    const _scale = new THREE.Vector3(1, 1, 1);
    const _euler = new THREE.Euler();
    const _mat4 = new THREE.Matrix4();
    const deferGeom = (
      list: THREE.BufferGeometry[],
      geom: THREE.BufferGeometry,
      x: number, y: number, z: number,
      rx = 0, ry = 0, rz = 0,
      sx = 1, sy = 1, sz = 1,
    ) => {
      const g = geom.clone();
      _pos.set(x, y, z);
      _euler.set(rx, ry, rz);
      _quat.setFromEuler(_euler);
      _scale.set(sx, sy, sz);
      _mat4.compose(_pos, _quat, _scale);
      g.applyMatrix4(_mat4);
      list.push(g);
    };

    /** Flush a deferred list to a single merged Mesh. */
    const flushMerge = (
      list: THREE.BufferGeometry[],
      material: THREE.Material,
      castShadow: boolean,
      receiveShadow: boolean,
    ) => {
      if (list.length === 0) return;
      const merged = mergeGeometries(list);
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = castShadow;
      mesh.receiveShadow = receiveShadow;
      this.add(mesh);
      list.forEach(g => g.dispose());
      list.length = 0;
    };
    const concreteMaterial = createTexturedMaterial('concrete', 0x687079, 10, 4, { roughness: 0.82 });
    const shadowMaterial = new THREE.MeshStandardMaterial({ color: 0x252b31, roughness: 0.75 });
    const aisleMaterial = new THREE.MeshStandardMaterial({ color: 0xd8d2c5, roughness: 0.62 });
    const railMaterial = new THREE.MeshStandardMaterial({ color: 0xf4ead6, roughness: 0.48 });
    const roofMaterial = createTexturedMaterial('roof', 0xd8d6cd, 9, 3, { roughness: 0.42 });
    const roofTrimMaterial = new THREE.MeshStandardMaterial({ color: 0x34414a, roughness: 0.55 });
    const endCapMaterial = new THREE.MeshStandardMaterial({
      color: 0x1b2227,
      roughness: 0.76,
      side: THREE.DoubleSide,
    });
    const seatMaterials = [0xb8493b, 0x2f6f9f, 0xd7ae3f].map(
      (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.58 }),
    );
    const crowdColors = [0x1f4a63, 0xb94f3f, 0xd0a23b, 0x3f6a45, 0x6a4f8f, 0xd8d2c5];

    // GPU-instanced crowd renderer
    this.crowd = new InstancedCrowd();
    const crowd = this.crowd;

    const standWidth = this.config.width;
    const seatRowWidth = standWidth - 0.4;
    const R = this.config.rowCount;

    // 1. Podium
    const podium = new THREE.Mesh(new THREE.BoxGeometry(standWidth, 2.4, 13), shadowMaterial);
    podium.position.set(0, 1.2, 0);
    podium.castShadow = true;
    podium.receiveShadow = true;
    this.add(podium);

    // 2. Rear Wall & Seat Coordinates
    const rearmostTreadZ = 4.9 - (R - 1) * 1.85;
    const rearWallZ = rearmostTreadZ - 2.4;
    const rearmostSeatTopY = 3.90 + (R - 1) * 1.25;
    const rearWallHeight = rearmostSeatTopY + 0.9;
    const rearWallY = 2.4 + rearWallHeight / 2;

    deferGeom(_shadowGeoms, new THREE.BoxGeometry(standWidth, rearWallHeight, 1.1), 0, rearWallY, rearWallZ);

    // 3. Side Profile (End caps)
    const bottomZ = 12.05;
    const topZ = rearmostTreadZ;
    const totalDepth = bottomZ - topZ;
    const targetHeight = 3.50 + (R - 1) * 1.25;
    const roofY = rearmostSeatTopY + 3.55;

    const sideProfile = new THREE.Shape();
    sideProfile.moveTo(-bottomZ, 0);
    sideProfile.lineTo(-bottomZ, 0.4);
    sideProfile.lineTo(-topZ, targetHeight + 0.4);
    sideProfile.lineTo(-rearWallZ, targetHeight + 0.4);
    sideProfile.lineTo(-rearWallZ, 0);
    sideProfile.lineTo(-bottomZ, 0);

    for (const x of [-standWidth / 2, standWidth / 2]) {
      const endCap = new THREE.Mesh(new THREE.ShapeGeometry(sideProfile), endCapMaterial);
      endCap.position.set(x, 0, 0);
      endCap.rotation.y = Math.PI / 2;
      endCap.castShadow = true;
      endCap.receiveShadow = true;
      this.add(endCap);
    }

    // 4. Side Stairs
    for (const x of [-(standWidth / 2 + 2.4), (standWidth / 2 + 2.4)]) {
      this.addGrandstandEntryStairs(x, concreteMaterial, railMaterial);
    }

    // 5. Columns, Aisles & Fascia positioning
    const columnXPositions: number[] = [];
    if (this.config.columnCount === 4 && standWidth === 70.4) {
      columnXPositions.push(-32, -16, 16, 32);
    } else {
      const colMargin = 3.2;
      const colSpacing = (standWidth - 2 * colMargin) / Math.max(1, this.config.columnCount - 1);
      for (let i = 0; i < this.config.columnCount; i++) {
        columnXPositions.push(-standWidth / 2 + colMargin + i * colSpacing);
      }
    }

    const aisleXPositions: number[] = [];
    if (this.config.aisleCount === 3 && standWidth === 70.4) {
      aisleXPositions.push(-24, 0, 24);
    } else {
      const aisleMargin = 11.2;
      const aisleSpacing = (standWidth - 2 * aisleMargin) / Math.max(1, this.config.aisleCount - 1);
      for (let i = 0; i < this.config.aisleCount; i++) {
        aisleXPositions.push(-standWidth / 2 + aisleMargin + i * aisleSpacing);
      }
    }

    const poleXPositions: number[] = [];
    const poleMargin = 1.2;
    const poleSpacing = (standWidth - 2 * poleMargin) / Math.max(1, this.config.poleCount - 1);
    for (let i = 0; i < this.config.poleCount; i++) {
      poleXPositions.push(-standWidth / 2 + poleMargin + i * poleSpacing);
    }

    // 6. Rows of Seats and Spectators
    const segments: { x: number; width: number }[] = [];
    const sortedAisles = [...aisleXPositions].sort((a, b) => a - b);
    const leftBoundary = -seatRowWidth / 2;
    const rightBoundary = seatRowWidth / 2;
    const halfAisleWidth = 1.1;

    let currentLeft = leftBoundary;
    for (const aisleX of sortedAisles) {
      const segmentRight = aisleX - halfAisleWidth;
      const segmentWidth = segmentRight - currentLeft;
      if (segmentWidth > 0.1) {
        segments.push({
          x: currentLeft + segmentWidth / 2,
          width: segmentWidth,
        });
      }
      currentLeft = aisleX + halfAisleWidth;
    }
    const finalWidth = rightBoundary - currentLeft;
    if (finalWidth > 0.1) {
      segments.push({
        x: currentLeft + finalWidth / 2,
        width: finalWidth,
      });
    }

    const pedestalMatrices: THREE.Matrix4[] = [];
    const cushionMatrices: THREE.Matrix4[][] = seatMaterials.map(() => []);
    const backMatrices: THREE.Matrix4[][] = seatMaterials.map(() => []);

    for (let row = 0; row < R; row += 1) {
      const tierDepth = 2.15;
      
      for (const segment of segments) {
        // Defer tread & riser into merged concrete geometry
        deferGeom(_concreteGeoms, new THREE.BoxGeometry(segment.width, 0.32, tierDepth),
          segment.x, 3.24 + row * 1.25, 4.9 - row * 1.85);
        deferGeom(_concreteGeoms, new THREE.BoxGeometry(segment.width, 1.18, 0.34),
          segment.x, 2.8 + row * 1.25, 5.82 - row * 1.85);

        const seatWidth = Math.max(0.2, segment.width - 0.4);
        
        // Collect seat transforms inside this segment
        const spacing = 0.9;
        const columns = Math.floor(seatWidth / spacing);
        const startX = segment.x - ((columns - 1) * spacing) / 2;
        const yPositionSeat = 3.66 + row * 1.25;
        const zPositionSeat = 5.25 - row * 1.85;

        for (let column = 0; column < columns; column += 1) {
          const seatX = startX + column * spacing;

          // Pedestal (metal bracket)
          const pedMat = new THREE.Matrix4().makeTranslation(seatX, yPositionSeat - 0.22, zPositionSeat - 0.05);
          pedestalMatrices.push(pedMat);

          // Seat Cushion
          const colorIdx = row % seatMaterials.length;
          const cushMat = new THREE.Matrix4().makeTranslation(seatX, yPositionSeat - 0.06, zPositionSeat - 0.05);
          cushionMatrices[colorIdx].push(cushMat);

          // Seat Back
          const backPos = new THREE.Vector3(seatX, yPositionSeat + 0.18, zPositionSeat - 0.28);
          const backRot = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.12, 0, 0));
          const backScl = new THREE.Vector3(1, 1, 1);
          const backMat = new THREE.Matrix4().compose(backPos, backRot, backScl);
          backMatrices[colorIdx].push(backMat);
        }

        crowd.addRow(
          row,
          segment.x,
          seatWidth,
          3.64 + row * 1.25, // Sitting Y level (cushion top)
          5.20 - row * 1.85, // Sitting Z level (cushion center)
          crowdColors,
        );
      }
    }

    // Bake all spectator instances into GPU-batched InstancedMesh draw calls
    crowd.build();
    this.add(crowd);

    // Bake all seat components into GPU-batched InstancedMesh draw calls to optimize draw calls
    if (pedestalMatrices.length > 0) {
      const pedestalGeom = new THREE.BoxGeometry(0.15, 0.32, 0.15);
      const pedestalMesh = new THREE.InstancedMesh(pedestalGeom, shadowMaterial, pedestalMatrices.length);
      pedestalMesh.castShadow = false;
      pedestalMesh.receiveShadow = true;
      pedestalMatrices.forEach((m, idx) => pedestalMesh.setMatrixAt(idx, m));
      this.add(pedestalMesh);
    }

    const cushionGeom = new THREE.BoxGeometry(0.68, 0.08, 0.54);
    for (let i = 0; i < seatMaterials.length; i++) {
      const matrices = cushionMatrices[i];
      if (matrices.length > 0) {
        const cushionMesh = new THREE.InstancedMesh(cushionGeom, seatMaterials[i], matrices.length);
        cushionMesh.castShadow = false;
        cushionMesh.receiveShadow = true;
        matrices.forEach((m, idx) => cushionMesh.setMatrixAt(idx, m));
        this.add(cushionMesh);
      }
    }

    const backGeom = new THREE.BoxGeometry(0.68, 0.50, 0.08);
    for (let i = 0; i < seatMaterials.length; i++) {
      const matrices = backMatrices[i];
      if (matrices.length > 0) {
        const backMesh = new THREE.InstancedMesh(backGeom, seatMaterials[i], matrices.length);
        backMesh.castShadow = false;
        backMesh.receiveShadow = true;
        matrices.forEach((m, idx) => backMesh.setMatrixAt(idx, m));
        this.add(backMesh);
      }
    }

    // 7. Stair Runs
    for (const x of aisleXPositions) {
      const bottomZ = 7;
      const topZ = 4.9 - (R - 1) * 1.85;
      const totalDepth = bottomZ - topZ;
      const targetHeight = (3.24 + (R - 1) * 1.25) - 2.1;

      const stepCount = R * 3;
      const riserHeight = targetHeight / stepCount;
      const treadDepth = totalDepth / stepCount;

      this.addGrandstandStairRun({
        x,
        railPosition: 'center',
        bottomZ,
        width: 2.2,
        treadDepth,
        riserHeight,
        baseHeight: 2.1,
        targetHeight,
        stairThickness: 0.3,
        landingDepth: 0,
        material: concreteMaterial,
        railMaterial,
        withRails: true,
        supportsToGround: false,
      });
    }

    // 8. Main Support Columns — deferred into shadow merged mesh
    const colHeight = rearmostSeatTopY + 1.3;
    const colY = 2.3 + colHeight / 2;
    for (const x of columnXPositions) {
      deferGeom(_shadowGeoms, new THREE.CylinderGeometry(0.3, 0.42, colHeight, 10), x, colY, -6.8);
    }

    // 9. Front Wall & Rail
    deferGeom(_shadowGeoms, new THREE.BoxGeometry(standWidth, 2.2, 0.65), 0, 2.15, 7.0);

    // Scoreboard metal frame/housing
    const frameGeo = new THREE.BoxGeometry(standWidth * 0.65 + 0.32, 3.00 + 0.16, 0.08);
    const frameMesh = new THREE.Mesh(frameGeo, shadowMaterial);
    frameMesh.position.set(0, 1.58, 7.30);
    this.add(frameMesh);

    // 10. Scoreboard LED Ticker Board
    this.scoreboardCanvas = document.createElement('canvas');
    this.scoreboardCanvas.width = 4096;
    this.scoreboardCanvas.height = 256;
    this.scoreboardCtx = this.scoreboardCanvas.getContext('2d')!;
    this.scoreboardTexture = new THREE.CanvasTexture(this.scoreboardCanvas);

    const tickerMaterial = new THREE.MeshBasicMaterial({
      map: this.scoreboardTexture,
    });

    const tickerBoard = new THREE.Mesh(new THREE.BoxGeometry(standWidth * 0.65, 3.00, 0.05), tickerMaterial);
    tickerBoard.position.set(0, 1.58, 7.35); // flush on frontWall
    this.add(tickerBoard);

    // Front rail + posts — deferred into merged rail mesh
    deferGeom(_railGeoms, new THREE.BoxGeometry(standWidth - 0.6, 0.15, 0.35), 0, 3.8, 7.0);

    // Front rail posts
    const railPostCount = this.config.poleCount;
    for (let i = 0; i < railPostCount; i++) {
      const x = -standWidth / 2 + 2.2 + i * (standWidth - 4.4) / Math.max(1, railPostCount - 1);
      deferGeom(_railGeoms, new THREE.CylinderGeometry(0.12, 0.12, 1.35, 8), x, 3.2, 7.0);
    }

    // 10. Roof canopy
    const roofDepth = 10.0 - rearWallZ;
    const roofCenterZ = (10.0 + rearWallZ) / 2;

    const roof = new THREE.Mesh(new THREE.BoxGeometry(standWidth + 5.6, 0.85, roofDepth), roofMaterial);
    roof.position.set(0, roofY, roofCenterZ);
    roof.castShadow = true;
    this.add(roof);

    const fascia = new THREE.Mesh(new THREE.BoxGeometry(standWidth + 6.6, 1.1, 0.8), roofTrimMaterial);
    fascia.position.set(0, roofY - 0.85, 10.0);
    fascia.castShadow = true;
    this.add(fascia);

    this.addRoofDownlights(standWidth, roofY, 8.25);

    // Fascia poles and cantilevers — deferred into merged roofTrim mesh
    const fasciaPostHeight = (roofY - 0.85) - 3.4;
    const fasciaPostY = 3.4 + fasciaPostHeight / 2;

    for (const x of poleXPositions) {
      deferGeom(_roofTrimGeoms, new THREE.CylinderGeometry(0.18, 0.22, fasciaPostHeight, 8), x, fasciaPostY, 7.0);
      deferGeom(_roofTrimGeoms, new THREE.BoxGeometry(0.28, 0.24, 3.15), x, roofY - 0.85, 8.5);
    }

    for (const x of [-standWidth / 2 + 1.2, standWidth / 2 - 1.2]) {
      deferGeom(_roofTrimGeoms, new THREE.BoxGeometry(0.9, 1.1, roofDepth), x, roofY - 0.6, roofCenterZ);
    }

    // --- Flush all deferred geometry lists to single merged meshes ---
    flushMerge(_concreteGeoms, concreteMaterial, false, true);
    flushMerge(_shadowGeoms,   shadowMaterial,   true,  true);
    flushMerge(_roofTrimGeoms, roofTrimMaterial, true,  false);
    flushMerge(_railGeoms,     railMaterial,     true,  false);
  }

  private addRoofDownlights(standWidth: number, roofY: number, z: number) {
    const fixtureMaterial = new THREE.MeshStandardMaterial({ color: 0x111719, roughness: 0.46 });
    const glowMaterial = new THREE.MeshStandardMaterial({
      color: 0xfff1c4,
      emissive: 0xffd58a,
      emissiveIntensity: 1.1,
      roughness: 0.22,
    });
    const count = 10;
    const activeLightEvery = 3;
    const usableWidth = standWidth - 8;
    const spacing = usableWidth / (count - 1);

    const fixtureBaseGeom = new THREE.BoxGeometry(1.25, 0.18, 0.55);
    const lensBaseGeom = new THREE.BoxGeometry(0.92, 0.05, 0.38);
    const fixtureGeoms: THREE.BufferGeometry[] = [];
    const lensGeoms: THREE.BufferGeometry[] = [];

    const _fp = new THREE.Vector3();
    const _fm = new THREE.Matrix4();

    for (let index = 0; index < count; index += 1) {
      const x = -usableWidth / 2 + index * spacing;

      const fg = fixtureBaseGeom.clone();
      _fp.set(x, roofY - 1.32, z);
      _fm.identity();
      _fm.setPosition(_fp);
      fg.applyMatrix4(_fm);
      fixtureGeoms.push(fg);

      const lg = lensBaseGeom.clone();
      _fp.set(x, roofY - 1.43, z);
      _fm.setPosition(_fp);
      lg.applyMatrix4(_fm);
      lensGeoms.push(lg);

      if (index % activeLightEvery === 0 || index === count - 1) {
        const light = new THREE.PointLight(0xffdf9a, 0.85, 11, 1.8);
        light.position.set(x, roofY - 1.7, z);
        this.add(light);
      }
    }

    fixtureBaseGeom.dispose();
    lensBaseGeom.dispose();

    if (fixtureGeoms.length > 0) {
      const merged = mergeGeometries(fixtureGeoms);
      const mesh = new THREE.Mesh(merged, fixtureMaterial);
      mesh.castShadow = true;
      this.add(mesh);
      fixtureGeoms.forEach(g => g.dispose());
    }

    if (lensGeoms.length > 0) {
      const merged = mergeGeometries(lensGeoms);
      const mesh = new THREE.Mesh(merged, glowMaterial);
      this.add(mesh);
      lensGeoms.forEach(g => g.dispose());
    }
  }

  private addGrandstandEntryStairs(
    x: number,
    concreteMaterial: THREE.Material,
    railMaterial: THREE.Material,
  ) {
    const direction = Math.sign(x);
    const width = 2.2;
    const standWidth = this.config.width;
    const stairX = direction * (standWidth / 2 + width / 2);

    const R = this.config.rowCount;
    const bottomZ = 12.05;
    const topZ = 4.9 - (R - 1) * 1.85;
    const totalDepth = bottomZ - topZ;
    
    // Aligned with the top of the back row of seats:
    // baseHeight (0.4) + targetHeight = 3.90 + (R - 1) * 1.25
    const targetHeight = 3.50 + (R - 1) * 1.25;

    const approxRiser = 0.4;
    const stepCount = Math.ceil(targetHeight / approxRiser);
    const actualRiserHeight = targetHeight / stepCount;
    const treadDepth = totalDepth / stepCount;

    this.addGrandstandStairRun({
      x: stairX,
      railPosition: direction > 0 ? 'right' : 'left',
      bottomZ,
      width,
      treadDepth,
      riserHeight: actualRiserHeight,
      baseHeight: 0.4,
      targetHeight,
      stairThickness: 0.3,
      landingDepth: 1.7,
      material: concreteMaterial,
      railMaterial,
      withRails: true,
    });
  }

  private addGrandstandStairRun(
    options: {
      x: number;
      railPosition?: 'left' | 'right' | 'center';
      bottomZ: number;
      width: number;
      treadDepth: number;
      riserHeight: number;
      baseHeight: number;
      targetHeight: number;
      stairThickness: number;
      landingDepth: number;
      material: THREE.Material;
      railMaterial: THREE.Material;
      withRails: boolean;
      supportsToGround?: boolean;
    },
  ) {
    const {
      x,
      railPosition = 'center',
      bottomZ,
      width,
      treadDepth,
      riserHeight,
      baseHeight,
      targetHeight,
      stairThickness,
      landingDepth,
      material,
      railMaterial,
      withRails,
      supportsToGround = true,
    } = options;

    let railX = x;
    if (railPosition === 'left') {
      railX = x - width / 2;
    } else if (railPosition === 'right') {
      railX = x + width / 2;
    }
    const stepCount = Math.ceil(targetHeight / riserHeight);
    const actualHeight = stepCount * riserHeight;
    const topZ = bottomZ - stepCount * treadDepth;

    // --- Merge all concrete stair treads into one mesh ---
    const concreteGeoms: THREE.BufferGeometry[] = [];
    const _sp = new THREE.Vector3();
    const _sq = new THREE.Quaternion();
    const _ss = new THREE.Vector3(1, 1, 1);
    const _sm = new THREE.Matrix4();
    const pushGeom = (list: THREE.BufferGeometry[], geom: THREE.BufferGeometry, px: number, py: number, pz: number, rx = 0, sy = 1) => {
      const g = geom.clone();
      _sp.set(px, py, pz);
      _sq.identity();
      if (rx !== 0) _sq.setFromEuler(new THREE.Euler(rx, 0, 0));
      _ss.set(1, sy, 1);
      _sm.compose(_sp, _sq, _ss);
      g.applyMatrix4(_sm);
      list.push(g);
    };

    const stepGeom = new THREE.BoxGeometry(width, stairThickness, treadDepth);
    for (let step = 0; step < stepCount; step += 1) {
      const stepTop = (step + 1) * riserHeight;
      pushGeom(concreteGeoms, stepGeom,
        x,
        baseHeight + stepTop - stairThickness / 2,
        bottomZ - step * treadDepth - treadDepth / 2,
      );
    }
    stepGeom.dispose();

    if (landingDepth > 0) {
      const landingGeom = new THREE.BoxGeometry(width, stairThickness, landingDepth);
      pushGeom(concreteGeoms, landingGeom, x, baseHeight + actualHeight - stairThickness / 2, topZ - landingDepth / 2);
      landingGeom.dispose();
    }

    if (concreteGeoms.length > 0) {
      const merged = mergeGeometries(concreteGeoms);
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      this.add(mesh);
      concreteGeoms.forEach(g => g.dispose());
    }

    if (!withRails) {
      return;
    }

    // --- Merge all rail ironwork (supports, posts, sloped rails) into one mesh ---
    const railGeoms: THREE.BufferGeometry[] = [];
    const postHeight = riserHeight * 3;
    const railClearance = 0.25;
    const postSteps = new Set<number>([0, stepCount]);
    for (let step = 3; step < stepCount; step += 3) {
      postSteps.add(step);
    }

    const railPoints = [...postSteps].sort((a, b) => a - b).map((step) => {
      const stepHeight = step * riserHeight;
      return {
        step,
        y: baseHeight + stepHeight + railClearance + postHeight / 2,
        z: bottomZ - step * treadDepth,
      };
    });

    const supportGeom = new THREE.BoxGeometry(0.18, 1, 0.18); // scaled via sy
    if (supportsToGround) {
      for (const point of railPoints) {
        const supportTop = baseHeight + Math.max(riserHeight, point.step * riserHeight) - stairThickness;
        const supportHeight = Math.max(0.25, supportTop);
        for (const supportX of [x - width * 0.34, x + width * 0.34]) {
          pushGeom(railGeoms, supportGeom, supportX, supportHeight / 2, point.z, 0, supportHeight);
        }
      }
    }
    supportGeom.dispose();

    const postGeom = new THREE.CylinderGeometry(0.1, 0.12, 2.2, 8);
    for (const point of railPoints) {
      pushGeom(railGeoms, postGeom, railX, point.y, point.z, 0, postHeight / 2.2);
    }
    postGeom.dispose();

    for (let index = 0; index < railPoints.length - 1; index += 1) {
      const start = railPoints[index];
      const end = railPoints[index + 1];
      const deltaY = end.y - start.y;
      const deltaZ = end.z - start.z;
      const length = Math.hypot(deltaY, deltaZ);
      const angle = Math.atan2(deltaY, -deltaZ);
      const railGeom = new THREE.BoxGeometry(0.18, 0.16, length);
      const g = railGeom.clone();
      _sp.set(railX, (start.y + end.y) / 2 + postHeight / 2, (start.z + end.z) / 2);
      _sq.setFromEuler(new THREE.Euler(angle, 0, 0));
      _ss.set(1, 1, 1);
      _sm.compose(_sp, _sq, _ss);
      g.applyMatrix4(_sm);
      railGeoms.push(g);
      railGeom.dispose();
    }

    if (railGeoms.length > 0) {
      const merged = mergeGeometries(railGeoms);
      const mesh = new THREE.Mesh(merged, railMaterial);
      mesh.castShadow = true;
      this.add(mesh);
      railGeoms.forEach(g => g.dispose());
    }
  }

  public updateScoreboard(delta: number, text: string) {
    this.crowdTime += delta;
    if (this.crowd) {
      this.crowd.update(this.crowdTime);
    }

    if (!this.scoreboardCtx) return;

    const ctx = this.scoreboardCtx;
    const canvas = this.scoreboardCanvas;

    // Clear background with a dark LED green color
    ctx.fillStyle = '#080c06';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw borders/grid layout for a retro scoreboard appearance
    ctx.strokeStyle = '#1e330a';
    ctx.lineWidth = 12;
    ctx.strokeRect(12, 12, canvas.width - 24, canvas.height - 24);

    // Draw glowing red LED text
    ctx.fillStyle = '#ff2b2b';
    ctx.shadowColor = '#ff2b2b';
    ctx.shadowBlur = 12;
    ctx.font = 'bold 180px monospace';
    ctx.textBaseline = 'middle';

    // Calculate scroll position
    this.scrollOffset -= delta * 1280.0; // scroll speed (pixels per second, scaled up for wider canvas width)
    
    // Measure text width to wrap around
    const textWidth = ctx.measureText(text).width;
    if (this.scrollOffset < -textWidth) {
      this.scrollOffset = canvas.width;
    }

    // Draw text
    ctx.fillText(text, this.scrollOffset, canvas.height / 2 + 6);

    // Reset shadow blur
    ctx.shadowBlur = 0;

    // Trigger texture upload on GPU
    this.scoreboardTexture.needsUpdate = true;
  }
}
