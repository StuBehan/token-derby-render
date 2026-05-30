import * as THREE from 'three';

/**
 * High-performance instanced crowd renderer.
 *
 * Instead of creating hundreds of individual Person meshes (each with ~12
 * sub-meshes), this class batches all spectator body parts into a small
 * number of InstancedMesh draw calls — one per (geometry, material) pair.
 *
 * Body parts:
 *   torso        – BoxGeometry        – cloth color
 *   head         – SphereGeometry     – skin color
 *   helmet       – HemisphereGeometry – helmet/hair color
 *   upperArm x2  – BoxGeometry        – cloth color
 *   forearm  x2  – BoxGeometry        – cloth color
 *   hand     x2  – BoxGeometry        – skin color
 *   leg      x2  – BoxGeometry        – dark color
 *
 * Because each spectator can have a different cloth/helmet colour, we group
 * instances by material colour and create one InstancedMesh per group per
 * body-part geometry.
 */

// Stable deterministic noise matching Grandstand.ts
function stableNoise(row: number, column: number, salt: number): number {
  const value = Math.sin(row * 127.1 + column * 311.7 + salt * 74.7) * 43758.5453;
  return value - Math.floor(value);
}

interface SpectatorData {
  worldMatrix: THREE.Matrix4;        // final position/rotation/scale of the group
  torsoLean: number;
  headTilt: number;
  leftArmSwing: number;
  rightArmSwing: number;
  clothColorHex: number;
  helmetColorHex: number;
  scale: number;
}

// Shared geometries (created once, reused for all instances)
const _torsoGeom = new THREE.BoxGeometry(0.525, 1.08, 0.54);
const _headGeom = new THREE.SphereGeometry(0.345, 16, 10);
const _helmetGeom = new THREE.SphereGeometry(0.36, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2);
const _upperArmGeom = new THREE.BoxGeometry(0.165, 0.36, 0.165);
const _forearmGeom = new THREE.BoxGeometry(0.135, 0.33, 0.135);
const _handGeom = new THREE.BoxGeometry(0.12, 0.12, 0.12);

// Leg geometry with translate baked in (pivot at hip)
const _legGeom = new THREE.BoxGeometry(0.24, 0.76, 0.24);
_legGeom.translate(0, -0.38, 0);

// Helpers for building transforms
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3(1, 1, 1);
const _euler = new THREE.Euler();
const _mat = new THREE.Matrix4();
const _parentMat = new THREE.Matrix4();
const _childMat = new THREE.Matrix4();

function mat4FromPRS(px: number, py: number, pz: number, euler: THREE.Euler, sx = 1, sy = 1, sz = 1): THREE.Matrix4 {
  const m = new THREE.Matrix4();
  _pos.set(px, py, pz);
  _quat.setFromEuler(euler);
  _scale.set(sx, sy, sz);
  m.compose(_pos, _quat, _scale);
  return m;
}

type BodyPart = 'torso' | 'head' | 'helmet' | 'upperArmL' | 'upperArmR' | 'forearmL' | 'forearmR' | 'handL' | 'handR' | 'legL' | 'legR';

interface InstanceBucket {
  geometry: THREE.BufferGeometry;
  colorHex: number;
  matrices: THREE.Matrix4[];
}

export class InstancedCrowd extends THREE.Group {
  private instancedMeshes: THREE.InstancedMesh[] = [];

  constructor() {
    super();
  }

  /**
   * Collect spectator placements and build all InstancedMeshes at once.
   * Call this after all rows have been registered via addRow().
   */
  private spectators: SpectatorData[] = [];

  /**
   * Register spectators for one seating segment in one row.
   * Mirrors the logic from Grandstand.addGrandstandCrowdRow.
   */
  addRow(
    row: number,
    segmentX: number,
    width: number,
    y: number,
    z: number,
    clothingColors: number[],
  ) {
    const spacing = 0.9;
    const columns = Math.floor(width / spacing);
    const startX = segmentX - ((columns - 1) * spacing) / 2;

    const hairColors = [0x1a1105, 0x4a3728, 0x2d1f18, 0xd6c585, 0xa37b45];

    for (let column = 0; column < columns; column++) {
      const jitterX = (stableNoise(row, column, 1) - 0.5) * 0.46;
      const jitterZ = (stableNoise(row, column, 2) - 0.5) * 0.38;
      const x = startX + column * spacing + jitterX;

      // 8% chance of empty seat
      if (stableNoise(row, column, 3) < 0.08) continue;

      const scale = 0.86 + stableNoise(row, column, 4) * 0.24;
      const clothColor = clothingColors[
        Math.floor(stableNoise(row, column, 5) * clothingColors.length)
      ];

      const capOrHairNoise = stableNoise(row, column, 7);
      const helmetColor = capOrHairNoise < 0.4
        ? clothColor
        : hairColors[Math.floor(capOrHairNoise * hairColors.length) % hairColors.length];

      // Pose
      const torsoLean = (stableNoise(row, column, 8) - 0.5) * 0.15;
      const headTilt = (stableNoise(row, column, 9) - 0.5) * 0.1;

      const armNoise = stableNoise(row, column, 10);
      let leftArmSwing = 0.2;
      let rightArmSwing = 0.2;
      if (armNoise < 0.15) {
        leftArmSwing = -Math.PI + 0.4;
      } else if (armNoise < 0.3) {
        rightArmSwing = -Math.PI + 0.4;
      } else if (armNoise < 0.45) {
        leftArmSwing = -Math.PI + 0.2;
        rightArmSwing = -Math.PI + 0.2;
      }

      // Build world matrix for the spectator group
      const groupY = y + 1.16 * scale;
      const groupZ = z + jitterZ;
      const groupRotY = -Math.PI / 2 + (stableNoise(row, column, 6) - 0.5) * 0.34;
      const groupScale = scale * 0.85;

      _pos.set(x, groupY, groupZ);
      _euler.set(0, groupRotY, 0);
      _quat.setFromEuler(_euler);
      _scale.set(groupScale, groupScale, groupScale);

      const worldMatrix = new THREE.Matrix4();
      worldMatrix.compose(_pos, _quat, _scale);

      this.spectators.push({
        worldMatrix,
        torsoLean,
        headTilt,
        leftArmSwing,
        rightArmSwing,
        clothColorHex: clothColor,
        helmetColorHex: helmetColor,
        scale: groupScale,
      });
    }
  }

  /**
   * Bake all registered spectators into InstancedMesh draw calls.
   * Must be called after all addRow() calls.
   */
  build() {
    // Buckets keyed by "bodyPart|colorHex"
    const buckets = new Map<string, InstanceBucket>();

    const skinHex = 0xf2d4ac;
    const darkHex = 0x222222;

    const getOrCreate = (part: BodyPart, geom: THREE.BufferGeometry, colorHex: number): InstanceBucket => {
      const key = `${part}|${colorHex}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { geometry: geom, colorHex, matrices: [] };
        buckets.set(key, bucket);
      }
      return bucket;
    };

    // For each spectator, compute all body part world-space matrices and
    // bucket them by (geometry, colour).
    for (const spec of this.spectators) {
      // Build the hierarchical pose matrices the same way Person.ts does,
      // then combine them with the spectator's world matrix.

      // -- Torso (child of group) --
      _euler.set(0, 0, spec.torsoLean);
      const torsoLocal = mat4FromPRS(0, 0, 0, _euler);
      const torsoWorld = new THREE.Matrix4().multiplyMatrices(spec.worldMatrix, torsoLocal);
      getOrCreate('torso', _torsoGeom, spec.clothColorHex).matrices.push(torsoWorld.clone());

      // -- Head (child of torso) --
      _euler.set(0, 0, spec.headTilt);
      const headLocal = mat4FromPRS(0.18, 0.705, 0, _euler);
      const headWorld = new THREE.Matrix4().multiplyMatrices(torsoWorld, headLocal);
      getOrCreate('head', _headGeom, skinHex).matrices.push(headWorld.clone());

      // -- Helmet cap (child of head) --
      _euler.set(0, 0, 0);
      const helmetLocal = mat4FromPRS(0, 0.075, 0, _euler);
      const helmetWorld = new THREE.Matrix4().multiplyMatrices(headWorld, helmetLocal);
      getOrCreate('helmet', _helmetGeom, spec.helmetColorHex).matrices.push(helmetWorld.clone());

      // -- Arms --
      const armData: [BodyPart, BodyPart, BodyPart, number, number][] = [
        ['upperArmL', 'forearmL', 'handL', 0.33, spec.leftArmSwing],
        ['upperArmR', 'forearmR', 'handR', -0.33, spec.rightArmSwing],
      ];

      for (const [upperPart, forearmPart, handPart, zOff, swing] of armData) {
        // Upper arm pivot (child of torso)
        _euler.set(0, 0, swing);
        const upperArmPivot = mat4FromPRS(0.15, 0.225, zOff, _euler);
        const upperArmPivotWorld = new THREE.Matrix4().multiplyMatrices(torsoWorld, upperArmPivot);

        // Upper arm mesh offset (center of geometry placed half-length down)
        _euler.set(0, 0, 0);
        const upperArmMesh = mat4FromPRS(0, -0.18, 0, _euler);
        const upperArmWorld = new THREE.Matrix4().multiplyMatrices(upperArmPivotWorld, upperArmMesh);
        getOrCreate(upperPart, _upperArmGeom, spec.clothColorHex).matrices.push(upperArmWorld.clone());

        // Forearm pivot (child of upper arm pivot, at elbow)
        const forearmPivot = mat4FromPRS(0, -0.36, 0, _euler);
        const forearmPivotWorld = new THREE.Matrix4().multiplyMatrices(upperArmPivotWorld, forearmPivot);

        // Forearm mesh offset
        const forearmMesh = mat4FromPRS(0, -0.165, 0, _euler);
        const forearmWorld = new THREE.Matrix4().multiplyMatrices(forearmPivotWorld, forearmMesh);
        getOrCreate(forearmPart, _forearmGeom, spec.clothColorHex).matrices.push(forearmWorld.clone());

        // Hand (child of forearm pivot)
        const handMesh = mat4FromPRS(0, -0.33 - 0.06, 0, _euler);
        const handWorld = new THREE.Matrix4().multiplyMatrices(forearmPivotWorld, handMesh);
        getOrCreate(handPart, _handGeom, skinHex).matrices.push(handWorld.clone());
      }

      // -- Legs (children of torso) --
      // Sitting pose: rotation (±0.05, 0, 0.22)
      const legData: [BodyPart, number, number, number][] = [
        ['legL', 0.33, 0.05, 0.22],
        ['legR', -0.33, -0.05, 0.22],
      ];

      for (const [part, zOff, rx, rz] of legData) {
        _euler.set(rx, 0, rz);
        const legLocal = mat4FromPRS(0.12, -0.54, zOff, _euler);
        const legWorld = new THREE.Matrix4().multiplyMatrices(torsoWorld, legLocal);
        getOrCreate(part, _legGeom, darkHex).matrices.push(legWorld.clone());
      }
    }

    // Now create one InstancedMesh per bucket
    const matCache = new Map<number, THREE.MeshStandardMaterial>();
    const getMat = (hex: number, roughness = 0.55): THREE.MeshStandardMaterial => {
      let mat = matCache.get(hex);
      if (!mat) {
        mat = new THREE.MeshStandardMaterial({ color: hex, roughness });
        matCache.set(hex, mat);
      }
      return mat;
    };

    for (const [key, bucket] of buckets) {
      const count = bucket.matrices.length;
      if (count === 0) continue;

      const part = key.split('|')[0] as BodyPart;
      let roughness = 0.55;
      if (part === 'legL' || part === 'legR') roughness = 0.8;
      if (part === 'torso' || part.startsWith('upper') || part.startsWith('forearm')) roughness = 0.5;

      const material = getMat(bucket.colorHex, roughness);
      const instMesh = new THREE.InstancedMesh(bucket.geometry, material, count);
      instMesh.castShadow = false;
      instMesh.receiveShadow = false;

      for (let i = 0; i < count; i++) {
        instMesh.setMatrixAt(i, bucket.matrices[i]);
      }
      instMesh.instanceMatrix.needsUpdate = true;

      this.instancedMeshes.push(instMesh);
      this.add(instMesh);
    }

    // Clear the spectator data to free memory
    this.spectators.length = 0;
  }
}
