import * as THREE from 'three';

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

    const shouldCastShadow = this.config.castShadow;

    // 1. Ornate Base
    const base = new THREE.Mesh(baseGeom, material);
    base.position.y = 0.4;
    base.castShadow = shouldCastShadow;
    base.receiveShadow = true;
    this.group.add(base);

    // Decorative molding on base
    const molding = new THREE.Mesh(moldingGeom, material);
    molding.position.y = 0.8;
    molding.castShadow = shouldCastShadow;
    this.group.add(molding);

    // 2. Main Tapered Shaft
    const shaft = new THREE.Mesh(shaftGeom, material);
    shaft.position.y = 3.0; // centered at 3.0 (from 0.8 to 5.2)
    shaft.castShadow = shouldCastShadow;
    this.group.add(shaft);

    // 3. Ornate Rings
    const ring1 = new THREE.Mesh(ring1Geom, material);
    ring1.position.y = 2.0;
    ring1.castShadow = shouldCastShadow;
    this.group.add(ring1);

    const ring2 = new THREE.Mesh(ring2Geom, material);
    ring2.position.y = 4.0;
    ring2.castShadow = shouldCastShadow;
    this.group.add(ring2);

    // 4. Pole Top Cap
    const topCap = new THREE.Mesh(topCapGeom, material);
    topCap.position.y = 5.35;
    topCap.castShadow = shouldCastShadow;
    this.group.add(topCap);

    // 5. Ornate Double Arms (Crossbar)
    const arm = new THREE.Mesh(armGeom, material);
    arm.position.y = 5.4;
    arm.castShadow = shouldCastShadow;
    this.group.add(arm);

    // Curved/diagonal support braces
    for (const side of [-1, 1]) {
      const brace = new THREE.Mesh(braceGeom, material);
      brace.position.set(side * 0.38, 5.05, 0);
      brace.rotation.z = side * 0.72; // angled brace
      brace.castShadow = shouldCastShadow;
      this.group.add(brace);
    }

    // Finials on the ends of the arm
    for (const side of [-1, 1]) {
      const finial = new THREE.Mesh(finialGeom, material);
      finial.position.set(side * 0.96, 5.4, 0);
      this.group.add(finial);
    }

    // A central top spire
    const spire = new THREE.Mesh(spireGeom, material);
    spire.position.y = 5.7;
    spire.castShadow = shouldCastShadow;
    this.group.add(spire);

    // 6. Lanterns (Hanging from the arm ends)
    for (const side of [-1, 1]) {
      const lanternX = side * 0.8;
      const lanternY = 5.25;

      const lanternGroup = new THREE.Group();
      lanternGroup.position.set(lanternX, lanternY, 0);

      // Hanging bracket/loop
      const loop = new THREE.Mesh(loopGeom, material);
      loop.position.y = 0.05;
      lanternGroup.add(loop);

      // Lantern Top Roof (cap)
      const roof = new THREE.Mesh(roofGeom, material);
      roof.position.y = -0.06;
      roof.castShadow = shouldCastShadow;
      lanternGroup.add(roof);

      // Glass Body (hexagonal prism)
      const bulb = new THREE.Mesh(bulbGeom, glassMaterial);
      bulb.position.y = -0.32;
      bulb.castShadow = shouldCastShadow;
      lanternGroup.add(bulb);

      // Lantern Bottom Cap
      const bottomCap = new THREE.Mesh(bottomCapGeom, material);
      bottomCap.position.y = -0.52;
      bottomCap.castShadow = shouldCastShadow;
      lanternGroup.add(bottomCap);

      const bottomFinial = new THREE.Mesh(bottomFinialGeom, material);
      bottomFinial.position.y = -0.62;
      bottomFinial.rotation.x = Math.PI; // point downwards
      bottomFinial.castShadow = shouldCastShadow;
      lanternGroup.add(bottomFinial);

      this.group.add(lanternGroup);
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
}
