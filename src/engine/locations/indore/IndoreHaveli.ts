import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface IndoreHaveliConfig {
  /** The generation index used for procedural variance in height, width, colors, etc. */
  index: number;
  /** Set of pastel plaster materials to choose from. */
  plasterMaterials: THREE.Material[];
  /** Rotation of the building around Y axis. */
  rotationY?: number;
}

// Share static geometries across all IndoreHaveli instances to optimize memory and GPU buffer allocations
const balconySlabGeom = new THREE.BoxGeometry(1.0, 0.14, 0.9);
const balusterGeom = new THREE.BoxGeometry(0.06, 0.62, 0.06);
const balconyRailGeom = new THREE.BoxGeometry(1.0, 0.08, 0.06);
const bracketGeom = new THREE.ConeGeometry(0.09, 0.4, 4);
const chhajjaGeom = new THREE.BoxGeometry(1.14, 0.08, 1.0);
const windowFrameGeom = new THREE.BoxGeometry(0.86, 1.1, 0.08);
const windowGlassGeom = new THREE.BoxGeometry(0.7, 0.92, 0.05);
const shutterGeom = new THREE.BoxGeometry(0.32, 1.1, 0.05);
const doorwayGeom = new THREE.BoxGeometry(1.5, 2.4, 0.12);
const doorwayOpeningGeom = new THREE.BoxGeometry(1.2, 2.15, 0.14);
const tankGeom = new THREE.CylinderGeometry(0.42, 0.42, 0.6, 8);
const chhatriPillarGeom = new THREE.CylinderGeometry(0.08, 0.08, 0.9, 6);
const chhatriDomeGeom = new THREE.SphereGeometry(0.5, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);

// Shared static materials to avoid duplicate GPU shader compiles
const sharedWoodMat = new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.75 });
const sharedGlassMat = new THREE.MeshStandardMaterial({ color: 0x1c2530, roughness: 0.25, metalness: 0.4 });
const sharedTankMat = new THREE.MeshStandardMaterial({ color: 0x8a8f92, roughness: 0.6, metalness: 0.3 });
const sharedDomeMat = new THREE.MeshStandardMaterial({ color: 0xd8cdb8, roughness: 0.5 });

export class IndoreHaveli {
  public readonly group: THREE.Group;

  constructor(position: THREE.Vector3, config: IndoreHaveliConfig) {
    this.group = new THREE.Group();
    this.group.position.copy(position);
    if (config.rotationY !== undefined) {
      this.group.rotation.y = config.rotationY;
    }

    this.buildModel(config);
  }

  private buildModel(config: IndoreHaveliConfig) {
    const index = config.index;
    const plasterMaterials = config.plasterMaterials;

    const width = 8.5 + (index % 3) * 1.2;
    const floorHeight = 3.2;
    const baseHeight = 8.0 + (index % 4) * 1.5;
    const floorCount = Math.max(2, Math.floor(baseHeight / floorHeight));
    const height = floorCount * floorHeight;
    const depth = 5.0 + (index % 2) * 0.6;

    const plasterMat = plasterMaterials[index % plasterMaterials.length];

    const plasterGeoms: THREE.BufferGeometry[] = [];
    const woodGeoms: THREE.BufferGeometry[] = [];
    const glassGeoms: THREE.BufferGeometry[] = [];
    const tankGeoms: THREE.BufferGeometry[] = [];
    const domeGeoms: THREE.BufferGeometry[] = [];

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
      sz = 1,
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

    // 1. Main plastered body
    addGeom(plasterGeoms, new THREE.BoxGeometry(width, height, depth), 0, height / 2, 0);

    // 2. Flat roof parapet trim
    addGeom(plasterGeoms, new THREE.BoxGeometry(width + 0.2, 0.5, depth + 0.2), 0, height + 0.25, 0);

    // Rooftop accent: chhatri dome (30% chance) or water tank (default)
    if (index % 10 < 3) {
      addGeom(woodGeoms, chhatriPillarGeom, -width * 0.2, height + 0.9, 0);
      addGeom(woodGeoms, chhatriPillarGeom, width * 0.2, height + 0.9, 0);
      addGeom(domeGeoms, chhatriDomeGeom, 0, height + 1.35, 0, 0, 0, 0, 1.6, 1.0, 1.6);
    } else {
      addGeom(tankGeoms, tankGeom, width * 0.28, height + 0.5, -depth * 0.2);
    }

    // 3. Ground floor entrance (recessed doorway)
    const doorX = -width * 0.24;
    addGeom(woodGeoms, doorwayGeom, doorX, 1.2, depth / 2 + 0.02);
    addGeom(plasterGeoms, doorwayOpeningGeom, doorX, 1.15, depth / 2 + 0.08);

    // Ground floor shopfront shutters beside the door
    const shutterX = width * 0.22;
    for (const offset of [-0.2, 0.2]) {
      addGeom(woodGeoms, shutterGeom, shutterX + offset, 1.35, depth / 2 + 0.07);
    }

    // 4. Upper floor jharokha balconies (one centered per floor, above ground level)
    for (let f = 1; f < floorCount; f++) {
      const floorY = f * floorHeight;
      const balconyY = floorY + 0.7;
      const balconyW = width * 0.5;
      const balconyD = 0.9;

      // Projecting balcony slab
      addGeom(woodGeoms, balconySlabGeom, 0, balconyY, depth / 2 + balconyD / 2, 0, 0, 0, balconyW, 1, balconyD / 0.9);

      // Support brackets beneath the slab
      for (const side of [-1, 1]) {
        addGeom(woodGeoms, bracketGeom, side * balconyW * 0.4, balconyY - 0.22, depth / 2 + 0.15, Math.PI, 0, 0);
      }

      // Baluster railing along the balcony front
      const balusterCount = Math.max(3, Math.round(balconyW / 0.35));
      for (let b = 0; b < balusterCount; b++) {
        const bx = -balconyW / 2 + ((b + 0.5) / balusterCount) * balconyW;
        addGeom(woodGeoms, balusterGeom, bx, balconyY + 0.31 + 0.07, depth / 2 + balconyD - 0.05);
      }
      addGeom(woodGeoms, balconyRailGeom, 0, balconyY + 0.65, depth / 2 + balconyD - 0.05, 0, 0, 0, balconyW, 1, 1);

      // Chhajja canopy overhanging the balcony
      addGeom(woodGeoms, chhajjaGeom, 0, floorY + floorHeight - 0.3, depth / 2 + balconyD * 0.55, 0, 0, 0, balconyW * 1.05, 1, balconyD * 1.1);

      // Recessed window centered within the balcony
      addGeom(woodGeoms, windowFrameGeom, 0, balconyY + 0.4, depth / 2 + balconyD + 0.05, 0, 0, 0, balconyW * 0.9, 1, 1);
      addGeom(glassGeoms, windowGlassGeom, 0, balconyY + 0.4, depth / 2 + balconyD + 0.08, 0, 0, 0, balconyW * 0.9, 1, 1);

      // Small flanking windows on floors wide enough for them
      if (width > 9.0) {
        for (const side of [-1, 1]) {
          const wx = side * width * 0.36;
          addGeom(woodGeoms, windowFrameGeom, wx, floorY + 1.7, depth / 2 + 0.03, 0, 0, 0, 0.6, 0.85, 1);
          addGeom(glassGeoms, windowGlassGeom, wx, floorY + 1.7, depth / 2 + 0.06, 0, 0, 0, 0.6, 0.85, 1);
        }
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

    mergeAndAdd(plasterGeoms, plasterMat, true);
    mergeAndAdd(woodGeoms, sharedWoodMat, false);
    mergeAndAdd(glassGeoms, sharedGlassMat, false);
    mergeAndAdd(tankGeoms, sharedTankMat, false);
    mergeAndAdd(domeGeoms, sharedDomeMat, false);
  }
}
