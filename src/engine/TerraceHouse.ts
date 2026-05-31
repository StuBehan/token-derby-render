import * as THREE from 'three';
import { getSurfaceTexture } from './Textures';

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

    // 1. House Main Body (Brick) - Background houses don't need to cast shadows (saves massive render cost)
    const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), brickMat);
    body.position.y = height / 2;
    body.receiveShadow = true;
    this.group.add(body);

    // 2. Pitched Roof (Slate - sloped front and back panels)
    const frontSlope = new THREE.Mesh(new THREE.BoxGeometry(width + 0.6, 0.15, depth * 0.58), roofMat);
    frontSlope.position.set(0, height + 0.75, depth * 0.26);
    frontSlope.rotation.x = 0.45;
    this.group.add(frontSlope);

    const backSlope = new THREE.Mesh(new THREE.BoxGeometry(width + 0.6, 0.15, depth * 0.58), roofMat);
    backSlope.position.set(0, height + 0.75, -depth * 0.26);
    backSlope.rotation.x = -0.45;
    this.group.add(backSlope);

    const ridge = new THREE.Mesh(new THREE.BoxGeometry(width + 0.7, 0.12, 0.12), sharedStoneMat);
    ridge.position.set(0, height + 1.5, 0);
    this.group.add(ridge);

    // Gable triangular end walls to fill side gaps under the sloped roof
    const gableShape = new THREE.Shape();
    gableShape.moveTo(-depth / 2, 0);
    gableShape.lineTo(depth / 2, 0);
    gableShape.lineTo(0, 1.40);
    gableShape.closePath();

    const gableGeo = new THREE.ShapeGeometry(gableShape);
    for (const side of [-1, 1]) {
      const gable = new THREE.Mesh(gableGeo, brickMat);
      gable.position.set(side * (width / 2 - 0.01), height, 0);
      gable.rotation.y = side * Math.PI / 2;
      gable.receiveShadow = true;
      this.group.add(gable);
    }

    // 3. Chimney with Terracotta Pots
    const chimneyX = width * 0.28;
    const chimneyY = height + 1.1;
    const chimneyZ = -depth * 0.2;
    const chimney = new THREE.Mesh(chimneyGeom, brickMat);
    chimney.position.set(chimneyX, chimneyY, chimneyZ);
    this.group.add(chimney);

    const chimneyCap = new THREE.Mesh(chimneyCapGeom, sharedStoneMat);
    chimneyCap.position.set(chimneyX, chimneyY + 1.1, chimneyZ);
    this.group.add(chimneyCap);

    for (const potX of [-0.25, 0.25]) {
      const pot = new THREE.Mesh(potGeom, sharedPotMat);
      pot.position.set(chimneyX + potX, chimneyY + 1.45, chimneyZ);
      this.group.add(pot);
    }

    // Layout configuration (offset hallway/door on left, living room parlor on right)
    const doorX = -width * 0.26;
    const parlorX = width * 0.26;

    // 4. Entrance Door & Portico (Canopy with supports & steps)
    const door = new THREE.Mesh(doorGeom, doorMat);
    door.position.set(doorX, 1.45, depth / 2 + 0.05);
    this.group.add(door);

    const steps = new THREE.Mesh(stepsGeom, sharedStoneMat);
    steps.position.set(doorX, 0.125, depth / 2 + 0.35);
    steps.receiveShadow = true;
    this.group.add(steps);

    const canopy = new THREE.Mesh(canopyGeom, sharedStoneMat);
    canopy.position.set(doorX, 2.9, depth / 2 + 0.4);
    this.group.add(canopy);

    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(postGeom, sharedStoneMat);
      post.position.set(doorX + side * 0.95, 1.45, depth / 2 + 0.72);
      this.group.add(post);
    }

    // 5. Victorian Ground Floor Bay Window
    const bayW = width * 0.36;
    const bayH = 3.1;
    const bayD = 0.8;
    const bay = new THREE.Mesh(new THREE.BoxGeometry(bayW, bayH, bayD), brickMat);
    bay.position.set(parlorX, bayH / 2, depth / 2 + bayD / 2);
    this.group.add(bay);

    const bayRoof = new THREE.Mesh(new THREE.BoxGeometry(bayW + 0.2, 0.18, bayD + 0.15), sharedStoneMat);
    bayRoof.position.set(parlorX, bayH + 0.09, depth / 2 + bayD / 2);
    this.group.add(bayRoof);

    // Front bay window frame
    const frontFrame = new THREE.Mesh(new THREE.BoxGeometry(bayW * 0.72 + 0.14, 1.94, 0.03), sharedStoneMat);
    frontFrame.position.set(parlorX, 1.6, depth / 2 + bayD + 0.015);
    this.group.add(frontFrame);

    // Bay window glass panes
    const frontWin = new THREE.Mesh(new THREE.BoxGeometry(bayW * 0.72, 1.8, 0.05), sharedWindowMat);
    frontWin.position.set(parlorX, 1.6, depth / 2 + bayD + 0.03);
    this.group.add(frontWin);

    // Front bay window grid (three-part sash bars)
    for (const offset of [-bayW * 0.18, bayW * 0.18]) {
      const mullion = new THREE.Mesh(mullionGeom, sharedStoneMat);
      mullion.position.set(parlorX + offset, 1.6, depth / 2 + bayD + 0.05);
      this.group.add(mullion);
    }
    const bayHBar = new THREE.Mesh(new THREE.BoxGeometry(bayW * 0.72, 0.10, 0.03), sharedStoneMat);
    bayHBar.position.set(parlorX, 1.6, depth / 2 + bayD + 0.05);
    this.group.add(bayHBar);

    for (const side of [-1, 1]) {
      // Side bay window frame
      const sideFrame = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.94, bayD * 0.65 + 0.14), sharedStoneMat);
      sideFrame.position.set(parlorX + side * (bayW / 2 + 0.005), 1.6, depth / 2 + bayD / 2);
      this.group.add(sideFrame);

      const sideWin = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.8, bayD * 0.65), sharedWindowMat);
      sideWin.position.set(parlorX + side * (bayW / 2 + 0.016), 1.6, depth / 2 + bayD / 2);
      this.group.add(sideWin);

      // Side window horizontal sash bar
      const sideBar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.10, bayD * 0.65), sharedStoneMat);
      sideBar.position.set(parlorX + side * (bayW / 2 + 0.022), 1.6, depth / 2 + bayD / 2);
      this.group.add(sideBar);
    }

    // 6. Upper Floor Windows (with stone lintels and sills)
    for (let f = 1; f < floorCount; f++) {
      const winY = f * floorHeight + 1.7;

      for (const winX of [doorX, parlorX]) {
        // Window Frame
        const frame = new THREE.Mesh(winFrameGeom, sharedStoneMat);
        frame.position.set(winX, winY, depth / 2 + 0.03);
        this.group.add(frame);

        // Window pane (glass)
        const win = new THREE.Mesh(winPaneGeom, sharedWindowMat);
        win.position.set(winX, winY, depth / 2 + 0.06);
        this.group.add(win);

        // Window grid (sash bars)
        const vBar = new THREE.Mesh(winVBarGeom, sharedStoneMat);
        vBar.position.set(winX, winY, depth / 2 + 0.09);
        this.group.add(vBar);

        const hBar = new THREE.Mesh(winHBarGeom, sharedStoneMat);
        hBar.position.set(winX, winY, depth / 2 + 0.09);
        this.group.add(hBar);

        // Stone Sill (bottom ledge)
        const sill = new THREE.Mesh(winSillGeom, sharedStoneMat);
        sill.position.set(winX, winY - 0.96, depth / 2 + 0.12);
        this.group.add(sill);

        // Stone Lintel (top header)
        const lintel = new THREE.Mesh(winLintelGeom, sharedStoneMat);
        lintel.position.set(winX, winY + 0.96, depth / 2 + 0.09);
        this.group.add(lintel);
      }
    }
  }
}
