import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface StreetLightConfig {
  /** Hex color for the light bulb. Defaults to 0xffeaad. */
  lightColor?: number;
  /** Intensity of the point light. Defaults to 1.5. */
  lightIntensity?: number;
  /** Distance of the light. Defaults to 18. */
  lightDistance?: number;
  /** Disable the dynamic PointLight component to save performance on background lights. Defaults to false. */
  disableLight?: boolean;
  /** Enable/disable shadow casting for the lamppost meshes. Defaults to true. */
  castShadow?: boolean;
}

// Share geometries across all StreetLight instances to optimize memory and GPU buffer allocations
const baseGeom = new THREE.CylinderGeometry(0.24, 0.36, 0.8, 8);
const moldingGeom = new THREE.CylinderGeometry(0.26, 0.28, 0.12, 8);
const shaftGeom = new THREE.CylinderGeometry(0.09, 0.20, 4.4, 8);
const ring1Geom = new THREE.CylinderGeometry(0.18, 0.18, 0.1, 8);
const ring2Geom = new THREE.CylinderGeometry(0.14, 0.14, 0.1, 8);
const topCapGeom = new THREE.CylinderGeometry(0.12, 0.12, 0.3, 8);
const armGeom = new THREE.BoxGeometry(1.8, 0.12, 0.12);
const braceGeom = new THREE.BoxGeometry(0.08, 0.54, 0.08);
const finialGeom = new THREE.SphereGeometry(0.08, 6, 6);
const spireGeom = new THREE.ConeGeometry(0.08, 0.4, 6);
const loopGeom = new THREE.BoxGeometry(0.06, 0.12, 0.06);
const roofGeom = new THREE.ConeGeometry(0.32, 0.18, 6);
const bulbGeom = new THREE.CylinderGeometry(0.15, 0.22, 0.34, 6);
const bottomCapGeom = new THREE.CylinderGeometry(0.20, 0.06, 0.1, 6);
const bottomFinialGeom = new THREE.ConeGeometry(0.05, 0.12, 6);

// Shared default glass material for standard warm lights
const defaultGlassMaterial = new THREE.MeshStandardMaterial({
  color: 0xffeaad,
  roughness: 0.2,
  emissive: 0xffeaad,
  emissiveIntensity: 1.8,
});

export class StreetLight {
  public readonly group: THREE.Group;
  private readonly config: Required<StreetLightConfig>;
  private pointLight?: THREE.PointLight;
  private glassMaterial!: THREE.MeshStandardMaterial;

  constructor(position: THREE.Vector3, material: THREE.Material, config: StreetLightConfig = {}) {
    this.group = new THREE.Group();
    this.group.position.copy(position);

    this.config = {
      lightColor: config.lightColor ?? 0xffeaad,
      lightIntensity: config.lightIntensity ?? 1.5,
      lightDistance: config.lightDistance ?? 18,
      disableLight: config.disableLight ?? false,
      castShadow: config.castShadow ?? true,
    };

    this.buildModel(material);
  }

  private buildModel(material: THREE.Material) {
    // Reuse shared glass material if using default color to avoid material duplication
    const glassMaterial = this.config.lightColor === 0xffeaad 
      ? defaultGlassMaterial 
      : new THREE.MeshStandardMaterial({
          color: this.config.lightColor,
          roughness: 0.2,
          emissive: this.config.lightColor,
          emissiveIntensity: 1.8,
        });
    this.glassMaterial = glassMaterial;

    const ironGeoms: THREE.BufferGeometry[] = [];
    const glassGeoms: THREE.BufferGeometry[] = [];

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

    const shouldCastShadow = this.config.castShadow;

    // 1. Ornate Base
    addGeom(ironGeoms, baseGeom, 0, 0.4, 0);
    addGeom(ironGeoms, moldingGeom, 0, 0.8, 0);

    // 2. Main Tapered Shaft
    addGeom(ironGeoms, shaftGeom, 0, 3.0, 0);

    // 3. Ornate Rings
    addGeom(ironGeoms, ring1Geom, 0, 2.0, 0);
    addGeom(ironGeoms, ring2Geom, 0, 4.0, 0);

    // 4. Pole Top Cap
    addGeom(ironGeoms, topCapGeom, 0, 5.35, 0);

    // 5. Ornate Double Arms (Crossbar)
    addGeom(ironGeoms, armGeom, 0, 5.4, 0);

    // Curved/diagonal support braces
    for (const side of [-1, 1]) {
      addGeom(ironGeoms, braceGeom, side * 0.38, 5.05, 0, 0, 0, side * 0.72);
    }

    // Finials on the ends of the arm
    for (const side of [-1, 1]) {
      addGeom(ironGeoms, finialGeom, side * 0.96, 5.4, 0);
    }

    // A central top spire
    addGeom(ironGeoms, spireGeom, 0, 5.7, 0);

    // 6. Lanterns (Hanging from the arm ends)
    for (const side of [-1, 1]) {
      const lanternX = side * 0.8;
      const lanternY = 5.25;

      // Hanging bracket/loop
      addGeom(ironGeoms, loopGeom, lanternX, lanternY + 0.05, 0);

      // Lantern Top Roof (cap)
      addGeom(ironGeoms, roofGeom, lanternX, lanternY - 0.06, 0);

      // Glass Body (hexagonal prism)
      addGeom(glassGeoms, bulbGeom, lanternX, lanternY - 0.32, 0);

      // Lantern Bottom Cap
      addGeom(ironGeoms, bottomCapGeom, lanternX, lanternY - 0.52, 0);

      // Bottom finial
      addGeom(ironGeoms, bottomFinialGeom, lanternX, lanternY - 0.62, 0, Math.PI, 0, 0);
    }

    // Merge and add iron meshes
    if (ironGeoms.length > 0) {
      const merged = mergeGeometries(ironGeoms);
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = shouldCastShadow;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      ironGeoms.forEach(g => g.dispose());
    }

    // Merge and add glass meshes
    if (glassGeoms.length > 0) {
      const merged = mergeGeometries(glassGeoms);
      const mesh = new THREE.Mesh(merged, glassMaterial);
      mesh.castShadow = shouldCastShadow;
      this.group.add(mesh);
      glassGeoms.forEach(g => g.dispose());
    }

    // 7. PointLight (centered in the middle of the lamppost's reach to cast light downwards)
    if (!this.config.disableLight) {
      this.pointLight = new THREE.PointLight(
        this.config.lightColor,
        this.config.lightIntensity,
        this.config.lightDistance,
        1.1
      );
      // Position it slightly below the crossbar to illuminate the pole and ground
      this.pointLight.position.set(0, 4.8, 0);
      this.pointLight.castShadow = false; // Disable shadows for performance, emissive handles look
      this.group.add(this.pointLight);
    }
  }

  public setLightEnabled(enabled: boolean) {
    if (this.pointLight) {
      this.pointLight.visible = enabled;
    }
    if (this.glassMaterial) {
      this.glassMaterial.emissiveIntensity = enabled ? 1.8 : 0.0;
    }
  }
}
