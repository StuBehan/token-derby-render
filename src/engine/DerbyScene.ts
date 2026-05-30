import * as THREE from 'three';
import { Horse } from './Horse';
import { Grandstand } from './Grandstand';
import { StreetLight } from './StreetLight';
import { Bench } from './Bench';
import { TerraceHouse } from './TerraceHouse';
import { LondonSkyline } from './LondonSkyline';
import { Floodlights } from './Floodlights';
import { WeatherManager, WeatherType, RainEffect, LightningEffect } from './Weather';

type ParkPath = {
  width: number;
  depth: number;
  x: number;
  z: number;
  rotation: number;
};

const TAU = Math.PI * 2;
const TRACK_STRAIGHT_HALF_LENGTH = 31;
const TRACK_CENTER_RADIUS = 24;
const TRACK_INNER_RADIUS = 16;
const TRACK_OUTER_RADIUS = 32;
const TRACK_LANE_COUNT = 6;
const TRACK_LANE_WIDTH = (TRACK_OUTER_RADIUS - TRACK_INNER_RADIUS) / TRACK_LANE_COUNT;
const PARK_BOUNDARY_HALF_WIDTH = 126;
const PARK_BOUNDARY_HALF_DEPTH = 86;
const MAX_RENDER_PIXEL_RATIO = 1.5;
const CLOUD_DETAIL_UPDATE_INTERVAL = 0.12;
const MAX_DUST_PARTICLES = 250;
const UNIT_CLOUD_PUFF_GEOM = new THREE.DodecahedronGeometry(1.0, 0); // Shared unit dodecahedron for all cloud puffs (detail 0 for performance)
const PARK_PATHS: ParkPath[] = [
  { width: 360, depth: 6.2, x: 0, z: 60, rotation: 0.03 },
  { width: 360, depth: 5.2, x: 12, z: -70, rotation: -0.04 },
  { width: 5.8, depth: 260, x: -72, z: 0, rotation: 0.04 },
];

export class DerbyScene {
  private readonly host: HTMLElement;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true });
  private readonly clock = new THREE.Clock();
  private readonly trackCurve: THREE.CatmullRomCurve3;
  private readonly horses: Horse[] = [];
  private readonly pressedKeys = new Set<string>();
  
  // Skyline and weather components
  private skyline!: LondonSkyline;
  private floodlights!: Floodlights;
  private activeWeatherType: WeatherType = 'light_cloud';
  private weatherManager!: WeatherManager;
  private skyMesh!: THREE.Mesh;
  private timeOfDay = 12.0; // starts at noon (12:00 PM)
  public onTimeUpdate?: (time: number) => void;
  
  // Environment references used by weather system
  private skyMaterial!: THREE.ShaderMaterial;
  private ambientLight!: THREE.HemisphereLight;
  private sunLight!: THREE.DirectionalLight;
  private fog!: THREE.Fog;

  private clouds: {
    group: THREE.Group;
    speed: number;
    minX: number;
    maxX: number;
    baseY: number;
    baseScale: number;
    puffs: { mesh: THREE.Mesh; baseScale: THREE.Vector3; phase: number; speed: number; amp: number }[];
    materials: THREE.Material[];
  }[] = [];
  private dustParticles!: THREE.InstancedMesh;
  private readonly particles: {
    position: THREE.Vector3;
    velocity: THREE.Vector3;
    age: number;
    maxAge: number;
    scale: number;
  }[] = [];
  private readonly activeDustIndices: number[] = [];
  private readonly activeDustSet = new Set<number>();
  private readonly dustDummy = new THREE.Object3D();
  private readonly dustSideDir = new THREE.Vector3();
  private particleIndex = 0;
  private readonly cameraTarget = new THREE.Vector3(0, 5, 0);
  private readonly cameraBaseDirection = new THREE.Vector3();
  private readonly cameraLookDirection = new THREE.Vector3();
  private readonly cameraLookTarget = new THREE.Vector3();
  private cameraRailAngle = Math.atan2(52, -42);
  private cameraHeight = 30;
  private freeLookYaw = 0;
  private freeLookPitch = 0;
  private cloudDetailElapsed = 0;
  private isPointerLooking = false;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private readonly perfPanel = document.createElement('div');
  private perfFrameCount = 0;
  private perfElapsed = 0;
  private perfObjectCount = 0;
  private perfLightCount = 0;
  private animationFrame = 0;
  private running = true;
  private readonly resizeObserver: ResizeObserver;

  constructor(host: HTMLElement) {
    this.host = host;
    this.trackCurve = this.createTrackCurve();

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_RENDER_PIXEL_RATIO));
    this.renderer.setSize(host.clientWidth, host.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.touchAction = 'none';
    this.initPerfPanel();

    this.updateCameraRail(0);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown);
    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);
    window.addEventListener('pointercancel', this.handlePointerUp);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);

    this.buildScene();
    this.updatePerfSceneCounts();
    this.resize();
  }

  start() {
    this.clock.start();
    this.tick();
  }

  setRunning(running: boolean) {
    this.running = running;
  }

  setWeather(type: WeatherType) {
    if (!this.weatherManager) {
      this.activeWeatherType = type;
      return;
    }

    this.activeWeatherType = type;
    this.weatherManager.setWeather(type);

    // Floodlight activation is handled in the main tick loop based on weather and time of day
  }

  setTimeOfDay(time: number) {
    this.timeOfDay = time % 24.0;
    this.weatherManager?.update(0, this.timeOfDay);
  }

  reset() {
    this.running = true;
    this.horses.forEach((horse) => {
      horse.reset();
    });
  }

  dispose() {
    cancelAnimationFrame(this.animationFrame);
    this.resizeObserver.disconnect();
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    this.renderer.domElement.removeEventListener('pointerdown', this.handlePointerDown);
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
    window.removeEventListener('pointercancel', this.handlePointerUp);
    
    // Dispose of weather effects and rain/lightning resources
    if (this.weatherManager) {
      this.weatherManager.dispose();
    }

    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => material.dispose());
      }
    });
    this.renderer.dispose();
    this.perfPanel.remove();
    this.renderer.domElement.remove();
  }

  private initPerfPanel() {
    this.perfPanel.className = 'perf-panel';
    this.perfPanel.textContent = 'Perf: measuring...';
    this.host.appendChild(this.perfPanel);
  }

  private buildScene() {
    this.scene.background = new THREE.Color(0xb8c4c8);
    this.scene.fog = new THREE.Fog(0xb8c4c8, 105, 245);
    this.fog = this.scene.fog as THREE.Fog;

    this.sunLight = new THREE.DirectionalLight(0xfff6dc, 2.6);
    this.sunLight.position.set(-35, 62, 34);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.near = 1;
    this.sunLight.shadow.camera.far = 140;
    this.sunLight.shadow.camera.left = -80;
    this.sunLight.shadow.camera.right = 80;
    this.sunLight.shadow.camera.top = 80;
    this.sunLight.shadow.camera.bottom = -80;
    this.scene.add(this.sunLight);

    this.ambientLight = new THREE.HemisphereLight(0xddefff, 0x485238, 1.8);
    this.scene.add(this.ambientLight);

    this.addEnvironment();
    
    // Use modular LondonSkyline class
    this.skyline = new LondonSkyline();
    this.scene.add(this.skyline);

    this.addClouds();
    this.addGround();
    this.addLondonParkDetails();
    this.addTrack();
    this.addRails();
    this.floodlights = new Floodlights({
      trackStraightHalfLength: TRACK_STRAIGHT_HALF_LENGTH,
      trackOuterRadius: TRACK_OUTER_RADIUS,
    });
    this.scene.add(this.floodlights);
    this.scene.add(new Grandstand());
    this.addFinishLine();
    this.initDustParticles();
    this.addHorses();

    this.initWeather();
  }

  private initWeather() {
    const rain = new RainEffect(this.scene, 5000);
    const lightning = new LightningEffect(this.scene);

    const weatherContext = {
      scene: this.scene,
      skyMaterial: this.skyMaterial,
      ambientLight: this.ambientLight,
      sunLight: this.sunLight,
      fog: this.fog,
      configureClouds: this.configureClouds,
      rainEffect: rain,
      lightningEffect: lightning,
      skyMesh: this.skyMesh,
    };

    this.weatherManager = new WeatherManager(weatherContext, this.activeWeatherType);
    this.setWeather(this.activeWeatherType);
  }

  private createTrackCurve() {
    return this.createStadiumCurve(TRACK_STRAIGHT_HALF_LENGTH, TRACK_CENTER_RADIUS, 0.08, 28);
  }

  private addGround() {
    const grass = new THREE.Mesh(
      new THREE.PlaneGeometry(360, 260),
      new THREE.MeshStandardMaterial({ color: 0x4f7b3f, roughness: 0.95 }),
    );
    grass.rotation.x = -Math.PI / 2;
    grass.receiveShadow = true;
    this.scene.add(grass);

    const infield = new THREE.Mesh(
      new THREE.ShapeGeometry(this.createStadiumShape(TRACK_STRAIGHT_HALF_LENGTH, TRACK_INNER_RADIUS), 96),
      new THREE.MeshStandardMaterial({ color: 0x6d934a, roughness: 0.9 }),
    );
    infield.rotation.x = -Math.PI / 2;
    infield.position.y = 0.02;
    infield.receiveShadow = true;
    this.scene.add(infield);
  }

  private addEnvironment() {
    this.skyMaterial = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        topColor: { value: new THREE.Color(0x94aebf) },
        horizonColor: { value: new THREE.Color(0xd4d8d0) },
        nightFactor: { value: 0.0 }, // 0.0 (day) to 1.0 (night)
      },
      vertexShader: `
        varying vec3 vWorldPosition;

        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        uniform float nightFactor;
        varying vec3 vWorldPosition;

        // Simple hash to generate stars
        float hash(vec3 p) {
          p = fract(p * 0.3183099 + vec3(0.1, 0.1, 0.1));
          p *= 17.0;
          return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
        }

        void main() {
          vec3 dir = normalize(vWorldPosition);
          float heightMix = smoothstep(-24.0, 155.0, vWorldPosition.y);
          vec3 skyColor = mix(horizonColor, topColor, heightMix);
          
          if (dir.y > 0.0 && nightFactor > 0.01) {
            // Double the grid resolution (from 180.0 to 360.0) to reduce star size by 50%
            float starValue = hash(floor(dir * 360.0));
            // Adjust threshold (from 0.994 to 0.9985) to preserve overall star density
            if (starValue > 0.9985) {
              float intensity = fract(starValue * 123.4) * nightFactor;
              skyColor += vec3(intensity);
            }
          }
          
          gl_FragColor = vec4(skyColor, 1.0);
        }
      `,
    });

    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(360, 48, 24),
      this.skyMaterial,
    );
    sky.renderOrder = -10;
    this.scene.add(sky);
    this.skyMesh = sky;

    const hillMaterial = new THREE.MeshStandardMaterial({ color: 0x637854, roughness: 1 });
    const farHillMaterial = new THREE.MeshStandardMaterial({ color: 0x819071, roughness: 1 });

    for (const hill of [
      { x: -96, z: -108, width: 92, height: 15, depth: 10, color: farHillMaterial },
      { x: 8, z: -116, width: 128, height: 19, depth: 12, color: hillMaterial },
      { x: 106, z: -102, width: 78, height: 13, depth: 10, color: farHillMaterial },
      { x: -112, z: 94, width: 96, height: 12, depth: 9, color: farHillMaterial },
      { x: 80, z: 104, width: 118, height: 16, depth: 11, color: hillMaterial },
    ]) {
      const mound = new THREE.Mesh(
        new THREE.SphereGeometry(1, 24, 10),
        hill.color,
      );
      mound.scale.set(hill.width, hill.height, hill.depth);
      mound.position.set(hill.x, -3.6, hill.z);
      mound.receiveShadow = true;
      this.scene.add(mound);
    }

    const canopyMaterials = [0x2f4a2e, 0x41643a, 0x5d7446].map(
      (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.88 }),
    );
    const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x483626, roughness: 0.88 });

    const trunkMatrices: THREE.Matrix4[] = [];
    const pineMatrices: THREE.Matrix4[][] = canopyMaterials.map(() => []);
    const deciduousMatrices: THREE.Matrix4[][] = canopyMaterials.map(() => []);

    let placedTrees = 0;
    const rings = [
      { rx: 132, rz: 88, count: 90 },
      { rx: 144, rz: 98, count: 110 },
      { rx: 156, rz: 108, count: 130 },
      { rx: 168, rz: 118, count: 150 },
    ];

    for (let r = 0; r < rings.length; r++) {
      const ring = rings[r];
      for (let i = 0; i < ring.count; i++) {
        const angle = (i / ring.count) * TAU;
        // Jitter to make it organic and natural
        const jitterRadius = Math.sin(i * 2.3 + r * 7.1) * 3.5;
        const x = Math.cos(angle) * (ring.rx + jitterRadius);
        const z = Math.sin(angle) * (ring.rz + jitterRadius);

        if (this.isOnParkPath(x, z, 5.0)) {
          continue;
        }

        // Keep out of racetrack area
        if (Math.abs(x) < 95 && Math.abs(z) < 62) {
          continue;
        }

        const seedIndex = placedTrees;
        const height = 6.4 + (seedIndex % 5) * 0.75;
        const canopyRadius = 3.2 + (seedIndex % 3) * 0.42;
        const isPine = seedIndex % 3 === 0;
        const matIdx = seedIndex % canopyMaterials.length;

        // 1. Trunk Base (tapered cylinder: bottom radius 0.42, height 0.8, top radius 0.24)
        const basePos = new THREE.Vector3(x, 0.4, z);
        const baseScale = new THREE.Vector3(0.42, 0.8, 0.42);
        const baseMat = new THREE.Matrix4().compose(basePos, new THREE.Quaternion(), baseScale);
        trunkMatrices.push(baseMat);

        // 2. Main Shaft (tapered cylinder: bottom radius 0.24, height = height - 0.8, top radius ~0.14)
        const shaftHeight = height - 0.8;
        const shaftPosY = (height + 0.8) / 2 - 0.4;
        const shaftPos = new THREE.Vector3(x, shaftPosY, z);
        const shaftScale = new THREE.Vector3(0.24, shaftHeight, 0.24);
        const shaftMat = new THREE.Matrix4().compose(shaftPos, new THREE.Quaternion(), shaftScale);
        trunkMatrices.push(shaftMat);

        if (isPine) {
          const layers = 3;
          const layerSpacing = canopyRadius * 0.52;
          for (let l = 0; l < layers; l++) {
            const layerScale = 1.0 - l * 0.22;
            const layerHeight = canopyRadius * 1.1 * layerScale;
            const layerRadius = canopyRadius * layerScale;
            const yPos = height - 0.5 + l * layerSpacing;

            const layerMat = new THREE.Matrix4().compose(
              new THREE.Vector3(x, yPos, z),
              new THREE.Quaternion(),
              new THREE.Vector3(layerRadius, layerHeight, layerRadius)
            );
            pineMatrices[matIdx].push(layerMat);
          }
        } else {
          // Branch 1 (tapered cylinder: bottom radius 0.14, height 1.8, top radius 0.08)
          const b1Pos = new THREE.Vector3(x + 0.4, height - 1.2, z);
          const b1Rot = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -0.4));
          const b1Scale = new THREE.Vector3(0.14, 1.8, 0.14);
          const b1Mat = new THREE.Matrix4().compose(b1Pos, b1Rot, b1Scale);
          trunkMatrices.push(b1Mat);

          // Branch 2 (tapered cylinder: bottom radius 0.14, height 1.6, top radius 0.08)
          const b2Pos = new THREE.Vector3(x - 0.3, height - 1.3, z + 0.3);
          const b2Rot = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.3, 0, 0.4));
          const b2Scale = new THREE.Vector3(0.14, 1.6, 0.14);
          const b2Mat = new THREE.Matrix4().compose(b2Pos, b2Rot, b2Scale);
          trunkMatrices.push(b2Mat);

          // Central Canopy (dodecahedron)
          const rCentral = canopyRadius * 0.82;
          const centralMat = new THREE.Matrix4().compose(
            new THREE.Vector3(x, height, z),
            new THREE.Quaternion(),
            new THREE.Vector3(rCentral, rCentral, rCentral)
          );
          deciduousMatrices[matIdx].push(centralMat);

          // Offset Canopy 1 (dodecahedron)
          const rOffset1 = canopyRadius * 0.54;
          const offset1Mat = new THREE.Matrix4().compose(
            new THREE.Vector3(x + 0.8, height - 0.4, z),
            new THREE.Quaternion(),
            new THREE.Vector3(rOffset1, rOffset1, rOffset1)
          );
          deciduousMatrices[matIdx].push(offset1Mat);

          // Offset Canopy 2 (dodecahedron)
          const rOffset2 = canopyRadius * 0.48;
          const offset2Mat = new THREE.Matrix4().compose(
            new THREE.Vector3(x - 0.6, height - 0.6, z + 0.6),
            new THREE.Quaternion(),
            new THREE.Vector3(rOffset2, rOffset2, rOffset2)
          );
          deciduousMatrices[matIdx].push(offset2Mat);
        }

        placedTrees++;
      }
    }

    // Now instantiate all instanced meshes
    if (trunkMatrices.length > 0) {
      const trunkGeom = new THREE.CylinderGeometry(0.57, 1.0, 1.0, 5); // Tapered unit geometry
      const trunkMesh = new THREE.InstancedMesh(trunkGeom, trunkMaterial, trunkMatrices.length);
      trunkMesh.castShadow = true;
      trunkMesh.receiveShadow = true;
      trunkMatrices.forEach((m, idx) => trunkMesh.setMatrixAt(idx, m));
      this.scene.add(trunkMesh);
    }

    const pineGeom = new THREE.ConeGeometry(1.0, 1.0, 5);
    for (let m = 0; m < canopyMaterials.length; m++) {
      const matrices = pineMatrices[m];
      if (matrices.length > 0) {
        const pineMesh = new THREE.InstancedMesh(pineGeom, canopyMaterials[m], matrices.length);
        pineMesh.castShadow = true;
        matrices.forEach((mat, idx) => pineMesh.setMatrixAt(idx, mat));
        this.scene.add(pineMesh);
      }
    }

    const deciduousGeom = new THREE.DodecahedronGeometry(1.0, 0);
    for (let m = 0; m < canopyMaterials.length; m++) {
      const matrices = deciduousMatrices[m];
      if (matrices.length > 0) {
        const deciduousMesh = new THREE.InstancedMesh(deciduousGeom, canopyMaterials[m], matrices.length);
        deciduousMesh.castShadow = true;
        matrices.forEach((mat, idx) => deciduousMesh.setMatrixAt(idx, mat));
        this.scene.add(deciduousMesh);
      }
    }
  }

  private addLondonParkDetails() {
    const pathMaterial = new THREE.MeshStandardMaterial({ color: 0xc9bda5, roughness: 0.96 });
    const ironMaterial = new THREE.MeshStandardMaterial({ color: 0x111719, roughness: 0.55 });
    const stoneMaterial = new THREE.MeshStandardMaterial({ color: 0xa89478, roughness: 0.9 });
    const brickMaterials = [0x8d7462, 0x9a7d68, 0x74675d, 0x92705e].map(
      (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.86 }),
    );

    for (const path of PARK_PATHS) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(path.width, 0.05, path.depth), pathMaterial);
      mesh.position.set(path.x, 0.075, path.z);
      mesh.rotation.y = path.rotation;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    }

    this.addParkBoundaryRailings(PARK_BOUNDARY_HALF_WIDTH, PARK_BOUNDARY_HALF_DEPTH, ironMaterial);

    for (const lamp of [
      [-74, 0, 54],
      [-32, 0, 64],
      [32, 0, 64],
      [74, 0, 54],
      [-84, 0, -46],
      [84, 0, -46],
    ] as const) {
      const streetLight = new StreetLight(new THREE.Vector3(...lamp), ironMaterial);
      this.scene.add(streetLight.group);
    }

    for (const bench of [
      [-58, 0, 48, 0.12],
      [58, 0, 48, -0.12],
      [-80, 0, -38, -0.18],
      [80, 0, -38, 0.18],
    ] as const) {
      if (this.isOnParkPath(bench[0], bench[2], 3)) {
        continue;
      }

      const newBench = new Bench(new THREE.Vector3(bench[0], bench[1], bench[2]), bench[3], ironMaterial, stoneMaterial);
      this.scene.add(newBench.group);
    }

    this.addCityHorizon(brickMaterials, ironMaterial);
  }

  private addCityHorizon(brickMaterials: THREE.Material[], ironMaterial: THREE.Material) {
    const spacing = 14;
    const northZ = -PARK_BOUNDARY_HALF_DEPTH - 45;
    const southZ = PARK_BOUNDARY_HALF_DEPTH + 45;
    const westX = -PARK_BOUNDARY_HALF_WIDTH - 42;
    const eastX = PARK_BOUNDARY_HALF_WIDTH + 42;

    for (let x = -PARK_BOUNDARY_HALF_WIDTH - 34, index = 0; x <= PARK_BOUNDARY_HALF_WIDTH + 34; x += spacing, index += 1) {
      if (!this.isStreetOpening(x, northZ, 8)) {
        const house = new TerraceHouse(new THREE.Vector3(x, 0, northZ - (index % 2) * 2), {
          index,
          brickMaterials,
          rotationY: 0,
        });
        this.scene.add(house.group);
      }

      if (!this.isStreetOpening(x, southZ, 8)) {
        const house = new TerraceHouse(new THREE.Vector3(x, 0, southZ + (index % 2) * 2), {
          index: index + 30,
          brickMaterials,
          rotationY: Math.PI,
        });
        this.scene.add(house.group);
      }
    }

    for (let z = -PARK_BOUNDARY_HALF_DEPTH - 24, index = 0; z <= PARK_BOUNDARY_HALF_DEPTH + 24; z += spacing, index += 1) {
      if (!this.isStreetOpening(westX, z, 8)) {
        const house = new TerraceHouse(new THREE.Vector3(westX - (index % 2) * 2, 0, z), {
          index: index + 60,
          brickMaterials,
          rotationY: Math.PI / 2, // Rotated to face East (+X) towards the track
        });
        this.scene.add(house.group);
      }

      if (!this.isStreetOpening(eastX, z, 8)) {
        const house = new TerraceHouse(new THREE.Vector3(eastX + (index % 2) * 2, 0, z), {
          index: index + 90,
          brickMaterials,
          rotationY: -Math.PI / 2, // Rotated to face West (-X) towards the track
        });
        this.scene.add(house.group);
      }
    }

    // Place street lights in front of town houses along each edge, checking for street openings
    const streetlightSpacing = 35;

    // 1. North Edge streetlights (Z = -122)
    for (let x = -PARK_BOUNDARY_HALF_WIDTH - 25; x <= PARK_BOUNDARY_HALF_WIDTH + 25; x += streetlightSpacing) {
      if (!this.isStreetOpening(x, -122, 6)) {
        const streetLight = new StreetLight(new THREE.Vector3(x, 0, -122), ironMaterial, { castShadow: false });
        this.scene.add(streetLight.group);
      }
    }

    // 2. South Edge streetlights (Z = 122)
    for (let x = -PARK_BOUNDARY_HALF_WIDTH - 25; x <= PARK_BOUNDARY_HALF_WIDTH + 25; x += streetlightSpacing) {
      if (!this.isStreetOpening(x, 122, 6)) {
        const streetLight = new StreetLight(new THREE.Vector3(x, 0, 122), ironMaterial, { castShadow: false });
        this.scene.add(streetLight.group);
      }
    }

    // 3. West Edge streetlights (X = -158)
    for (let z = -PARK_BOUNDARY_HALF_DEPTH - 25; z <= PARK_BOUNDARY_HALF_DEPTH + 25; z += streetlightSpacing) {
      if (!this.isStreetOpening(-158, z, 6)) {
        const streetLight = new StreetLight(new THREE.Vector3(-158, 0, z), ironMaterial, { castShadow: false });
        streetLight.group.rotation.y = Math.PI / 2; // Span parallel to street
        this.scene.add(streetLight.group);
      }
    }

    // 4. East Edge streetlights (X = 158)
    for (let z = -PARK_BOUNDARY_HALF_DEPTH - 25; z <= PARK_BOUNDARY_HALF_DEPTH + 25; z += streetlightSpacing) {
      if (!this.isStreetOpening(158, z, 6)) {
        const streetLight = new StreetLight(new THREE.Vector3(158, 0, z), ironMaterial, { castShadow: false });
        streetLight.group.rotation.y = Math.PI / 2; // Span parallel to street
        this.scene.add(streetLight.group);
      }
    }
  }

  private isStreetOpening(x: number, z: number, margin: number) {
    return PARK_PATHS.some((path) => {
      if (path.width > path.depth) {
        return Math.abs(z - path.z) < path.depth / 2 + margin;
      }

      return Math.abs(x - path.x) < path.width / 2 + margin;
    });
  }

  private addParkBoundaryRailings(halfWidth: number, halfDepth: number, material: THREE.Material) {
    const sideGaps = PARK_PATHS
      .filter((path) => path.width > path.depth)
      .map((path) => ({ center: path.z, width: path.depth + 8 }));
    const endGaps = PARK_PATHS
      .filter((path) => path.depth > path.width)
      .map((path) => ({ center: path.x, width: path.width + 8 }));

    const railMatrices: THREE.Matrix4[] = [];
    const postMatrices: THREE.Matrix4[] = [];
    const postCapMatrices: THREE.Matrix4[] = [];
    const picketMatrices: THREE.Matrix4[] = [];
    const picketCapMatrices: THREE.Matrix4[] = [];

    for (const x of [-halfWidth, halfWidth]) {
      for (const segment of this.createFenceRuns(-halfDepth, halfDepth, sideGaps)) {
        this.addFenceSegment(
          new THREE.Vector3(x, 0, segment.start),
          new THREE.Vector3(x, 0, segment.end),
          railMatrices,
          postMatrices,
          postCapMatrices,
          picketMatrices,
          picketCapMatrices,
        );
      }
    }

    for (const z of [-halfDepth, halfDepth]) {
      for (const segment of this.createFenceRuns(-halfWidth, halfWidth, endGaps)) {
        this.addFenceSegment(
          new THREE.Vector3(segment.start, 0, z),
          new THREE.Vector3(segment.end, 0, z),
          railMatrices,
          postMatrices,
          postCapMatrices,
          picketMatrices,
          picketCapMatrices,
        );
      }
    }

    // Instantiate all batched components
    if (railMatrices.length > 0) {
      const railGeom = new THREE.BoxGeometry(1.0, 1.0, 1.0); // Unit geometry scaled in matrix
      const railMesh = new THREE.InstancedMesh(railGeom, material, railMatrices.length);
      railMesh.castShadow = false;
      railMatrices.forEach((m, idx) => railMesh.setMatrixAt(idx, m));
      this.scene.add(railMesh);
    }

    if (postMatrices.length > 0) {
      const postGeom = new THREE.BoxGeometry(0.14, 2.3, 0.14);
      const postMesh = new THREE.InstancedMesh(postGeom, material, postMatrices.length);
      postMesh.castShadow = false;
      postMatrices.forEach((m, idx) => postMesh.setMatrixAt(idx, m));
      this.scene.add(postMesh);
    }

    if (postCapMatrices.length > 0) {
      const postCapGeom = new THREE.ConeGeometry(0.10, 0.22, 6);
      const postCapMesh = new THREE.InstancedMesh(postCapGeom, material, postCapMatrices.length);
      postCapMesh.castShadow = false;
      postCapMatrices.forEach((m, idx) => postCapMesh.setMatrixAt(idx, m));
      this.scene.add(postCapMesh);
    }

    if (picketMatrices.length > 0) {
      const picketGeom = new THREE.BoxGeometry(0.04, 1.8, 0.04);
      const picketMesh = new THREE.InstancedMesh(picketGeom, material, picketMatrices.length);
      picketMesh.castShadow = false;
      picketMatrices.forEach((m, idx) => picketMesh.setMatrixAt(idx, m));
      this.scene.add(picketMesh);
    }

    if (picketCapMatrices.length > 0) {
      const picketCapGeom = new THREE.ConeGeometry(0.04, 0.12, 4);
      const picketCapMesh = new THREE.InstancedMesh(picketCapGeom, material, picketCapMatrices.length);
      picketCapMesh.castShadow = false;
      picketCapMatrices.forEach((m, idx) => picketCapMesh.setMatrixAt(idx, m));
      this.scene.add(picketCapMesh);
    }
  }

  private createFenceRuns(
    start: number,
    end: number,
    gaps: Array<{ center: number; width: number }>,
  ) {
    const runs: Array<{ start: number; end: number }> = [];
    let cursor = start;

    for (const gap of [...gaps].sort((a, b) => a.center - b.center)) {
      const gapStart = Math.max(start, gap.center - gap.width / 2);
      const gapEnd = Math.min(end, gap.center + gap.width / 2);

      if (gapStart > cursor) {
        runs.push({ start: cursor, end: gapStart });
      }

      cursor = Math.max(cursor, gapEnd);
    }

    if (cursor < end) {
      runs.push({ start: cursor, end });
    }

    return runs;
  }

  private isOnParkPath(x: number, z: number, margin: number) {
    return PARK_PATHS.some((path) => {
      const cos = Math.cos(-path.rotation);
      const sin = Math.sin(-path.rotation);
      const offsetX = x - path.x;
      const offsetZ = z - path.z;
      const localX = offsetX * cos - offsetZ * sin;
      const localZ = offsetX * sin + offsetZ * cos;

      return (
        Math.abs(localX) <= path.width / 2 + margin &&
        Math.abs(localZ) <= path.depth / 2 + margin
      );
    });
  }

  private addFenceSegment(
    start: THREE.Vector3,
    end: THREE.Vector3,
    railMatrices: THREE.Matrix4[],
    postMatrices: THREE.Matrix4[],
    postCapMatrices: THREE.Matrix4[],
    picketMatrices: THREE.Matrix4[],
    picketCapMatrices: THREE.Matrix4[],
  ) {
    const length = start.distanceTo(end);
    const isVerticalRun = Math.abs(start.x - end.x) < 0.01;
    const rotationY = isVerticalRun ? Math.PI / 2 : 0;
    const midpoint = start.clone().add(end).multiplyScalar(0.5);

    const cos = Math.cos(rotationY);
    const sin = Math.sin(rotationY);

    const getWorldPos = (lx: number, ly: number, lz: number) => {
      return new THREE.Vector3(
        midpoint.x + lx * cos - lz * sin,
        ly,
        midpoint.z + lx * sin + lz * cos
      );
    };

    // 1. Rails (3 rails: bottom, mid, top)
    const railHeights = [0.25, 1.1, 1.95];
    for (const y of railHeights) {
      const railPos = getWorldPos(0, y, 0);
      const railMat = new THREE.Matrix4().compose(
        railPos,
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotationY, 0)),
        new THREE.Vector3(length, 0.05, 0.08)
      );
      railMatrices.push(railMat);
    }

    // 2. Main Posts and Pickets
    const postCount = Math.max(2, Math.floor(length / 4));
    const halfLength = length / 2;

    for (let i = 0; i <= postCount; i++) {
      const postLocalX = -halfLength + (i / postCount) * length;
      
      const postPos = getWorldPos(postLocalX, 1.15, 0);
      const postMat = new THREE.Matrix4().compose(
        postPos,
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotationY, 0)),
        new THREE.Vector3(1, 1, 1)
      );
      postMatrices.push(postMat);

      const capPos = getWorldPos(postLocalX, 2.3 + 0.11, 0);
      const capMat = new THREE.Matrix4().compose(
        capPos,
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotationY, 0)),
        new THREE.Vector3(1, 1, 1)
      );
      postCapMatrices.push(capMat);

      // Render pickets between this post and the next
      if (i < postCount) {
        const nextPostLocalX = -halfLength + ((i + 1) / postCount) * length;
        const subDistance = nextPostLocalX - postLocalX;
        const picketSpacing = 0.65;
        const pickets = Math.floor(subDistance / picketSpacing) - 1;
        const actualSpacing = subDistance / (pickets + 1);

        for (let p = 1; p <= pickets; p++) {
          const picketLocalX = postLocalX + p * actualSpacing;

          const picketPos = getWorldPos(picketLocalX, 1.15, 0);
          const picketMat = new THREE.Matrix4().compose(
            picketPos,
            new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotationY, 0)),
            new THREE.Vector3(1, 1, 1)
          );
          picketMatrices.push(picketMat);

          const picketCapPos = getWorldPos(picketLocalX, 2.05 + 0.06, 0);
          const picketCapMat = new THREE.Matrix4().compose(
            picketCapPos,
            new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotationY, 0)),
            new THREE.Vector3(1, 1, 1)
          );
          picketCapMatrices.push(picketCapMat);
        }
      }
    }
  }


  private addTrack() {
    const trackShape = this.createStadiumShape(TRACK_STRAIGHT_HALF_LENGTH, TRACK_OUTER_RADIUS);

    const infieldHole = this.createStadiumPath(TRACK_STRAIGHT_HALF_LENGTH, TRACK_INNER_RADIUS, true);
    trackShape.holes.push(infieldHole);

    const track = new THREE.Mesh(
      new THREE.ShapeGeometry(trackShape, 128),
      new THREE.MeshStandardMaterial({ color: 0xa46d3f, roughness: 0.98 }),
    );
    track.rotation.x = -Math.PI / 2;
    track.position.y = 0.04;
    track.receiveShadow = true;
    this.scene.add(track);

    const laneMaterial = new THREE.MeshStandardMaterial({ color: 0xd7b285, roughness: 0.85 });
    for (let laneIndex = 1; laneIndex < TRACK_LANE_COUNT; laneIndex += 1) {
      const laneRadius = TRACK_INNER_RADIUS + TRACK_LANE_WIDTH * laneIndex;
      const laneLine = new THREE.Mesh(
        new THREE.TubeGeometry(
          this.createStadiumCurve(TRACK_STRAIGHT_HALF_LENGTH, laneRadius, 0.11, 28),
          192,
          0.035,
          6,
          true,
        ),
        laneMaterial,
      );
      laneLine.receiveShadow = true;
      this.scene.add(laneLine);
    }
  }

  private addRails() {
    const railMaterial = new THREE.MeshStandardMaterial({ color: 0xf5efe0, roughness: 0.5 });
    const railLines = [
      { radius: TRACK_INNER_RADIUS - 0.85 },
      { radius: TRACK_OUTER_RADIUS + 0.65 },
    ];

    railLines.forEach(({ radius }) => {
      for (const height of [0.82, 1.42]) {
        const rail = new THREE.Mesh(
          new THREE.TubeGeometry(
            this.createStadiumCurve(TRACK_STRAIGHT_HALF_LENGTH, radius, height, 28),
            192,
            0.09,
            8,
            true,
          ),
          railMaterial,
        );
        rail.castShadow = true;
        this.scene.add(rail);
      }
    });

    const postGeom = new THREE.CylinderGeometry(0.11, 0.14, 1.8, 8);
    const postMatrices: THREE.Matrix4[] = [];

    railLines.forEach(({ radius }) => {
      const curve = this.createStadiumCurve(TRACK_STRAIGHT_HALF_LENGTH, radius, 0.9, 28);
      for (let index = 0; index < 76; index += 1) {
        const pos = curve.getPointAt(index / 76);
        const mat = new THREE.Matrix4().makeTranslation(pos.x, pos.y, pos.z);
        postMatrices.push(mat);
      }
    });

    if (postMatrices.length > 0) {
      const instancedPosts = new THREE.InstancedMesh(postGeom, railMaterial, postMatrices.length);
      instancedPosts.castShadow = true;
      postMatrices.forEach((m, idx) => instancedPosts.setMatrixAt(idx, m));
      this.scene.add(instancedPosts);
    }
  }

  private addFinishLine() {
    // 1. Checkerboard Finish Line on Ground
    const trackWidth = TRACK_OUTER_RADIUS - TRACK_INNER_RADIUS; // 16
    const checkerCount = 16;
    const checkerWidth = trackWidth / checkerCount; // 1.0
    const checkerDepth = 0.28;
    const startZ = TRACK_INNER_RADIUS;

    const blackMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xd7ae3f, roughness: 0.35, metalness: 0.6 });
    const redMat = new THREE.MeshStandardMaterial({ color: 0xb8493b, roughness: 0.5 });
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0xa89478, roughness: 0.9 });
    const ironMat = new THREE.MeshStandardMaterial({ color: 0x111719, roughness: 0.55 });
    const bannerMat = new THREE.MeshStandardMaterial({ color: 0xf5efe0, roughness: 0.45 });

    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < checkerCount; col++) {
        const isWhite = (row + col) % 2 === 0;
        const sq = new THREE.Mesh(
          new THREE.BoxGeometry(checkerDepth, 0.05, checkerWidth),
          isWhite ? whiteMat : blackMat
        );
        const zPos = startZ + col * checkerWidth + checkerWidth / 2;
        const xPos = TRACK_STRAIGHT_HALF_LENGTH + (row - 0.5) * checkerDepth;
        sq.position.set(xPos, 0.065, zPos);
        sq.receiveShadow = true;
        this.scene.add(sq);
      }
    }

    // 2. Pillars / Posts (Truss Columns)
    for (const z of [TRACK_INNER_RADIUS - 1.1, TRACK_OUTER_RADIUS + 1.1]) {
      // Concrete Pedestal
      const pedestal = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.4, 0.8), stoneMat);
      pedestal.position.set(TRACK_STRAIGHT_HALF_LENGTH, 0.7, z);
      pedestal.castShadow = true;
      pedestal.receiveShadow = true;
      this.scene.add(pedestal);

      // Tapered Column
      const column = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 5.6, 8), ironMat);
      column.position.set(TRACK_STRAIGHT_HALF_LENGTH, 4.2, z);
      column.castShadow = true;
      this.scene.add(column);

      // Decorative Gold Rings
      for (const yRing of [2.8, 4.2, 5.6]) {
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.1, 8), goldMat);
        ring.position.set(TRACK_STRAIGHT_HALF_LENGTH, yRing, z);
        this.scene.add(ring);
      }

      // Gold Sphere Finial
      const finial = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), goldMat);
      finial.position.set(TRACK_STRAIGHT_HALF_LENGTH, 7.1, z);
      finial.castShadow = true;
      this.scene.add(finial);

      // Flag Pole
      const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 6), ironMat);
      flagPole.position.set(TRACK_STRAIGHT_HALF_LENGTH, 7.8, z);
      flagPole.castShadow = true;
      this.scene.add(flagPole);

      // Red Triangular Flag
      const flag = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.4, 0.03), redMat);
      flag.position.set(TRACK_STRAIGHT_HALF_LENGTH + 0.4, 8.2, z);
      flag.castShadow = true;
      this.scene.add(flag);
    }

    // 3. Overhead Banner
    const z1 = TRACK_INNER_RADIUS - 1.1;
    const z2 = TRACK_OUTER_RADIUS + 1.1;
    const bannerCenterZ = (z1 + z2) / 2; // 24
    const bannerWidth = z2 - z1; // 18.2 (exactly the distance between column centers)
    const boardWidth = bannerWidth - 0.8; // 17.4 (fits inside the columns)

    // Truss Frame (top and bottom horizontal rails)
    const topRail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, bannerWidth), ironMat);
    topRail.position.set(TRACK_STRAIGHT_HALF_LENGTH, 7.45, bannerCenterZ);
    topRail.castShadow = true;
    this.scene.add(topRail);

    const bottomRail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, bannerWidth), ironMat);
    bottomRail.position.set(TRACK_STRAIGHT_HALF_LENGTH, 6.15, bannerCenterZ);
    bottomRail.castShadow = true;
    this.scene.add(bottomRail);

    // Banner Board
    const banner = new THREE.Mesh(new THREE.BoxGeometry(0.28, 1.2, boardWidth), bannerMat);
    banner.position.set(TRACK_STRAIGHT_HALF_LENGTH, 6.8, bannerCenterZ);
    banner.castShadow = true;
    this.scene.add(banner);

    // Checkerboard ends of the banner board
    for (const side of [-1, 1]) {
      const endZ = bannerCenterZ + side * (boardWidth / 2 - 0.25);
      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 2; c++) {
          const isBlack = (r + c) % 2 === 0;
          const block = new THREE.Mesh(
            new THREE.BoxGeometry(0.32, 0.5, 0.5),
            isBlack ? blackMat : whiteMat
          );
          block.position.set(
            TRACK_STRAIGHT_HALF_LENGTH,
            6.8 + (r - 0.5) * 0.5,
            endZ + (c - 0.5) * 0.5
          );
          this.scene.add(block);
        }
      }
    }

    // Rosette / Crest (Center Medallion)
    const medallionRing = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.65, 0.12, 8), goldMat);
    medallionRing.position.set(TRACK_STRAIGHT_HALF_LENGTH + 0.18, 6.8, bannerCenterZ);
    medallionRing.rotation.z = Math.PI / 2;
    medallionRing.rotation.y = 0;
    medallionRing.castShadow = true;
    this.scene.add(medallionRing);

    const medallionCenter = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.16, 8), redMat);
    medallionCenter.position.set(TRACK_STRAIGHT_HALF_LENGTH + 0.20, 6.8, bannerCenterZ);
    medallionCenter.rotation.z = Math.PI / 2;
    medallionCenter.castShadow = true;
    this.scene.add(medallionCenter);
  }

  private addHorses() {
    const colors = [0x3b2217, 0x5b3522, 0xc08a52, 0x191615, 0x7b5739, 0xefe2c8];

    colors.forEach((color, index) => {
      const horse = new Horse({
        color,
        index,
        initialProgress: 0.02 - index * 0.004,
        speed: 0.018 + index * 0.0012,
        laneOffset: this.getLaneCenterRadius(index) - TRACK_CENTER_RADIUS,
      });
      this.horses.push(horse);
      this.scene.add(horse.group);
    });
  }

  private tick = () => {
    const delta = Math.min(this.clock.getDelta(), 0.033);

    // Progress time of day (1 full day-night cycle takes 120 seconds)
    if (this.running) {
      this.timeOfDay = (this.timeOfDay + (delta / 120.0) * 24.0) % 24.0;
      this.onTimeUpdate?.(this.timeOfDay);
    }

    this.updateCameraRail(delta);
    this.updateClouds(delta);
    this.weatherManager?.update(delta, this.timeOfDay);
    this.skyline.update(delta, this.running);

    // Enable floodlights automatically at night/sunset, or during rain/storm weather
    const isNightOrSunset = this.timeOfDay >= 17.0 || this.timeOfDay < 7.5;
    const lightsOn = this.activeWeatherType === 'rainy' || this.activeWeatherType === 'storm' || isNightOrSunset;
    this.floodlights?.setLightsEnabled(lightsOn);

    if (this.running) {
      this.updateHorses(delta);
      this.updateParticles(delta);
    }

    this.renderer.render(this.scene, this.camera);
    this.updatePerfPanel(delta);
    this.animationFrame = requestAnimationFrame(this.tick);
  };

  private updatePerfSceneCounts() {
    let objects = 0;
    let lights = 0;

    this.scene.traverse((object) => {
      if (!object.visible) return;
      objects += 1;
      if (object instanceof THREE.Light) {
        lights += 1;
      }
    });

    this.perfObjectCount = objects;
    this.perfLightCount = lights;
  }

  private updatePerfPanel(delta: number) {
    this.perfFrameCount += 1;
    this.perfElapsed += delta;

    if (this.perfElapsed < 0.25) return;

    this.updatePerfSceneCounts();

    const fps = Math.round(this.perfFrameCount / this.perfElapsed);
    const { render, memory } = this.renderer.info;
    this.perfPanel.innerHTML = [
      `<strong>${fps} FPS</strong>`,
      `${render.calls} calls`,
      `${render.triangles.toLocaleString()} tris`,
      `${this.perfObjectCount.toLocaleString()} objects`,
      `${this.perfLightCount} lights`,
      `${memory.geometries} geos`,
      `${memory.textures} tex`,
    ].join('<br>');

    this.perfFrameCount = 0;
    this.perfElapsed = 0;
  }

  private updateHorses(delta: number) {
    this.horses.forEach((horse) => {
      horse.update(delta, this.trackCurve);
      horse.pendingStrikes.forEach((strike) => {
        this.spawnDust(strike.position, strike.backwardDir, 3);
      });
    });
  }

  private handleKeyDown = (event: KeyboardEvent) => {
    if (
      event.key !== 'ArrowLeft' &&
      event.key !== 'ArrowRight' &&
      event.key !== 'ArrowUp' &&
      event.key !== 'ArrowDown'
    ) return;

    event.preventDefault();
    this.pressedKeys.add(event.key);
  };

  private handleKeyUp = (event: KeyboardEvent) => {
    if (
      event.key !== 'ArrowLeft' &&
      event.key !== 'ArrowRight' &&
      event.key !== 'ArrowUp' &&
      event.key !== 'ArrowDown'
    ) return;

    event.preventDefault();
    this.pressedKeys.delete(event.key);
  };

  private handlePointerDown = (event: PointerEvent) => {
    this.isPointerLooking = true;
    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;
    this.renderer.domElement.setPointerCapture(event.pointerId);
  };

  private handlePointerMove = (event: PointerEvent) => {
    if (!this.isPointerLooking) return;

    const deltaX = event.clientX - this.lastPointerX;
    const deltaY = event.clientY - this.lastPointerY;
    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;

    this.freeLookYaw -= deltaX * 0.004;
    this.freeLookPitch = THREE.MathUtils.clamp(this.freeLookPitch - deltaY * 0.003, -0.58, 0.42);
  };

  private handlePointerUp = (event: PointerEvent) => {
    this.isPointerLooking = false;

    if (this.renderer.domElement.hasPointerCapture(event.pointerId)) {
      this.renderer.domElement.releasePointerCapture(event.pointerId);
    }
  };

  private updateCameraRail(delta: number) {
    const direction =
      (this.pressedKeys.has('ArrowLeft') ? 1 : 0) -
      (this.pressedKeys.has('ArrowRight') ? 1 : 0);

    this.cameraRailAngle += direction * delta * 0.95;

    const heightDirection =
      (this.pressedKeys.has('ArrowUp') ? 1 : 0) -
      (this.pressedKeys.has('ArrowDown') ? 1 : 0);

    this.cameraHeight = THREE.MathUtils.clamp(
      this.cameraHeight + heightDirection * delta * 22,
      2,
      85
    );

    const radius = 67;
    this.camera.position.set(
      Math.cos(this.cameraRailAngle) * radius,
      this.cameraHeight,
      Math.sin(this.cameraRailAngle) * radius,
    );

    this.cameraBaseDirection.subVectors(this.cameraTarget, this.camera.position).normalize();
    const baseYaw = Math.atan2(this.cameraBaseDirection.x, this.cameraBaseDirection.z);
    const basePitch = Math.asin(this.cameraBaseDirection.y);
    const yaw = baseYaw + this.freeLookYaw;
    const pitch = THREE.MathUtils.clamp(basePitch + this.freeLookPitch, -0.82, 0.58);
    this.cameraLookDirection.set(
      Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      Math.cos(yaw) * Math.cos(pitch),
    );

    this.cameraLookTarget.copy(this.camera.position).add(this.cameraLookDirection);
    this.camera.lookAt(this.cameraLookTarget);
  }

  private getLaneCenterRadius(laneIndex: number) {
    return TRACK_INNER_RADIUS + TRACK_LANE_WIDTH * (laneIndex + 0.5);
  }

  private createStadiumShape(halfStraightLength: number, radius: number) {
    return this.createStadiumPath(halfStraightLength, radius, false) as THREE.Shape;
  }

  private createStadiumPath(halfStraightLength: number, radius: number, reverse: boolean) {
    const path = reverse ? new THREE.Path() : new THREE.Shape();

    if (reverse) {
      path.moveTo(-halfStraightLength, -radius);
      path.absarc(-halfStraightLength, 0, radius, -Math.PI / 2, Math.PI / 2, true);
      path.lineTo(halfStraightLength, radius);
      path.absarc(halfStraightLength, 0, radius, Math.PI / 2, -Math.PI / 2, true);
      path.lineTo(-halfStraightLength, -radius);
      return path;
    }

    path.moveTo(-halfStraightLength, -radius);
    path.lineTo(halfStraightLength, -radius);
    path.absarc(halfStraightLength, 0, radius, -Math.PI / 2, Math.PI / 2, false);
    path.lineTo(-halfStraightLength, radius);
    path.absarc(-halfStraightLength, 0, radius, Math.PI / 2, Math.PI * 1.5, false);
    path.lineTo(-halfStraightLength, -radius);
    return path;
  }

  private createStadiumCurve(
    halfStraightLength: number,
    radius: number,
    y: number,
    segmentCount: number,
  ) {
    const points: THREE.Vector3[] = [];

    for (let index = 0; index <= segmentCount; index += 1) {
      const t = index / segmentCount;
      points.push(new THREE.Vector3(
        -halfStraightLength + t * halfStraightLength * 2,
        y,
        -radius,
      ));
    }

    for (let index = 1; index <= segmentCount; index += 1) {
      const angle = -Math.PI / 2 + (index / segmentCount) * Math.PI;
      points.push(new THREE.Vector3(
        halfStraightLength + Math.cos(angle) * radius,
        y,
        Math.sin(angle) * radius,
      ));
    }

    for (let index = 1; index <= segmentCount; index += 1) {
      const t = index / segmentCount;
      points.push(new THREE.Vector3(
        halfStraightLength - t * halfStraightLength * 2,
        y,
        radius,
      ));
    }

    for (let index = 1; index <= segmentCount; index += 1) {
      const angle = Math.PI / 2 + (index / segmentCount) * Math.PI;
      points.push(new THREE.Vector3(
        -halfStraightLength + Math.cos(angle) * radius,
        y,
        Math.sin(angle) * radius,
      ));
    }

    return new THREE.CatmullRomCurve3(points, true, 'centripetal');
  }

  private initDustParticles() {
    const particleGeometry = new THREE.BoxGeometry(0.32, 0.32, 0.32);
    // Sand/dirt colored material, flat-shaded for low-poly feel
    const particleMaterial = new THREE.MeshStandardMaterial({
      color: 0xbfab8f,
      roughness: 0.9,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    });

    this.dustParticles = new THREE.InstancedMesh(particleGeometry, particleMaterial, MAX_DUST_PARTICLES);
    this.dustParticles.castShadow = false;
    this.scene.add(this.dustParticles);

    // Initialize the pool
    this.dustDummy.position.set(0, -999, 0);
    this.dustDummy.scale.setScalar(0);
    this.dustDummy.updateMatrix();

    for (let i = 0; i < MAX_DUST_PARTICLES; i++) {
      this.particles.push({
        position: new THREE.Vector3(0, -999, 0),
        velocity: new THREE.Vector3(0, 0, 0),
        age: 1.0,
        maxAge: 0.5,
        scale: 0,
      });
      this.dustParticles.setMatrixAt(i, this.dustDummy.matrix);
    }
    this.dustParticles.instanceMatrix.needsUpdate = true;
  }

  private spawnDust(position: THREE.Vector3, backwardDir: THREE.Vector3, count = 3) {
    for (let i = 0; i < count; i++) {
      const p = this.particles[this.particleIndex];
      p.position.set(
        position.x + (Math.random() - 0.5) * 0.15,
        position.y + Math.random() * 0.03,
        position.z + (Math.random() - 0.5) * 0.15
      );

      // Dust flies backwards along backwardDir and upwards
      const speed = 1.2 + Math.random() * 1.5;
      p.velocity.copy(backwardDir).multiplyScalar(speed);
      p.velocity.y = 0.8 + Math.random() * 1.2; // upward velocity
      
      // Add a bit of random side spread
      this.dustSideDir.set(-backwardDir.z, 0, backwardDir.x);
      p.velocity.addScaledVector(this.dustSideDir, (Math.random() - 0.5) * 0.8);

      p.age = 0;
      p.maxAge = 0.3 + Math.random() * 0.25; // 0.3 to 0.55 seconds
      p.scale = 0.5 + Math.random() * 0.5;   // random initial scale

      if (!this.activeDustSet.has(this.particleIndex)) {
        this.activeDustSet.add(this.particleIndex);
        this.activeDustIndices.push(this.particleIndex);
      }

      this.particleIndex = (this.particleIndex + 1) % MAX_DUST_PARTICLES;
    }
  }

  private updateParticles(delta: number) {
    if (!this.dustParticles) return;
    if (this.activeDustIndices.length === 0) return;

    for (let index = this.activeDustIndices.length - 1; index >= 0; index -= 1) {
      const particleIndex = this.activeDustIndices[index];
      const p = this.particles[particleIndex];

      p.age += delta;

      if (p.age >= p.maxAge) {
        this.dustDummy.position.set(0, -999, 0);
        this.dustDummy.scale.setScalar(0);
        this.dustDummy.updateMatrix();
        this.dustParticles.setMatrixAt(particleIndex, this.dustDummy.matrix);
        this.activeDustIndices.splice(index, 1);
        this.activeDustSet.delete(particleIndex);
        continue;
      }

      p.position.addScaledVector(p.velocity, delta);
      p.velocity.y -= delta * 0.8;
      p.velocity.multiplyScalar(0.93);

      const progress = p.age / p.maxAge;
      const scale = p.scale * (1.0 - progress) * (1.0 + progress * 0.5);

      this.dustDummy.position.copy(p.position);
      this.dustDummy.scale.setScalar(scale);
      this.dustDummy.updateMatrix();
      this.dustParticles.setMatrixAt(particleIndex, this.dustDummy.matrix);
    }

    this.dustParticles.instanceMatrix.needsUpdate = true;
  }



  private addClouds(count = 8, color = new THREE.Color(0xffffff), minSpeed = 3.5, maxSpeed = 8.0) {
    const minX = -195;
    const maxX = 195;

    for (let i = 0; i < count; i++) {
      const cloudGroup = new THREE.Group();

      // Individual material so we can fade them independently
      const cloudMaterial = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.95,
        metalness: 0.05,
        transparent: true,
        opacity: 0.85,
        flatShading: true,
      });

      // Distribute initial X across the sky
      const initialX = minX + (i / count) * (maxX - minX) + (Math.random() - 0.5) * 15;
      const initialZ = -150 + Math.random() * 190; // depth between -150 and 40
      const initialY = 38 + Math.random() * 20; // height between 38 and 58

      cloudGroup.position.set(initialX, initialY, initialZ);

      // Randomize overall base scale
      const baseScale = 0.8 + Math.random() * 0.7;
      cloudGroup.scale.setScalar(baseScale);

      // Generate 5-7 overlapping Dodecahedron puffs to form a low-poly cloud shape
      const puffCount = 5 + Math.floor(Math.random() * 3);
      const puffsList: { mesh: THREE.Mesh; baseScale: THREE.Vector3; phase: number; speed: number; amp: number }[] = [];

      for (let p = 0; p < puffCount; p++) {
        let size = 1.0;
        let ox = 0, oy = 0, oz = 0;

        if (p === 0) {
          // Center core
          size = 3.6;
        } else if (p === 1) {
          // Left wing
          size = 2.6;
          ox = -2.8;
          oy = -0.4;
        } else if (p === 2) {
          // Right wing
          size = 2.8;
          ox = 2.8;
          oy = -0.3;
        } else if (p === 3) {
          // Top puff
          size = 2.3;
          oy = 1.3;
        } else if (p === 4) {
          // Back puff
          size = 2.1;
          ox = 0.4;
          oy = -0.2;
          oz = -1.8;
        } else if (p === 5) {
          // Front puff
          size = 2.0;
          ox = -0.3;
          oy = -0.4;
          oz = 1.8;
        } else {
          // Random filler puff
          size = 1.5 + Math.random() * 1.2;
          ox = (Math.random() - 0.5) * 4;
          oy = (Math.random() - 0.5) * 2;
          oz = (Math.random() - 0.5) * 3;
        }

        // Add some noise to size and offsets
        const radius = size * (0.85 + Math.random() * 0.3);
        const posX = ox + (Math.random() - 0.5) * 0.5;
        const posY = oy + (Math.random() - 0.5) * 0.3;
        const posZ = oz + (Math.random() - 0.5) * 0.5;

        // Use shared unit Dodecahedron geometry scaled per puff to avoid allocating unique buffers
        const puffMesh = new THREE.Mesh(UNIT_CLOUD_PUFF_GEOM, cloudMaterial);
        puffMesh.position.set(posX, posY, posZ);
        puffMesh.scale.setScalar(radius);
        // Random orientation for variety in facets
        puffMesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
        puffMesh.castShadow = false;
        puffMesh.receiveShadow = false;

        cloudGroup.add(puffMesh);

        puffsList.push({
          mesh: puffMesh,
          baseScale: new THREE.Vector3(radius, radius, radius),
          phase: Math.random() * Math.PI * 2,
          speed: 0.5 + Math.random() * 0.8,
          amp: 0.05 + Math.random() * 0.08,
        });
      }

      this.scene.add(cloudGroup);

      this.clouds.push({
        group: cloudGroup,
        speed: minSpeed + Math.random() * (maxSpeed - minSpeed),
        minX,
        maxX,
        baseY: initialY,
        baseScale,
        puffs: puffsList,
        materials: [cloudMaterial],
      });
    }
  }

  private configureClouds = (count: number, color: THREE.Color, minSpeed: number, maxSpeed: number) => {
    if (this.clouds.length < count) {
      this.addClouds(count - this.clouds.length, color, minSpeed, maxSpeed);
    }

    this.clouds.forEach((cloud, index) => {
      const visible = index < count;
      cloud.group.visible = visible;
      cloud.speed = minSpeed + Math.random() * (maxSpeed - minSpeed);

      cloud.materials.forEach((material) => {
        if (material instanceof THREE.MeshStandardMaterial) {
          material.color.copy(color);
          material.opacity = visible ? 0.85 : 0;
        }
      });
    });
  };

  private updateClouds(delta: number) {
    const time = this.clock.getElapsedTime();

    this.clouds.forEach((cloud) => {
      if (!cloud.group.visible) return;

      // 1. Move cloud along X-axis
      cloud.group.position.x += cloud.speed * delta;

      // 2. Bob cloud group gently in Y
      cloud.group.position.y = cloud.baseY + Math.sin(time * 0.2 + cloud.puffs[0].phase) * 1.2;

      // 3. Compute fading and scaling factors based on X position relative to boundaries
      const fadeWidth = 45.0;
      let fadeFactor = 1.0;

      if (cloud.group.position.x < cloud.minX + fadeWidth) {
        fadeFactor = (cloud.group.position.x - cloud.minX) / fadeWidth;
      } else if (cloud.group.position.x > cloud.maxX - fadeWidth) {
        fadeFactor = (cloud.maxX - cloud.group.position.x) / fadeWidth;
      }

      fadeFactor = Math.max(0.0, Math.min(1.0, fadeFactor));

      // Apply opacity scaling
      cloud.materials.forEach((mat) => {
        if (mat instanceof THREE.MeshStandardMaterial) {
          mat.opacity = 0.85 * fadeFactor;
        }
      });

      // 4. Scale group down as it fades out/in, adding a gentle group-level breathing pulse (avoiding expensive individual puff CPU updates)
      const scaleFactor = 0.2 + 0.8 * fadeFactor;
      const pulse = 1.0 + Math.sin(time * 0.35 + cloud.baseY) * 0.05;
      cloud.group.scale.setScalar(cloud.baseScale * scaleFactor * pulse);

      // 5. If cloud goes past maxX, reset it to minX and randomize its parameters
      if (cloud.group.position.x > cloud.maxX) {
        cloud.group.position.x = cloud.minX;
        cloud.group.position.z = -150 + Math.random() * 190;
        cloud.baseY = 38 + Math.random() * 20;
        cloud.group.position.y = cloud.baseY;
        cloud.speed = 3.5 + Math.random() * 4.5;
        cloud.baseScale = 0.8 + Math.random() * 0.7; // Re-randomize size for variety
        cloud.puffs.forEach((p) => {
          p.phase = Math.random() * Math.PI * 2;
        });
      }
    });
  }

  private resize() {
    const width = this.host.clientWidth;
    const height = this.host.clientHeight;

    if (width === 0 || height === 0) return;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }
}
