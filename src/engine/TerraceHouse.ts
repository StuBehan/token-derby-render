import * as THREE from 'three';
import { getSurfaceTexture } from './Textures';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface TerraceHouseConfig {
  /** The generation index used for procedural variance in height, width, colors, etc. */
  index: number;
  /** Set of brick materials to choose from. */
  brickMaterials: THREE.Material[];
  /** Rotation of the house around Y axis. */
  rotationY?: number;
}

// Share static geometries across all TerraceHouse instances to optimize GPU buffer allocations and memory
const chimneyGeom = new THREE.BoxGeometry(1.0, 2.2, 1.0);
const chimneyCapGeom = new THREE.BoxGeometry(1.2, 0.2, 1.2);
const potGeom = new THREE.CylinderGeometry(0.16, 0.20, 0.55, 6);
const doorGeom = new THREE.BoxGeometry(1.55, 2.9, 0.1);
const stepsGeom = new THREE.BoxGeometry(2.0, 0.25, 0.7);
const canopyGeom = new THREE.BoxGeometry(2.2, 0.12, 0.8);
const postGeom = new THREE.BoxGeometry(0.08, 2.9, 0.08);
const mullionGeom = new THREE.BoxGeometry(0.10, 1.8, 0.03);

// Upper window shared geometries
const winFrameGeom = new THREE.BoxGeometry(1.54, 2.04, 0.06);
const winPaneGeom = new THREE.BoxGeometry(1.4, 1.9, 0.08);
const winVBarGeom = new THREE.BoxGeometry(0.12, 1.9, 0.04);
const winHBarGeom = new THREE.BoxGeometry(1.4, 0.12, 0.04);
const winSillGeom = new THREE.BoxGeometry(1.6, 0.12, 0.2);
const winLintelGeom = new THREE.BoxGeometry(1.6, 0.18, 0.15);

// Shared static materials to avoid duplicate GPU shader compiles
const sharedStoneMat = new THREE.MeshStandardMaterial({ color: 0xece6d9, roughness: 0.72 });
const sharedWindowMat = new THREE.MeshStandardMaterial({ color: 0x11161b, roughness: 0.08, metalness: 0.95 });
const sharedPotMat = new THREE.MeshStandardMaterial({ color: 0xb5653c, roughness: 0.85 });

export class TerraceHouse {
  public readonly group: THREE.Group;

  constructor(position: THREE.Vector3, config: TerraceHouseConfig) {
    this.group = new THREE.Group();
    this.group.position.copy(position);
    if (config.rotationY !== undefined) {
      this.group.rotation.y = config.rotationY;
    }

    this.buildModel(config);
  }

  private buildModel(config: TerraceHouseConfig) {
    const index = config.index;
    const brickMaterials = config.brickMaterials;

    const width = 11.5 + (index % 3) * 1.3;
    const floorHeight = 3.5;
    const baseHeight = 10.5 + (index % 4) * 1.25;
    const floorCount = Math.floor(baseHeight / floorHeight);
    const height = floorCount * floorHeight;
    const depth = 5.4 + (index % 2) * 0.8;

    // Define custom/procedural materials for this house instance
    const brickMat = brickMaterials[index % brickMaterials.length];
    const roofColor = [0x383532, 0x484542, 0x2a2826][index % 3];
    const roofMat = new THREE.MeshStandardMaterial({
      color: roofColor,
      map: getSurfaceTexture('slate', 5, 2),
      roughness: 0.8,
    });
    const doorColor = [0xb33927, 0x22558c, 0x20543a, 0xbf851a][index % 4];
    const doorMat = new THREE.MeshStandardMaterial({ color: doorColor, roughness: 0.48 });

    const brickGeoms: THREE.BufferGeometry[] = [];
    const roofGeoms: THREE.BufferGeometry[] = [];
    const stoneGeoms: THREE.BufferGeometry[] = [];
    const windowGeoms: THREE.BufferGeometry[] = [];
    const doorGeoms: THREE.BufferGeometry[] = [];
    const potGeoms: THREE.BufferGeometry[] = [];

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

    // 1. House Main Body (Brick)
    addGeom(brickGeoms, new THREE.BoxGeometry(width, height, depth), 0, height / 2, 0);

    // 2. Pitched Roof (Slate) & Ridge (Stone)
    addGeom(roofGeoms, new THREE.BoxGeometry(width + 0.6, 0.15, depth * 0.58), 0, height + 0.75, depth * 0.26, 0.45, 0, 0);
    addGeom(roofGeoms, new THREE.BoxGeometry(width + 0.6, 0.15, depth * 0.58), 0, height + 0.75, -depth * 0.26, -0.45, 0, 0);
    addGeom(stoneGeoms, new THREE.BoxGeometry(width + 0.7, 0.12, 0.12), 0, height + 1.5, 0);

    // Gable triangular end walls (Brick)
    const gableShape = new THREE.Shape();
    gableShape.moveTo(-depth / 2, 0);
    gableShape.lineTo(depth / 2, 0);
    gableShape.lineTo(0, 1.40);
    gableShape.closePath();
    const gableGeo = new THREE.ShapeGeometry(gableShape);

    for (const side of [-1, 1]) {
      addGeom(brickGeoms, gableGeo, side * (width / 2 - 0.01), height, 0, 0, side * Math.PI / 2, 0);
    }
    gableGeo.dispose();

    // 3. Chimney (Brick), Cap (Stone), Pots (Pot)
    const chimneyX = width * 0.28;
    const chimneyY = height + 1.1;
    const chimneyZ = -depth * 0.2;

    addGeom(brickGeoms, chimneyGeom, chimneyX, chimneyY, chimneyZ);
    addGeom(stoneGeoms, chimneyCapGeom, chimneyX, chimneyY + 1.1, chimneyZ);

    for (const potX of [-0.25, 0.25]) {
      addGeom(potGeoms, potGeom, chimneyX + potX, chimneyY + 1.45, chimneyZ);
    }

    // Layout configuration
    const doorX = -width * 0.26;
    const parlorX = width * 0.26;

    // 4. Entrance Door (Door), Steps (Stone), Canopy (Stone), Posts (Stone)
    addGeom(doorGeoms, doorGeom, doorX, 1.45, depth / 2 + 0.05);
    addGeom(stoneGeoms, stepsGeom, doorX, 0.125, depth / 2 + 0.35);
    addGeom(stoneGeoms, canopyGeom, doorX, 2.9, depth / 2 + 0.4);

    for (const side of [-1, 1]) {
      addGeom(stoneGeoms, postGeom, doorX + side * 0.95, 1.45, depth / 2 + 0.72);
    }

    // 5. Victorian Ground Floor Bay Window
    const bayW = width * 0.36;
    const bayH = 3.1;
    const bayD = 0.8;

    addGeom(brickGeoms, new THREE.BoxGeometry(bayW, bayH, bayD), parlorX, bayH / 2, depth / 2 + bayD / 2);
    addGeom(stoneGeoms, new THREE.BoxGeometry(bayW + 0.2, 0.18, bayD + 0.15), parlorX, bayH + 0.09, depth / 2 + bayD / 2);
    addGeom(stoneGeoms, new THREE.BoxGeometry(bayW * 0.72 + 0.14, 1.94, 0.03), parlorX, 1.6, depth / 2 + bayD + 0.015);
    addGeom(windowGeoms, new THREE.BoxGeometry(bayW * 0.72, 1.8, 0.05), parlorX, 1.6, depth / 2 + bayD + 0.03);

    for (const offset of [-bayW * 0.18, bayW * 0.18]) {
      addGeom(stoneGeoms, mullionGeom, parlorX + offset, 1.6, depth / 2 + bayD + 0.05);
    }
    addGeom(stoneGeoms, new THREE.BoxGeometry(bayW * 0.72, 0.10, 0.03), parlorX, 1.6, depth / 2 + bayD + 0.05);

    for (const side of [-1, 1]) {
      addGeom(stoneGeoms, new THREE.BoxGeometry(0.03, 1.94, bayD * 0.65 + 0.14), parlorX + side * (bayW / 2 + 0.005), 1.6, depth / 2 + bayD / 2);
      addGeom(windowGeoms, new THREE.BoxGeometry(0.05, 1.8, bayD * 0.65), parlorX + side * (bayW / 2 + 0.016), 1.6, depth / 2 + bayD / 2);
      addGeom(stoneGeoms, new THREE.BoxGeometry(0.06, 0.10, bayD * 0.65), parlorX + side * (bayW / 2 + 0.022), 1.6, depth / 2 + bayD / 2);
    }

    // 6. Upper Floor Windows (Stone & Window)
    for (let f = 1; f < floorCount; f++) {
      const winY = f * floorHeight + 1.7;

      for (const winX of [doorX, parlorX]) {
        addGeom(stoneGeoms, winFrameGeom, winX, winY, depth / 2 + 0.03);
        addGeom(windowGeoms, winPaneGeom, winX, winY, depth / 2 + 0.06);
        addGeom(stoneGeoms, winVBarGeom, winX, winY, depth / 2 + 0.09);
        addGeom(stoneGeoms, winHBarGeom, winX, winY, depth / 2 + 0.09);
        addGeom(stoneGeoms, winSillGeom, winX, winY - 0.96, depth / 2 + 0.12);
        addGeom(stoneGeoms, winLintelGeom, winX, winY + 0.96, depth / 2 + 0.09);
      }
    }

    // Merge and add geometries
    const mergeAndAdd = (geoms: THREE.BufferGeometry[], mat: THREE.Material, shadow = false) => {
      if (geoms.length === 0) return;
      const merged = mergeGeometries(geoms);
      const mesh = new THREE.Mesh(merged, mat);
      mesh.receiveShadow = shadow;
      this.group.add(mesh);
      geoms.forEach((g) => g.dispose());
    };

    mergeAndAdd(brickGeoms, brickMat, true);
    mergeAndAdd(roofGeoms, roofMat, false);
    mergeAndAdd(stoneGeoms, sharedStoneMat, true);
    mergeAndAdd(windowGeoms, sharedWindowMat, false);
    mergeAndAdd(doorGeoms, doorMat, false);
    mergeAndAdd(potGeoms, sharedPotMat, false);
  }
}
