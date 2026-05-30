import * as THREE from 'three';

// Warning light blink timing configuration (in seconds)
const BLINK_PERIOD = 4.8;
const FLASH_DURATION = 0.3;

export class LondonSkyline extends THREE.Group {
  private londonEyeWheel?: THREE.Group;
  private londonEyeCapsules: THREE.Group[] = [];

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
    const skylineColor = 0x76878e; // Misty slate-blue silhouette color
    const skylineMaterial = new THREE.MeshStandardMaterial({
      color: skylineColor,
      roughness: 0.9,
      metalness: 0.1,
    });

    const clockFaceMaterial = new THREE.MeshStandardMaterial({
      color: 0xdfd4bc, // Cream clock face
      roughness: 0.5,
    });

    // 1. Elizabeth Tower (Big Ben) - positioned far North-West
    const bigBen = new THREE.Group();
    bigBen.position.set(-110, 0, -165);

    // Tower shaft
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(6.4, 42.0, 6.4), skylineMaterial);
    shaft.position.y = 21.0;
    shaft.castShadow = true;
    bigBen.add(shaft);

    // Clock belfry section (slightly wider top)
    const belfry = new THREE.Mesh(new THREE.BoxGeometry(7.2, 6.0, 7.2), skylineMaterial);
    belfry.position.y = 45.0;
    belfry.castShadow = true;
    bigBen.add(belfry);

    // Clock faces on 4 sides
    for (const rot of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const face = new THREE.Mesh(new THREE.BoxGeometry(2.8, 2.8, 0.15), clockFaceMaterial);
      face.position.set(0, 45.0, 3.65);
      face.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), rot);
      face.rotation.y = rot;
      bigBen.add(face);
    }

    // Pyramid roof spire
    const spire = new THREE.Mesh(new THREE.ConeGeometry(5.2, 14.0, 4), skylineMaterial);
    spire.position.y = 55.0;
    spire.rotation.y = Math.PI / 4; // Align flat sides with box
    spire.castShadow = true;
    bigBen.add(spire);

    // Spire tip (finial)
    const finial = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.4, 4.0, 4), skylineMaterial);
    finial.position.y = 63.0;
    bigBen.add(finial);

    // Blinking red warning beacon at the very tip of Big Ben
    const bigBenLight = new THREE.Mesh(this.beaconGeom, this.redLightMaterial);
    bigBenLight.position.set(0, 65.2, 0);
    bigBenLight.userData = { phaseOffset: 0.08 * BLINK_PERIOD };
    bigBen.add(bigBenLight);
    this.warningLights.push(bigBenLight);

    this.add(bigBen);

    // 2. The Shard - positioned far North-East
    const shard = new THREE.Group();
    shard.position.set(130, 0, -175);

    // Tall pyramid shape
    const shardBody = new THREE.Mesh(new THREE.ConeGeometry(8.5, 78.0, 4), skylineMaterial);
    shardBody.position.y = 39.0;
    shardBody.rotation.y = Math.PI / 4;
    shardBody.castShadow = true;
    shard.add(shardBody);

    // Angled facade shard wings for architectural detail
    const wing1 = new THREE.Mesh(new THREE.ConeGeometry(6.0, 68.0, 3), skylineMaterial);
    wing1.position.set(-2, 34, 1);
    wing1.rotation.y = 0.5;
    shard.add(wing1);

    const wing2 = new THREE.Mesh(new THREE.ConeGeometry(5.0, 58.0, 3), skylineMaterial);
    wing2.position.set(2, 29, -2);
    wing2.rotation.y = -0.5;
    shard.add(wing2);

    // Blinking red warning beacon at the Shard peak
    const shardLight = new THREE.Mesh(this.beaconGeom, this.redLightMaterial);
    shardLight.position.set(0, 78.2, 0);
    shardLight.userData = { phaseOffset: 0.5 * BLINK_PERIOD };
    shard.add(shardLight);
    this.warningLights.push(shardLight);

    this.add(shard);

    // 3. The London Eye - positioned far North-Center-East
    const londonEye = new THREE.Group();
    londonEye.position.set(25, 0, -185);

    // A-frame support legs (Front and Back) - mathematically aligned to meet exactly at the hub (0, 48, 0)
    const leg1 = new THREE.Mesh(new THREE.BoxGeometry(1.2, 50.6, 1.2), skylineMaterial);
    leg1.position.set(-8.0, 24.0, 0);
    leg1.rotation.z = -0.322; // Rotates to connect exactly to the center hub
    leg1.castShadow = true;
    londonEye.add(leg1);

    const leg2 = new THREE.Mesh(new THREE.BoxGeometry(1.2, 50.6, 1.2), skylineMaterial);
    leg2.position.set(8.0, 24.0, 0);
    leg2.rotation.z = 0.322; // Rotates to connect exactly to the center hub
    leg2.castShadow = true;
    londonEye.add(leg2);

    // Back support bracing - mathematically aligned to meet exactly at the hub (0, 48, 0)
    const brace = new THREE.Mesh(new THREE.BoxGeometry(1.0, 50.6, 1.0), skylineMaterial);
    brace.position.set(0, 24.0, -8.0);
    brace.rotation.x = 0.322; // Tilts forward to meet center hub
    brace.castShadow = true;
    londonEye.add(brace);

    // Center spindle/hub
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 6.0, 8), skylineMaterial);
    hub.position.set(0, 48.0, 0);
    hub.rotation.x = Math.PI / 2; // points front-to-back
    hub.castShadow = true;
    londonEye.add(hub);

    // Giant outer wheel ring
    this.londonEyeWheel = new THREE.Group();
    this.londonEyeWheel.position.set(0, 48.0, 0);

    const outerRing = new THREE.Mesh(new THREE.TorusGeometry(26.0, 0.5, 4, 32), skylineMaterial);
    outerRing.castShadow = true;
    this.londonEyeWheel.add(outerRing);

    const innerRing = new THREE.Mesh(new THREE.TorusGeometry(23.5, 0.25, 4, 32), skylineMaterial);
    innerRing.castShadow = true;
    this.londonEyeWheel.add(innerRing);

    // Static blinking red warning beacon on top of the London Eye central hub spindle
    const hubLight = new THREE.Mesh(this.beaconGeom, this.redLightMaterial);
    hubLight.position.set(0, 50.5, 0); // spindle is at y=48.0, spindle diameter/legs height
    hubLight.userData = { phaseOffset: 0.25 * BLINK_PERIOD };
    londonEye.add(hubLight);
    this.warningLights.push(hubLight);

    // 8 blinking red warning beacons distributed around the outer rim of the London Eye wheel (rotates with it)
    const numEyeLights = 8;
    for (let i = 0; i < numEyeLights; i++) {
      const angle = (i / numEyeLights) * Math.PI * 2;
      const eyeLight = new THREE.Mesh(this.beaconGeom, this.redLightMaterial);
      // Outer ring has radius 26.0, mount slightly offset (radius 26.3)
      eyeLight.position.set(Math.cos(angle) * 26.3, Math.sin(angle) * 26.3, 0);
      eyeLight.userData = { phaseOffset: (i / numEyeLights) * BLINK_PERIOD }; // Chasing light loop
      this.londonEyeWheel.add(eyeLight);
      this.warningLights.push(eyeLight);
    }

    // 8 spokes
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI;
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.15, 52.0, 0.15), skylineMaterial);
      spoke.rotation.z = angle;
      this.londonEyeWheel.add(spoke);
    }

    // Detailed ovoid/glass gondolas around the rim (the real London Eye has 32 capsules)
    this.londonEyeCapsules = [];
    const capsuleCount = 32;
    const cabinMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.1,
      metalness: 0.9,
      transparent: true,
      opacity: 0.75,
    });
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x3a484d,
      roughness: 0.8,
    });

    for (let i = 0; i < capsuleCount; i++) {
      const angle = (i / capsuleCount) * Math.PI * 2;
      
      // The outer ring of the wheel has a radius of 26.0.
      // We mount the capsules slightly outward at radius 27.2.
      const mountX = Math.cos(angle) * 26.6;
      const mountY = Math.sin(angle) * 26.6;
      const capX = Math.cos(angle) * 27.25;
      const capY = Math.sin(angle) * 27.25;

      // 1. Radial mounting bracket/pin (fixed to the wheel, rotates with it)
      const mountPin = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.3, 0.4), skylineMaterial);
      mountPin.position.set(mountX, mountY, 0);
      mountPin.rotation.z = angle - Math.PI / 2;
      mountPin.castShadow = true;
      this.londonEyeWheel.add(mountPin);

      // 2. The Gondola Group (oriented upright via animation loop)
      const gondola = new THREE.Group();
      gondola.position.set(capX, capY, 0);

      // Glass Cabin (using a capsule geometry for ovoid shape)
      const cabin = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 0.9, 4, 8), cabinMat);
      cabin.rotation.x = Math.PI / 2; // Lie horizontal along the spindle/Z-axis
      cabin.castShadow = true;
      gondola.add(cabin);

      // Cabin interior floor platform
      const floor = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.05, 1.5), floorMat);
      floor.position.y = -0.12; // positioned slightly below the center
      floor.castShadow = true;
      gondola.add(floor);

      // Outer Structural Ring/Torus wrapping around the middle of the ovoid capsule
      const outerTorus = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.07, 4, 12), skylineMaterial);
      outerTorus.castShadow = true;
      gondola.add(outerTorus);

      // Spindle attachment hub connecting the bottom of the torus to the mounting bracket
      const spindle = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.3, 6), skylineMaterial);
      spindle.position.y = -0.45;
      spindle.rotation.x = Math.PI / 2;
      spindle.castShadow = true;
      gondola.add(spindle);

      this.londonEyeWheel.add(gondola);
      this.londonEyeCapsules.push(gondola);
    }

    londonEye.add(this.londonEyeWheel);
    this.add(londonEye);

    // 4. Distant spires/buildings (Westminster silhouette block)
    const westminster = new THREE.Group();
    westminster.position.set(-155, 0, -170);

    // Wide base
    const westBase = new THREE.Mesh(new THREE.BoxGeometry(22.0, 14.0, 8.0), skylineMaterial);
    westBase.position.y = 7.0;
    westBase.castShadow = true;
    westminster.add(westBase);

    // Spires
    for (const offset of [-8, -4, 4, 8]) {
      const spireCol = new THREE.Mesh(new THREE.BoxGeometry(1.6, 12.0, 1.6), skylineMaterial);
      spireCol.position.set(offset, 18.0, 0);
      spireCol.castShadow = true;
      westminster.add(spireCol);

      const spireTip = new THREE.Mesh(new THREE.ConeGeometry(1.1, 5.0, 4), skylineMaterial);
      spireTip.position.set(offset, 25.5, 0);
      spireTip.rotation.y = Math.PI / 4;
      spireTip.castShadow = true;
      westminster.add(spireTip);
    }

    this.add(westminster);
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
        const mat = horizonMats[row];
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
          const block = new THREE.Mesh(
            new THREE.BoxGeometry(width, height, blockDepth),
            mat,
          );
          block.position.set(bx, height / 2, bz);
          block.rotation.y = side.facingY;
          block.castShadow = true;
          this.add(block);

          let peakY = height;

          // Some buildings get a taller tower/penthouse on top (20% chance)
          if (noise(globalIdx, 19) > 0.80) {
            const towerWidth = width * (0.3 + noise(globalIdx, 23) * 0.3);
            const towerHeight = height * (0.3 + noise(globalIdx, 29) * 0.5);
            const tower = new THREE.Mesh(
              new THREE.BoxGeometry(towerWidth, towerHeight, blockDepth * 0.5),
              mat,
            );
            tower.position.set(bx, height + towerHeight / 2, bz);
            tower.rotation.y = side.facingY;
            tower.castShadow = true;
            this.add(tower);

            if (height + towerHeight > peakY) {
              peakY = height + towerHeight;
            }
          }

          // Some buildings get a pitched roof cap (30% chance on shorter buildings)
          if (height < 20 && noise(globalIdx, 31) > 0.70) {
            const roofHeight = 2.5 + noise(globalIdx, 37) * 2.5;
            const roof = new THREE.Mesh(
              new THREE.ConeGeometry(width * 0.52, roofHeight, 4),
              mat,
            );
            roof.position.set(bx, height + roofHeight / 2, bz);
            roof.rotation.y = side.facingY + Math.PI / 4;
            roof.castShadow = true;
            this.add(roof);

            if (height + roofHeight > peakY) {
              peakY = height + roofHeight;
            }
          }

          // Some taller buildings get a thin spire (15% chance on row 2+)
          if (row >= 1 && height > 25 && noise(globalIdx, 41) > 0.85) {
            const spireH = 6 + noise(globalIdx, 43) * 10;
            const spire = new THREE.Mesh(
              new THREE.ConeGeometry(0.8, spireH, 4),
              mat,
            );
            spire.position.set(bx, height + spireH / 2, bz);
            spire.rotation.y = Math.PI / 4;
            this.add(spire);

            if (height + spireH > peakY) {
              peakY = height + spireH;
            }
          }

          // Add a blinking warning light if the building's final peak height is tall (peakY > 30.0)
          if (peakY > 30.0) {
            const light = new THREE.Mesh(this.beaconGeom, this.redLightMaterial);
            light.position.set(bx, peakY + 0.4, bz);
            // Assign pseudo-random timing offset based on global index to desynchronize them over the period
            light.userData = { phaseOffset: (((globalIdx * 7.3) % 100) / 100) * BLINK_PERIOD };
            this.add(light);
            this.warningLights.push(light);
          }
        }
      }
    }
  }

  public update(delta: number, running: boolean) {
    if (running && this.londonEyeWheel) {
      const rotationAmount = delta * 0.03;
      this.londonEyeWheel.rotation.z += rotationAmount;

      // Keep the gondolas/capsules upright
      this.londonEyeCapsules.forEach((capsule) => {
        capsule.rotation.z = -this.londonEyeWheel!.rotation.z;
      });
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
