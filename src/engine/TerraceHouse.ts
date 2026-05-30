import * as THREE from 'three';

export interface TerraceHouseConfig {
  /** The generation index used for procedural variance in height, width, colors, etc. */
  index: number;
  /** Set of brick materials to choose from. */
  brickMaterials: THREE.Material[];
  /** Rotation of the house around Y axis. */
  rotationY?: number;
}

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

    // Define custom materials for the house details
    const brickMat = brickMaterials[index % brickMaterials.length];
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0xece6d9, roughness: 0.72 });
    const roofColor = [0x383532, 0x484542, 0x2a2826][index % 3];
    const roofMat = new THREE.MeshStandardMaterial({ color: roofColor, roughness: 0.8 });
    const windowMat = new THREE.MeshStandardMaterial({ color: 0x11161b, roughness: 0.08, metalness: 0.95 });
    const doorColor = [0xb33927, 0x22558c, 0x20543a, 0xbf851a][index % 4];
    const doorMat = new THREE.MeshStandardMaterial({ color: doorColor, roughness: 0.48 });
    const potMat = new THREE.MeshStandardMaterial({ color: 0xb5653c, roughness: 0.85 });

    // 1. House Main Body (Brick)
    const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), brickMat);
    body.position.y = height / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    this.group.add(body);

    // 2. Pitched Roof (Slate - sloped front and back panels)
    // Using custom dimensions so that the slopes meet cleanly at the peak (Z=0) without crossing
    const frontSlope = new THREE.Mesh(new THREE.BoxGeometry(width + 0.6, 0.15, depth * 0.58), roofMat);
    frontSlope.position.set(0, height + 0.75, depth * 0.26);
    frontSlope.rotation.x = 0.45; // Positive X tilts front slope down towards the front
    frontSlope.castShadow = true;
    this.group.add(frontSlope);

    const backSlope = new THREE.Mesh(new THREE.BoxGeometry(width + 0.6, 0.15, depth * 0.58), roofMat);
    backSlope.position.set(0, height + 0.75, -depth * 0.26);
    backSlope.rotation.x = -0.45; // Negative X tilts back slope down towards the back
    backSlope.castShadow = true;
    this.group.add(backSlope);

    const ridge = new THREE.Mesh(new THREE.BoxGeometry(width + 0.7, 0.12, 0.12), stoneMat);
    ridge.position.set(0, height + 1.5, 0);
    this.group.add(ridge);

    // Gable triangular end walls to fill side gaps under the sloped roof
    const gableShape = new THREE.Shape();
    gableShape.moveTo(-depth / 2, 0);
    gableShape.lineTo(depth / 2, 0);
    gableShape.lineTo(0, 1.40); // Peak height
    gableShape.closePath();

    const gableGeo = new THREE.ShapeGeometry(gableShape);
    for (const side of [-1, 1]) {
      const gable = new THREE.Mesh(gableGeo, brickMat);
      gable.position.set(side * (width / 2 - 0.01), height, 0);
      gable.rotation.y = side * Math.PI / 2;
      gable.castShadow = true;
      gable.receiveShadow = true;
      this.group.add(gable);
    }

    // 3. Chimney with Terracotta Pots
    const chimneyX = width * 0.28;
    const chimneyY = height + 1.1;
    const chimneyZ = -depth * 0.2;
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.2, 1.0), brickMat);
    chimney.position.set(chimneyX, chimneyY, chimneyZ);
    chimney.castShadow = true;
    this.group.add(chimney);

    const chimneyCap = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.2, 1.2), stoneMat);
    chimneyCap.position.set(chimneyX, chimneyY + 1.1, chimneyZ);
    this.group.add(chimneyCap);

    for (const potX of [-0.25, 0.25]) {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.20, 0.55, 6), potMat);
      pot.position.set(chimneyX + potX, chimneyY + 1.45, chimneyZ);
      pot.castShadow = true;
      this.group.add(pot);
    }

    // Layout configuration (offset hallway/door on left, living room parlor on right)
    const doorX = -width * 0.26;
    const parlorX = width * 0.26;

    // 4. Entrance Door & Portico (Canopy with supports & steps)
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.55, 2.9, 0.1), doorMat);
    door.position.set(doorX, 1.45, depth / 2 + 0.05);
    door.castShadow = true;
    this.group.add(door);

    const steps = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.25, 0.7), stoneMat);
    steps.position.set(doorX, 0.125, depth / 2 + 0.35);
    steps.receiveShadow = true;
    this.group.add(steps);

    const canopy = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.8), stoneMat);
    canopy.position.set(doorX, 2.9, depth / 2 + 0.4);
    canopy.castShadow = true;
    this.group.add(canopy);

    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.9, 0.08), stoneMat);
      post.position.set(doorX + side * 0.95, 1.45, depth / 2 + 0.72);
      post.castShadow = true;
      this.group.add(post);
    }

    // 5. Victorian Ground Floor Bay Window
    const bayW = width * 0.36;
    const bayH = 3.1;
    const bayD = 0.8;
    const bay = new THREE.Mesh(new THREE.BoxGeometry(bayW, bayH, bayD), brickMat);
    bay.position.set(parlorX, bayH / 2, depth / 2 + bayD / 2);
    bay.castShadow = true;
    this.group.add(bay);

    const bayRoof = new THREE.Mesh(new THREE.BoxGeometry(bayW + 0.2, 0.18, bayD + 0.15), stoneMat);
    bayRoof.position.set(parlorX, bayH + 0.09, depth / 2 + bayD / 2);
    bayRoof.castShadow = true;
    this.group.add(bayRoof);

    // Front bay window frame
    const frontFrame = new THREE.Mesh(new THREE.BoxGeometry(bayW * 0.72 + 0.14, 1.94, 0.03), stoneMat);
    frontFrame.position.set(parlorX, 1.6, depth / 2 + bayD + 0.015);
    frontFrame.castShadow = true;
    this.group.add(frontFrame);

    // Bay window glass panes
    const frontWin = new THREE.Mesh(new THREE.BoxGeometry(bayW * 0.72, 1.8, 0.05), windowMat);
    frontWin.position.set(parlorX, 1.6, depth / 2 + bayD + 0.03);
    this.group.add(frontWin);

    // Front bay window grid (three-part sash bars)
    for (const offset of [-bayW * 0.18, bayW * 0.18]) {
      const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.10, 1.8, 0.03), stoneMat);
      mullion.position.set(parlorX + offset, 1.6, depth / 2 + bayD + 0.05);
      this.group.add(mullion);
    }
    const bayHBar = new THREE.Mesh(new THREE.BoxGeometry(bayW * 0.72, 0.10, 0.03), stoneMat);
    bayHBar.position.set(parlorX, 1.6, depth / 2 + bayD + 0.05);
    this.group.add(bayHBar);

    for (const side of [-1, 1]) {
      // Side bay window frame
      const sideFrame = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.94, bayD * 0.65 + 0.14), stoneMat);
      sideFrame.position.set(parlorX + side * (bayW / 2 + 0.005), 1.6, depth / 2 + bayD / 2);
      sideFrame.castShadow = true;
      this.group.add(sideFrame);

      const sideWin = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.8, bayD * 0.65), windowMat);
      sideWin.position.set(parlorX + side * (bayW / 2 + 0.016), 1.6, depth / 2 + bayD / 2);
      this.group.add(sideWin);

      // Side window horizontal sash bar
      const sideBar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.10, bayD * 0.65), stoneMat);
      sideBar.position.set(parlorX + side * (bayW / 2 + 0.022), 1.6, depth / 2 + bayD / 2);
      this.group.add(sideBar);
    }

    // 6. Upper Floor Windows (with stone lintels and sills)
    for (let f = 1; f < floorCount; f++) {
      const winY = f * floorHeight + 1.7; // Fixed window height offset relative to each floor level

      for (const winX of [doorX, parlorX]) {
        // Window Frame (slightly larger background block in stoneMat to create a border frame)
        const frame = new THREE.Mesh(new THREE.BoxGeometry(1.54, 2.04, 0.06), stoneMat);
        frame.position.set(winX, winY, depth / 2 + 0.03);
        frame.castShadow = true;
        this.group.add(frame);

        // Window pane (glass)
        const win = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.9, 0.08), windowMat);
        win.position.set(winX, winY, depth / 2 + 0.06);
        win.castShadow = true;
        this.group.add(win);

        // Window grid (sash bars) in stoneMaterial
        const vBar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.9, 0.04), stoneMat);
        vBar.position.set(winX, winY, depth / 2 + 0.09);
        this.group.add(vBar);

        const hBar = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 0.04), stoneMat);
        hBar.position.set(winX, winY, depth / 2 + 0.09);
        this.group.add(hBar);

        // Stone Sill (bottom ledge)
        const sill = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.2), stoneMat);
        sill.position.set(winX, winY - 0.96, depth / 2 + 0.12);
        this.group.add(sill);

        // Stone Lintel (top header)
        const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.18, 0.15), stoneMat);
        lintel.position.set(winX, winY + 0.96, depth / 2 + 0.09);
        this.group.add(lintel);
      }
    }
  }
}
