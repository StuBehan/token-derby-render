import * as THREE from 'three';

export type WeatherType = 'light_cloud' | 'very_cloudy' | 'rainy' | 'storm';

export interface WeatherContext {
  scene: THREE.Scene;
  skyMaterial: THREE.ShaderMaterial;
  ambientLight: THREE.HemisphereLight;
  sunLight: THREE.DirectionalLight;
  fog: THREE.Fog;
  configureClouds: (count: number, color: THREE.Color, minSpeed: number, maxSpeed: number) => void;
  rainEffect: RainEffect;
  lightningEffect: LightningEffect;
  skyMesh: THREE.Mesh;
}

export interface WeatherParams {
  skyTopColor: THREE.Color;
  skyHorizonColor: THREE.Color;
  backgroundColor: THREE.Color;
  fogColor: THREE.Color;
  fogNear: number;
  fogFar: number;
  ambientColor: THREE.Color;
  ambientGroundColor: THREE.Color;
  ambientIntensity: number;
  sunColor: THREE.Color;
  sunIntensity: number;
  cloudCount: number;
  cloudColor: THREE.Color;
  cloudMinSpeed: number;
  cloudMaxSpeed: number;
  rainIntensity: number;
  rainSpeedMultiplier: number;
  lightningProbability: number;
}

function setSceneBackground(scene: THREE.Scene, color: THREE.Color) {
  if (scene.background instanceof THREE.Color) {
    scene.background.copy(color);
  } else {
    scene.background = color.clone();
  }
}

// -------------------------------------------------------------
// Rain Particle System Helper
// -------------------------------------------------------------
export class RainEffect {
  private instancedMesh: THREE.InstancedMesh;
  private active = false;
  private scene: THREE.Scene;
  private elapsed = 0;

  constructor(scene: THREE.Scene, private readonly count = 5000) {
    this.scene = scene;
    // Low-poly slanted rain stick
    const rainGeom = new THREE.BoxGeometry(0.03, 1.4, 0.03);

    const rainMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uTime: { value: 0 },
          uVelocity: { value: new THREE.Vector3(-14, -48, -5) },
          uRange: { value: new THREE.Vector3(320, 70, 240) },
          uColor: { value: new THREE.Color(0x617c8c) },
          uRainIntensity: { value: 0.0 }, // 0.0 (collapsed) to 1.0 (full size)
        }
      ]),
      vertexShader: `
        #include <common>
        #include <fog_pars_vertex>
        uniform float uTime;
        uniform vec3 uVelocity;
        uniform vec3 uRange;
        uniform float uRainIntensity;
        
        void main() {
          vec4 mvPosition;
          #ifdef USE_INSTANCING
            mat4 modifiedInstanceMatrix = instanceMatrix;
            vec3 initialPos = instanceMatrix[3].xyz;
            
            // Generate a seed based on initial XZ position to vary velocity/speed slightly
            float seed = sin(dot(initialPos.xz, vec2(12.9898, 78.233))) * 43758.5453;
            float speedFactor = 0.8 + fract(seed) * 0.4;
            
            // Calculate progress distance
            float xMoved = -uVelocity.x * speedFactor * uTime;
            float yMoved = -uVelocity.y * speedFactor * uTime;
            float zMoved = -uVelocity.z * speedFactor * uTime;
            
            vec3 currentPos;
            currentPos.y = mod(initialPos.y - mod(yMoved, uRange.y) + uRange.y, uRange.y);
            currentPos.x = mod((initialPos.x + uRange.x * 0.5) - mod(xMoved, uRange.x) + uRange.x, uRange.x) - uRange.x * 0.5;
            currentPos.z = mod((initialPos.z + uRange.z * 0.5) - mod(zMoved, uRange.z) + uRange.z, uRange.z) - uRange.z * 0.5;
            
            modifiedInstanceMatrix[3].xyz = currentPos;
            
            // Scale vertices locally by uRainIntensity to collapse geometries smoothly
            vec4 localPosition = vec4(position * uRainIntensity, 1.0);
            mvPosition = modelViewMatrix * modifiedInstanceMatrix * localPosition;
          #else
            mvPosition = modelViewMatrix * vec4(position, 1.0);
          #endif
          gl_Position = projectionMatrix * mvPosition;
          
          #include <fog_vertex>
        }
      `,
      fragmentShader: `
        #include <common>
        #include <fog_pars_fragment>
        uniform vec3 uColor;
        
        void main() {
          gl_FragColor = vec4(uColor, 1.0);
          #include <fog_fragment>
        }
      `,
      fog: true,
      transparent: false,
    });

    this.instancedMesh = new THREE.InstancedMesh(rainGeom, rainMat, this.count);
    
    // Distribute rain across a large block around stadium once
    const dummy = new THREE.Object3D();
    for (let i = 0; i < this.count; i++) {
      const pos = new THREE.Vector3(
        (Math.random() - 0.5) * 320,
        Math.random() * 70,
        (Math.random() - 0.5) * 240
      );

      dummy.position.copy(pos);
      dummy.rotation.set(0.08, 0, -0.28); // tilt in wind
      dummy.updateMatrix();
      this.instancedMesh.setMatrixAt(i, dummy.matrix);
    }
    
    this.instancedMesh.instanceMatrix.needsUpdate = true;
  }

  public setIntensity(intensity: number) {
    const mat = this.instancedMesh.material as THREE.ShaderMaterial;
    mat.uniforms.uRainIntensity.value = intensity;

    if (intensity > 0.001 && !this.active) {
      this.scene.add(this.instancedMesh);
      this.active = true;
    } else if (intensity <= 0.001 && this.active) {
      this.scene.remove(this.instancedMesh);
      this.active = false;
    }
  }

  public update(delta: number, speedMultiplier = 1.0) {
    if (!this.active) return;
    this.elapsed += delta * speedMultiplier;
    
    const mat = this.instancedMesh.material as THREE.ShaderMaterial;
    mat.uniforms.uTime.value = this.elapsed;
  }

  public dispose() {
    if (this.active) {
      this.scene.remove(this.instancedMesh);
      this.active = false;
    }
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
export class LightningEffect {
  private scene: THREE.Scene;
  private boltGroup?: THREE.Group;
  private pointLight?: THREE.PointLight;
  private flashTimeMax = 0.2;
  private flashTimer = 0;
  private active = false;
  private readonly segmentGeom = new THREE.CylinderGeometry(0.5, 0.5, 1.0, 4);

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

      const direction = new THREE.Vector3().subVectors(next, curr);
      const len = direction.length();
      const thickness = 0.4 - i * 0.05;

      const mesh = new THREE.Mesh(this.segmentGeom, lightningMaterial);
      mesh.scale.set(thickness, len, thickness);

      const mid = new THREE.Vector3().addVectors(curr, next).multiplyScalar(0.5);
      mesh.position.copy(mid);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());

      this.boltGroup.add(mesh);
      curr.copy(next);
    }

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

    if (this.boltGroup) {
      const visible = Math.random() > 0.3;
      this.boltGroup.visible = visible;
      if (this.pointLight) {
        this.pointLight.intensity = visible ? 30.0 : 0;
      }
    }

    return true;
  }

  public removeBolt() {
    if (this.boltGroup) {
      this.scene.remove(this.boltGroup);
      this.boltGroup.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
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
    this.segmentGeom.dispose();
  }
}

// -------------------------------------------------------------
// Weather Manager (Smooth Interpolation & Time of Day integration)
// -------------------------------------------------------------
export class WeatherManager {
  private ctx: WeatherContext;
  private currentParams: WeatherParams;
  private targetParams: WeatherParams;
  private activeType: WeatherType;
  private transitionSpeed = 0.55; // Complete transition in ~1.8 seconds

  private lightningTimer = 3.0;
  private isLightningStrikeActive = false;

  // GC-free temp color objects to avoid allocation stutters at 60 FPS
  private tempColor = new THREE.Color();
  private tempColor2 = new THREE.Color();

  // Phase Specific Colors for Sunrise, Sunset, and Night transitions
  private readonly sunsetSkyTop = new THREE.Color(0x35284f);
  private readonly sunsetSkyHorizon = new THREE.Color(0xd3683a);
  private readonly sunsetAmbient = new THREE.Color(0x5a4843);
  private readonly sunsetSun = new THREE.Color(0xff4500);

  private readonly nightSkyTop = new THREE.Color(0x020408);
  private readonly nightSkyHorizon = new THREE.Color(0x060814);
  private readonly nightAmbient = new THREE.Color(0x090d16);
  private readonly nightSun = new THREE.Color(0x000000);

  private readonly sunriseSkyTop = new THREE.Color(0x5a4f7c);
  private readonly sunriseSkyHorizon = new THREE.Color(0xe09b75);
  private readonly sunriseAmbient = new THREE.Color(0x5f524a);
  private readonly sunriseSun = new THREE.Color(0xffcc88);

  constructor(ctx: WeatherContext, initialType: WeatherType) {
    this.ctx = ctx;
    this.activeType = initialType;

    this.currentParams = this.createDefaultParams();
    this.targetParams = this.createDefaultParams();

    this.copyParams(this.targetParams, this.getParamsForType(initialType));
    this.copyParams(this.currentParams, this.targetParams);

    this.applyParams(this.currentParams, 12.0); // Default to day setup initially
  }

  public setWeather(type: WeatherType) {
    this.activeType = type;
    this.copyParams(this.targetParams, this.getParamsForType(type));
  }

  public update(delta: number, timeOfDay: number) {
    // 1. Interpolate base weather presets
    const t = Math.min(delta * this.transitionSpeed, 1.0);

    this.currentParams.skyTopColor.lerp(this.targetParams.skyTopColor, t);
    this.currentParams.skyHorizonColor.lerp(this.targetParams.skyHorizonColor, t);
    this.currentParams.backgroundColor.lerp(this.targetParams.backgroundColor, t);
    this.currentParams.fogColor.lerp(this.targetParams.fogColor, t);
    this.currentParams.fogNear = THREE.MathUtils.lerp(this.currentParams.fogNear, this.targetParams.fogNear, t);
    this.currentParams.fogFar = THREE.MathUtils.lerp(this.currentParams.fogFar, this.targetParams.fogFar, t);
    this.currentParams.ambientColor.lerp(this.targetParams.ambientColor, t);
    this.currentParams.ambientGroundColor.lerp(this.targetParams.ambientGroundColor, t);
    this.currentParams.ambientIntensity = THREE.MathUtils.lerp(this.currentParams.ambientIntensity, this.targetParams.ambientIntensity, t);
    this.currentParams.sunColor.lerp(this.targetParams.sunColor, t);
    this.currentParams.sunIntensity = THREE.MathUtils.lerp(this.currentParams.sunIntensity, this.targetParams.sunIntensity, t);
    this.currentParams.cloudCount = THREE.MathUtils.lerp(this.currentParams.cloudCount, this.targetParams.cloudCount, t);
    this.currentParams.cloudColor.lerp(this.targetParams.cloudColor, t);
    this.currentParams.cloudMinSpeed = THREE.MathUtils.lerp(this.currentParams.cloudMinSpeed, this.targetParams.cloudMinSpeed, t);
    this.currentParams.cloudMaxSpeed = THREE.MathUtils.lerp(this.currentParams.cloudMaxSpeed, this.targetParams.cloudMaxSpeed, t);
    this.currentParams.rainIntensity = THREE.MathUtils.lerp(this.currentParams.rainIntensity, this.targetParams.rainIntensity, t);
    this.currentParams.rainSpeedMultiplier = THREE.MathUtils.lerp(this.currentParams.rainSpeedMultiplier, this.targetParams.rainSpeedMultiplier, t);
    this.currentParams.lightningProbability = THREE.MathUtils.lerp(this.currentParams.lightningProbability, this.targetParams.lightningProbability, t);

    // 2. Compute Time-of-Day modulation parameters
    this.applyParams(this.currentParams, timeOfDay);

    // 3. Update rain coordinates shifting
    this.ctx.rainEffect.update(delta, this.currentParams.rainSpeedMultiplier);

    // 4. Update lightning strike cycles
    if (this.isLightningStrikeActive) {
      const active = this.ctx.lightningEffect.update(delta);
      if (!active) {
        this.isLightningStrikeActive = false;
      }
    } else if (this.currentParams.lightningProbability > 0.5) {
      this.lightningTimer -= delta;
      if (this.lightningTimer <= 0) {
        const strikeX = (Math.random() - 0.5) * 160;
        const strikeZ = -140 + Math.random() * 100;
        this.ctx.lightningEffect.trigger(strikeX, strikeZ);
        this.isLightningStrikeActive = true;
        this.lightningTimer = 4.0 + Math.random() * 8.0;
      }
    }

    // Apply lightning flash override
    if (this.isLightningStrikeActive) {
      this.ctx.skyMaterial.uniforms.topColor.value.setHex(0xbcdeed);
      this.ctx.skyMaterial.uniforms.horizonColor.value.setHex(0xffffff);
      setSceneBackground(this.ctx.scene, new THREE.Color(0xd6e8f2));
      this.ctx.fog.color.setHex(0xd6e8f2);
      this.ctx.ambientLight.color.setHex(0xffffff);
      this.ctx.ambientLight.intensity = 7.0;
    }
  }

  private applyParams(params: WeatherParams, timeOfDay: number) {
    // Determine time-of-day weights
    let dayWeight = 0;
    let sunsetWeight = 0;
    let nightWeight = 0;
    let sunriseWeight = 0;

    // Determine time-of-day weights (fully continuous, zero-jump transitions)
    if (timeOfDay >= 8.0 && timeOfDay < 17.0) {
      dayWeight = 1.0;
    } else if (timeOfDay >= 17.0 && timeOfDay < 19.0) {
      const t = (timeOfDay - 17.0) / 2.0;
      dayWeight = 1.0 - t;
      sunsetWeight = t;
    } else if (timeOfDay >= 19.0 && timeOfDay < 21.0) {
      const t = (timeOfDay - 19.0) / 2.0;
      sunsetWeight = 1.0 - t;
      nightWeight = t;
    } else if (timeOfDay >= 21.0 || timeOfDay < 4.5) {
      nightWeight = 1.0;
    } else if (timeOfDay >= 4.5 && timeOfDay < 6.5) {
      const t = (timeOfDay - 4.5) / 2.0;
      nightWeight = 1.0 - t;
      sunriseWeight = t;
    } else if (timeOfDay >= 6.5 && timeOfDay < 8.0) {
      const t = (timeOfDay - 6.5) / 1.5;
      sunriseWeight = 1.0 - t;
      dayWeight = t;
    }

    const dayFactor = dayWeight + sunriseWeight * 0.7 + sunsetWeight * 0.5;

    // Orbit the sun in space based on time of day
    const angle = ((timeOfDay - 6.0) / 24.0) * Math.PI * 2;
    const radius = 180;
    const sunX = Math.cos(angle) * radius;
    const sunY = Math.sin(angle) * radius;
    const sunZ = Math.cos(angle) * 30.0 + 40.0;
    this.ctx.sunLight.position.set(sunX, sunY, sunZ);

    const heightRatio = Math.max(0.0, sunY / radius);

    // Apply modulated sky gradients (mix day/sunrise/sunset/night states)
    // Apply modulated sky gradients (mix day/sunrise/sunset/night states)
    this.tempColor.copy(params.skyTopColor).multiplyScalar(dayFactor);
    this.tempColor.add(this.tempColor2.copy(this.sunsetSkyTop).multiplyScalar(sunsetWeight));
    this.tempColor.add(this.tempColor2.copy(this.nightSkyTop).multiplyScalar(nightWeight));
    this.tempColor.add(this.tempColor2.copy(this.sunriseSkyTop).multiplyScalar(sunriseWeight));
    this.ctx.skyMaterial.uniforms.topColor.value.copy(this.tempColor);

    this.tempColor.copy(params.skyHorizonColor).multiplyScalar(dayFactor);
    this.tempColor.add(this.tempColor2.copy(this.sunsetSkyHorizon).multiplyScalar(sunsetWeight));
    this.tempColor.add(this.tempColor2.copy(this.nightSkyHorizon).multiplyScalar(nightWeight));
    this.tempColor.add(this.tempColor2.copy(this.sunriseSkyHorizon).multiplyScalar(sunriseWeight));
    this.ctx.skyMaterial.uniforms.horizonColor.value.copy(this.tempColor);

    // Apply modulated scene background and fog color
    this.tempColor.copy(params.backgroundColor).multiplyScalar(dayFactor);
    this.tempColor.add(this.tempColor2.copy(this.sunsetSkyHorizon).multiplyScalar(sunsetWeight));
    this.tempColor.add(this.tempColor2.copy(this.nightSkyHorizon).multiplyScalar(nightWeight));
    this.tempColor.add(this.tempColor2.copy(this.sunriseSkyHorizon).multiplyScalar(sunriseWeight));
    setSceneBackground(this.ctx.scene, this.tempColor);
    this.ctx.fog.color.copy(this.tempColor);
    this.ctx.fog.near = params.fogNear;
    this.ctx.fog.far = params.fogFar;

    // Apply modulated ambient light
    this.tempColor.copy(params.ambientColor).multiplyScalar(dayFactor);
    this.tempColor.add(this.tempColor2.copy(this.sunsetAmbient).multiplyScalar(sunsetWeight));
    this.tempColor.add(this.tempColor2.copy(this.nightAmbient).multiplyScalar(nightWeight));
    this.tempColor.add(this.tempColor2.copy(this.sunriseAmbient).multiplyScalar(sunriseWeight));
    this.ctx.ambientLight.color.copy(this.tempColor);
    this.ctx.ambientLight.groundColor.copy(params.ambientGroundColor);
    this.ctx.ambientLight.intensity = params.ambientIntensity * (dayWeight + sunsetWeight * 0.7 + sunriseWeight * 0.8) + 0.25 * nightWeight;

    // Apply modulated sun light color
    this.tempColor.copy(params.sunColor).multiplyScalar(dayFactor);
    this.tempColor.add(this.tempColor2.copy(this.sunsetSun).multiplyScalar(sunsetWeight));
    this.tempColor.add(this.tempColor2.copy(this.nightSun).multiplyScalar(nightWeight));
    this.tempColor.add(this.tempColor2.copy(this.sunriseSun).multiplyScalar(sunriseWeight));
    this.ctx.sunLight.color.copy(this.tempColor);

    // Fade sun light intensity based on height and phase weights
    const sunIntensity = params.sunIntensity * (dayWeight * heightRatio + sunsetWeight * heightRatio * 0.5 + sunriseWeight * heightRatio * 0.5);
    this.ctx.sunLight.intensity = sunIntensity;
    this.ctx.sunLight.castShadow = sunIntensity > 0.3;

    // Darken clouds dynamically at night
    this.tempColor.copy(params.cloudColor).multiplyScalar(dayFactor);
    this.ctx.configureClouds(
      Math.round(params.cloudCount),
      this.tempColor,
      params.cloudMinSpeed,
      params.cloudMaxSpeed
    );

    // Apply rain vertex scale
    this.ctx.rainEffect.setIntensity(params.rainIntensity);

    // Apply celestial skybox rotations (Polar axis tilt, Y-axis rotate)
    this.ctx.skyMesh.rotation.set(0.3, timeOfDay * 0.05, 0.1);

    // Update stars intensity in shader based on night weight
    this.ctx.skyMaterial.uniforms.nightFactor.value = nightWeight;
  }

  private createDefaultParams(): WeatherParams {
    return {
      skyTopColor: new THREE.Color(),
      skyHorizonColor: new THREE.Color(),
      backgroundColor: new THREE.Color(),
      fogColor: new THREE.Color(),
      fogNear: 100,
      fogFar: 200,
      ambientColor: new THREE.Color(),
      ambientGroundColor: new THREE.Color(),
      ambientIntensity: 1.0,
      sunColor: new THREE.Color(),
      sunIntensity: 1.0,
      cloudCount: 10,
      cloudColor: new THREE.Color(),
      cloudMinSpeed: 5,
      cloudMaxSpeed: 10,
      rainIntensity: 0,
      rainSpeedMultiplier: 1.0,
      lightningProbability: 0,
    };
  }

  private copyParams(dest: WeatherParams, src: WeatherParams) {
    dest.skyTopColor.copy(src.skyTopColor);
    dest.skyHorizonColor.copy(src.skyHorizonColor);
    dest.backgroundColor.copy(src.backgroundColor);
    dest.fogColor.copy(src.fogColor);
    dest.fogNear = src.fogNear;
    dest.fogFar = src.fogFar;
    dest.ambientColor.copy(src.ambientColor);
    dest.ambientGroundColor.copy(src.ambientGroundColor);
    dest.ambientIntensity = src.ambientIntensity;
    dest.sunColor.copy(src.sunColor);
    dest.sunIntensity = src.sunIntensity;
    dest.cloudCount = src.cloudCount;
    dest.cloudColor.copy(src.cloudColor);
    dest.cloudMinSpeed = src.cloudMinSpeed;
    dest.cloudMaxSpeed = src.cloudMaxSpeed;
    dest.rainIntensity = src.rainIntensity;
    dest.rainSpeedMultiplier = src.rainSpeedMultiplier;
    dest.lightningProbability = src.lightningProbability;
  }

  private getParamsForType(type: WeatherType): WeatherParams {
    switch (type) {
      case 'light_cloud':
        return {
          skyTopColor: new THREE.Color(0x94aebf),
          skyHorizonColor: new THREE.Color(0xd4d8d0),
          backgroundColor: new THREE.Color(0xb8c4c8),
          fogColor: new THREE.Color(0xb8c4c8),
          fogNear: 105,
          fogFar: 245,
          ambientColor: new THREE.Color(0xddefff),
          ambientGroundColor: new THREE.Color(0x485238),
          ambientIntensity: 1.8,
          sunColor: new THREE.Color(0xfff6dc),
          sunIntensity: 2.6,
          cloudCount: 6,
          cloudColor: new THREE.Color(0xffffff),
          cloudMinSpeed: 3.5,
          cloudMaxSpeed: 7.0,
          rainIntensity: 0.0,
          rainSpeedMultiplier: 1.0,
          lightningProbability: 0.0,
        };
      case 'very_cloudy':
        return {
          skyTopColor: new THREE.Color(0x5b6d7a),
          skyHorizonColor: new THREE.Color(0x98a5ad),
          backgroundColor: new THREE.Color(0x95a2ab),
          fogColor: new THREE.Color(0x95a2ab),
          fogNear: 80,
          fogFar: 200,
          ambientColor: new THREE.Color(0x9ab2c2),
          ambientGroundColor: new THREE.Color(0x3a4230),
          ambientIntensity: 1.2,
          sunColor: new THREE.Color(0xdfe8f0),
          sunIntensity: 0.8,
          cloudCount: 16,
          cloudColor: new THREE.Color(0xdfdfdf),
          cloudMinSpeed: 4.5,
          cloudMaxSpeed: 9.0,
          rainIntensity: 0.0,
          rainSpeedMultiplier: 1.0,
          lightningProbability: 0.0,
        };
      case 'rainy':
        return {
          skyTopColor: new THREE.Color(0x36434d),
          skyHorizonColor: new THREE.Color(0x6a7780),
          backgroundColor: new THREE.Color(0x66727a),
          fogColor: new THREE.Color(0x66727a),
          fogNear: 45,
          fogFar: 160,
          ambientColor: new THREE.Color(0x788a96),
          ambientGroundColor: new THREE.Color(0x252a20),
          ambientIntensity: 0.9,
          sunColor: new THREE.Color(0xb8ccd9),
          sunIntensity: 0.15,
          cloudCount: 18,
          cloudColor: new THREE.Color(0xa0aab0),
          cloudMinSpeed: 6.0,
          cloudMaxSpeed: 11.0,
          rainIntensity: 0.6, // Moderate rain
          rainSpeedMultiplier: 1.0,
          lightningProbability: 0.0,
        };
      case 'storm':
        return {
          skyTopColor: new THREE.Color(0x1f232b),
          skyHorizonColor: new THREE.Color(0x3c4350),
          backgroundColor: new THREE.Color(0x2a2f38),
          fogColor: new THREE.Color(0x2a2f38),
          fogNear: 35,
          fogFar: 130,
          ambientColor: new THREE.Color(0x4d5866),
          ambientGroundColor: new THREE.Color(0x121810),
          ambientIntensity: 0.5,
          sunColor: new THREE.Color(0x8aa3b3),
          sunIntensity: 0.0,
          cloudCount: 22,
          cloudColor: new THREE.Color(0x555c66),
          cloudMinSpeed: 8.0,
          cloudMaxSpeed: 15.0,
          rainIntensity: 1.0, // Heavy rain
          rainSpeedMultiplier: 1.35,
          lightningProbability: 1.0,
        };
    }
  }

  public dispose() {
    this.ctx.rainEffect.dispose();
    this.ctx.lightningEffect.dispose();
  }
}
