import * as THREE from 'three';

export type WeatherType = 'light_cloud' | 'very_cloudy' | 'rainy' | 'storm';

export interface WeatherContext {
  scene: THREE.Scene;
  skyMaterial: THREE.ShaderMaterial;
  ambientLight: THREE.HemisphereLight;
  sunLight: THREE.DirectionalLight;
  fog: THREE.Fog;
  configureClouds: (count: number, color: THREE.Color, minSpeed: number, maxSpeed: number) => void;
}

function setSceneBackground(scene: THREE.Scene, color: number) {
  if (scene.background instanceof THREE.Color) {
    scene.background.setHex(color);
    return;
  }

  scene.background = new THREE.Color(color);
}

export abstract class Weather {
  protected ctx: WeatherContext;
  
  constructor(ctx: WeatherContext) {
    this.ctx = ctx;
  }

  abstract activate(): void;
  abstract update(delta: number): void;
  abstract deactivate(): void;
  abstract dispose(): void;
}

// -------------------------------------------------------------
// Rain Particle System Helper
// -------------------------------------------------------------
class RainEffect {
  private instancedMesh: THREE.InstancedMesh;
  private count = 1500;
  private velocities: THREE.Vector3[] = [];
  private positions: THREE.Vector3[] = [];
  private dummy = new THREE.Object3D();
  private active = false;
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    // Low-poly slanted rain stick
    const rainGeom = new THREE.BoxGeometry(0.05, 1.8, 0.05);
    const rainMat = new THREE.MeshBasicMaterial({
      color: 0x93b7cc,
      transparent: true,
      opacity: 0.35,
    });

    this.instancedMesh = new THREE.InstancedMesh(rainGeom, rainMat, this.count);
    
    // Distribute rain across a large block around stadium
    for (let i = 0; i < this.count; i++) {
      const pos = new THREE.Vector3(
        (Math.random() - 0.5) * 320,
        Math.random() * 70,
        (Math.random() - 0.5) * 240
      );
      this.positions.push(pos);
      // Fast downward and wind-drifted velocity
      this.velocities.push(new THREE.Vector3(-14, -48 - Math.random() * 14, -5));

      this.dummy.position.copy(pos);
      this.dummy.rotation.set(0.08, 0, -0.28); // tilt in wind
      this.dummy.updateMatrix();
      this.instancedMesh.setMatrixAt(i, this.dummy.matrix);
    }
  }

  public activate() {
    if (this.active) return;
    this.scene.add(this.instancedMesh);
    this.active = true;
  }

  public deactivate() {
    if (!this.active) return;
    this.scene.remove(this.instancedMesh);
    this.active = false;
  }

  public update(delta: number, speedMultiplier = 1.0) {
    if (!this.active) return;

    for (let i = 0; i < this.count; i++) {
      const pos = this.positions[i];
      const vel = this.velocities[i];

      pos.x += vel.x * speedMultiplier * delta;
      pos.y += vel.y * speedMultiplier * delta;
      pos.z += vel.z * speedMultiplier * delta;

      // Wrap when hitting ground
      if (pos.y < 0) {
        pos.y = 70;
        pos.x = (Math.random() - 0.5) * 320;
        pos.z = (Math.random() - 0.5) * 240;
      }

      this.dummy.position.copy(pos);
      this.dummy.updateMatrix();
      this.instancedMesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.instancedMesh.instanceMatrix.needsUpdate = true;
  }

  public setOpacity(opacity: number) {
    const mat = this.instancedMesh.material as THREE.MeshBasicMaterial;
    mat.opacity = opacity;
  }

  public dispose() {
    this.deactivate();
    this.instancedMesh.geometry.dispose();
    if (Array.isArray(this.instancedMesh.material)) {
      this.instancedMesh.material.forEach(m => m.dispose());
    } else {
      this.instancedMesh.material.dispose();
    }
  }
}

// -------------------------------------------------------------
// Lightning Bolt System Helper
// -------------------------------------------------------------
class LightningEffect {
  private scene: THREE.Scene;
  private boltGroup?: THREE.Group;
  private pointLight?: THREE.PointLight;
  private flashTimeMax = 0.2;
  private flashTimer = 0;
  private active = false;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  public trigger(x: number, z: number) {
    this.removeBolt();

    this.boltGroup = new THREE.Group();
    const lightningMaterial = new THREE.MeshBasicMaterial({
      color: 0xd8f3ff,
      toneMapped: false,
    });

    const segments = 7;
    let curr = new THREE.Vector3(x, 60, z);

    for (let i = 0; i < segments; i++) {
      const targetY = 60 - ((i + 1) / segments) * 60;
      const targetX = curr.x + (Math.random() - 0.5) * 14;
      const targetZ = curr.z + (Math.random() - 0.5) * 10;
      const next = new THREE.Vector3(targetX, targetY, targetZ);

      // Create a jagged segment
      const direction = new THREE.Vector3().subVectors(next, curr);
      const len = direction.length();

      // Taper the bolt towards the ground
      const geom = new THREE.CylinderGeometry(0.4 - i * 0.05, 0.35 - i * 0.05, len, 4);
      const mesh = new THREE.Mesh(geom, lightningMaterial);

      const mid = new THREE.Vector3().addVectors(curr, next).multiplyScalar(0.5);
      mesh.position.copy(mid);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());

      this.boltGroup.add(mesh);
      curr.copy(next);
    }

    // Point light to illuminate environment below
    this.pointLight = new THREE.PointLight(0xbde7ff, 30.0, 180.0);
    this.pointLight.position.copy(curr).y += 3;
    this.boltGroup.add(this.pointLight);

    this.scene.add(this.boltGroup);
    this.flashTimer = this.flashTimeMax;
    this.active = true;
  }

  public update(delta: number): boolean {
    if (!this.active) return false;

    this.flashTimer -= delta;
    if (this.flashTimer <= 0) {
      this.removeBolt();
      return false;
    }

    // Flicker lightning visibility
    if (this.boltGroup) {
      const visible = Math.random() > 0.3;
      this.boltGroup.visible = visible;
      if (this.pointLight) {
        this.pointLight.intensity = visible ? 30.0 : 0;
      }
    }

    return true; // Still flashing
  }

  public removeBolt() {
    if (this.boltGroup) {
      this.scene.remove(this.boltGroup);
      this.boltGroup.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach(m => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });
      this.boltGroup = undefined;
      this.pointLight = undefined;
    }
    this.active = false;
  }

  public dispose() {
    this.removeBolt();
  }
}

// -------------------------------------------------------------
// 1. LIGHT CLOUD WEATHER (SUNNY)
// -------------------------------------------------------------
export class LightCloudWeather extends Weather {
  activate() {
    // Sky gradient
    this.ctx.skyMaterial.uniforms.topColor.value.setHex(0x94aebf);
    this.ctx.skyMaterial.uniforms.horizonColor.value.setHex(0xd4d8d0);
    this.ctx.scene.background = new THREE.Color(0xb8c4c8);

    // Fog
    this.ctx.fog.color.setHex(0xb8c4c8);
    this.ctx.fog.near = 105;
    this.ctx.fog.far = 245;

    // Lights
    this.ctx.ambientLight.color.setHex(0xddefff);
    this.ctx.ambientLight.groundColor.setHex(0x485238);
    this.ctx.ambientLight.intensity = 1.8;

    this.ctx.sunLight.color.setHex(0xfff6dc);
    this.ctx.sunLight.intensity = 2.6;
    this.ctx.sunLight.castShadow = true;

    // Clouds
    this.ctx.configureClouds(6, new THREE.Color(0xffffff), 3.5, 7.0);
  }

  update(delta: number) {}
  deactivate() {}
  dispose() {}
}

// -------------------------------------------------------------
// 2. VERY CLOUDY WEATHER (OVERCAST)
// -------------------------------------------------------------
export class VeryCloudyWeather extends Weather {
  activate() {
    // Sky gradient
    this.ctx.skyMaterial.uniforms.topColor.value.setHex(0x5b6d7a);
    this.ctx.skyMaterial.uniforms.horizonColor.value.setHex(0x98a5ad);
    this.ctx.scene.background = new THREE.Color(0x95a2ab);

    // Fog
    this.ctx.fog.color.setHex(0x95a2ab);
    this.ctx.fog.near = 80;
    this.ctx.fog.far = 200;

    // Lights
    this.ctx.ambientLight.color.setHex(0x9ab2c2);
    this.ctx.ambientLight.groundColor.setHex(0x3a4230);
    this.ctx.ambientLight.intensity = 1.2;

    this.ctx.sunLight.color.setHex(0xdfe8f0);
    this.ctx.sunLight.intensity = 0.8;
    this.ctx.sunLight.castShadow = true; // weak shadow

    // Clouds
    this.ctx.configureClouds(16, new THREE.Color(0xdfdfdf), 4.5, 9.0);
  }

  update(delta: number) {}
  deactivate() {}
  dispose() {}
}

// -------------------------------------------------------------
// 3. RAINY WEATHER (WET MIST)
// -------------------------------------------------------------
export class RainyWeather extends Weather {
  private rainEffect?: RainEffect;

  activate() {
    // Sky gradient
    this.ctx.skyMaterial.uniforms.topColor.value.setHex(0x36434d);
    this.ctx.skyMaterial.uniforms.horizonColor.value.setHex(0x6a7780);
    this.ctx.scene.background = new THREE.Color(0x66727a);

    // Fog (pulls in closer due to rain mist)
    this.ctx.fog.color.setHex(0x66727a);
    this.ctx.fog.near = 45;
    this.ctx.fog.far = 160;

    // Lights
    this.ctx.ambientLight.color.setHex(0x788a96);
    this.ctx.ambientLight.groundColor.setHex(0x252a20);
    this.ctx.ambientLight.intensity = 0.9;

    this.ctx.sunLight.color.setHex(0xb8ccd9);
    this.ctx.sunLight.intensity = 0.15; // barely any sun directionality
    this.ctx.sunLight.castShadow = false; // soft diffuse light, no harsh shadow

    // Clouds
    this.ctx.configureClouds(18, new THREE.Color(0xa0aab0), 6.0, 11.0);

    // Rain particles
    if (!this.rainEffect) {
      this.rainEffect = new RainEffect(this.ctx.scene);
    }
    this.rainEffect.setOpacity(0.35);
    this.rainEffect.activate();
  }

  update(delta: number) {
    this.rainEffect?.update(delta, 1.0);
  }

  deactivate() {
    this.rainEffect?.deactivate();
  }

  dispose() {
    this.rainEffect?.dispose();
    this.rainEffect = undefined;
  }
}

// -------------------------------------------------------------
// 4. STORM WEATHER (THUNDERSTORM)
// -------------------------------------------------------------
export class StormWeather extends Weather {
  private rainEffect?: RainEffect;
  private lightningEffect?: LightningEffect;
  private lightningTimer = 0.0;
  private isLightningStrikeActive = false;
  private flashIntensity = 0.0;
  private normalAmbientIntensity = 0.5;

  activate() {
    // Sky gradient
    this.ctx.skyMaterial.uniforms.topColor.value.setHex(0x1f232b);
    this.ctx.skyMaterial.uniforms.horizonColor.value.setHex(0x3c4350);
    this.ctx.scene.background = new THREE.Color(0x2a2f38);

    // Fog (very thick storm mist)
    this.ctx.fog.color.setHex(0x2a2f38);
    this.ctx.fog.near = 35;
    this.ctx.fog.far = 130;

    // Lights
    this.ctx.ambientLight.color.setHex(0x4d5866);
    this.ctx.ambientLight.groundColor.setHex(0x121810);
    this.ctx.ambientLight.intensity = this.normalAmbientIntensity;

    this.ctx.sunLight.color.setHex(0x8aa3b3);
    this.ctx.sunLight.intensity = 0.0; // sun completely blocked
    this.ctx.sunLight.castShadow = false;

    // Clouds
    this.ctx.configureClouds(22, new THREE.Color(0x555c66), 8.0, 15.0);

    // Rain particles (heavy rain)
    if (!this.rainEffect) {
      this.rainEffect = new RainEffect(this.ctx.scene);
    }
    this.rainEffect.setOpacity(0.55);
    this.rainEffect.activate();

    // Lightning
    if (!this.lightningEffect) {
      this.lightningEffect = new LightningEffect(this.ctx.scene);
    }
    this.lightningTimer = 3.0 + Math.random() * 5.0; // first strike in 3-8 seconds
    this.isLightningStrikeActive = false;
  }

  update(delta: number) {
    // 1. Update heavy rain
    this.rainEffect?.update(delta, 1.35); // rain falls 35% faster in storm

    // 2. Update active lightning bolt animation
    if (this.isLightningStrikeActive && this.lightningEffect) {
      const active = this.lightningEffect.update(delta);
      if (!active) {
        // Strike ended, restore normal lighting
        this.isLightningStrikeActive = false;
        this.ctx.skyMaterial.uniforms.topColor.value.setHex(0x1f232b);
        this.ctx.skyMaterial.uniforms.horizonColor.value.setHex(0x3c4350);
        setSceneBackground(this.ctx.scene, 0x2a2f38);
        this.ctx.fog.color.setHex(0x2a2f38);
        this.ctx.ambientLight.color.setHex(0x4d5866);
        this.ctx.ambientLight.intensity = this.normalAmbientIntensity;
      }
    } else {
      // 3. Tick timer to spawn next strike
      this.lightningTimer -= delta;
      if (this.lightningTimer <= 0) {
        // Trigger strike!
        const strikeX = (Math.random() - 0.5) * 160;
        const strikeZ = -140 + Math.random() * 100; // strike somewhere near background skyline
        this.lightningEffect?.trigger(strikeX, strikeZ);
        this.isLightningStrikeActive = true;
        this.lightningTimer = 4.0 + Math.random() * 8.0; // repeat every 4-12 seconds

        // Flash sky and ambient light
        this.ctx.skyMaterial.uniforms.topColor.value.setHex(0xbcdeed);
        this.ctx.skyMaterial.uniforms.horizonColor.value.setHex(0xffffff);
        setSceneBackground(this.ctx.scene, 0xd6e8f2);
        this.ctx.fog.color.setHex(0xd6e8f2);
        this.ctx.ambientLight.color.setHex(0xffffff);
        this.ctx.ambientLight.intensity = 7.0; // intense flash
      }
    }
  }

  deactivate() {
    this.rainEffect?.deactivate();
    this.lightningEffect?.removeBolt();
    // Restore sky/ambient just in case we switch weather during a strike
    this.ctx.skyMaterial.uniforms.topColor.value.setHex(0x1f232b);
    this.ctx.skyMaterial.uniforms.horizonColor.value.setHex(0x3c4350);
    setSceneBackground(this.ctx.scene, 0x2a2f38);
    this.ctx.fog.color.setHex(0x2a2f38);
    this.ctx.ambientLight.color.setHex(0x4d5866);
    this.ctx.ambientLight.intensity = this.normalAmbientIntensity;
  }

  dispose() {
    this.rainEffect?.dispose();
    this.rainEffect = undefined;
    this.lightningEffect?.dispose();
    this.lightningEffect = undefined;
  }
}
