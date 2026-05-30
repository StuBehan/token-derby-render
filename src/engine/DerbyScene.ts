import * as THREE from 'three';
import { Horse } from './Horse';
import { Grandstand } from './Grandstand';
import { StreetLight } from './StreetLight';
import { Bench } from './Bench';
import { Tree } from './Tree';
import { TerraceHouse } from './TerraceHouse';
import { LondonSkyline } from './LondonSkyline';
import { Floodlights } from './Floodlights';
import { Weather, WeatherType, LightCloudWeather, VeryCloudyWeather, RainyWeather, StormWeather } from './Weather';

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
  private londonEyeWheel?: THREE.Group;
  private londonEyeCapsules: THREE.Group[] = [];
  private activeWeatherType: WeatherType = 'light_cloud';
  private weatherEffect!: Weather;
  private weatherInstances!: Record<WeatherType, Weather>;
  
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
  private particleIndex = 0;
  private readonly cameraTarget = new THREE.Vector3(0, 5, 0);
  private cameraRailAngle = Math.atan2(52, -42);
  private cameraHeight = 30;
  private freeLookYaw = 0;
  private freeLookPitch = 0;
  private isPointerLooking = false;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private animationFrame = 0;
  private running = true;
  private readonly resizeObserver: ResizeObserver;

  constructor(host: HTMLElement) {
    this.host = host;
    this.trackCurve = this.createTrackCurve();

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(host.clientWidth, host.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.touchAction = 'none';

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
    if (!this.weatherInstances) {
      this.activeWeatherType = type;
      return;
    }

    if (this.weatherEffect) {
      this.weatherEffect.deactivate();
    }

    this.activeWeatherType = type;
    this.weatherEffect = this.weatherInstances[type];
    this.weatherEffect.activate();
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
    if (this.weatherInstances) {
      Object.values(this.weatherInstances).forEach((w) => w.dispose());
    }

    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => material.dispose());
      }
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
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
    this.scene.add(new Floodlights({
      trackStraightHalfLength: TRACK_STRAIGHT_HALF_LENGTH,
      trackOuterRadius: TRACK_OUTER_RADIUS,
    }));
    this.scene.add(new Grandstand());
    this.addFinishLine();
    this.initDustParticles();
    this.addHorses();

    this.initWeather();
  }

  private initWeather() {
    const weatherContext = {
      scene: this.scene,
      skyMaterial: this.skyMaterial,
      ambientLight: this.ambientLight,
      sunLight: this.sunLight,
      fog: this.fog,
      configureClouds: this.configureClouds,
    };

    this.weatherInstances = {
      light_cloud: new LightCloudWeather(weatherContext),
      very_cloudy: new VeryCloudyWeather(weatherContext),
      rainy: new RainyWeather(weatherContext),
      storm: new StormWeather(weatherContext),
    };

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
        varying vec3 vWorldPosition;

        void main() {
          float heightMix = smoothstep(-24.0, 155.0, vWorldPosition.y);
          gl_FragColor = vec4(mix(horizonColor, topColor, heightMix), 1.0);
        }
      `,
    });

    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(360, 48, 24),
      this.skyMaterial,
    );
    sky.renderOrder = -10;
    this.scene.add(sky);

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

    const treeLine = new THREE.Group();
    const canopyMaterials = [0x2f4a2e, 0x41643a, 0x5d7446].map(
      (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.88 }),
    );

    let placedTrees = 0;
    for (let index = 0; placedTrees < 70 && index < 160; index += 1) {
      const angle = (index / 70) * TAU;
      const radiusX = 136 + Math.sin(index * 1.9) * 8;
      const radiusZ = 92 + Math.cos(index * 1.3) * 6;
      const x = Math.cos(angle) * radiusX;
      const z = Math.sin(angle) * radiusZ;

      if (this.isOnParkPath(x, z, 5.5)) {
        continue;
      }

      const tree = new Tree(new THREE.Vector3(x, 0, z), {
        canopyMaterial: canopyMaterials[placedTrees % canopyMaterials.length],
        seedIndex: placedTrees,
      });
      treeLine.add(tree.group);
      placedTrees += 1;
    }

    this.scene.add(treeLine);
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

    this.addCityHorizon(brickMaterials);
  }

  private addCityHorizon(brickMaterials: THREE.Material[]) {
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
          rotationY: -Math.PI / 2,
        });
        this.scene.add(house.group);
      }

      if (!this.isStreetOpening(eastX, z, 8)) {
        const house = new TerraceHouse(new THREE.Vector3(eastX + (index % 2) * 2, 0, z), {
          index: index + 90,
          brickMaterials,
          rotationY: Math.PI / 2,
        });
        this.scene.add(house.group);
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

    for (const x of [-halfWidth, halfWidth]) {
      for (const segment of this.createFenceRuns(-halfDepth, halfDepth, sideGaps)) {
        this.addFenceSegment(
          new THREE.Vector3(x, 0, segment.start),
          new THREE.Vector3(x, 0, segment.end),
          material,
        );
      }
    }

    for (const z of [-halfDepth, halfDepth]) {
      for (const segment of this.createFenceRuns(-halfWidth, halfWidth, endGaps)) {
        this.addFenceSegment(
          new THREE.Vector3(segment.start, 0, z),
          new THREE.Vector3(segment.end, 0, z),
          material,
        );
      }
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

  private addFenceSegment(start: THREE.Vector3, end: THREE.Vector3, material: THREE.Material) {
    const segmentGroup = new THREE.Group();
    const length = start.distanceTo(end);
    const isVerticalRun = Math.abs(start.x - end.x) < 0.01;
    const rotationY = isVerticalRun ? Math.PI / 2 : 0;

    // 1. Rails (3 rails: bottom, mid, top)
    const railHeights = [0.25, 1.1, 1.95];
    const railGeom = new THREE.BoxGeometry(length, 0.05, 0.08);
    for (const y of railHeights) {
      const rail = new THREE.Mesh(railGeom, material);
      rail.position.set(0, y, 0);
      rail.castShadow = true;
      segmentGroup.add(rail);
    }

    // 2. Main Posts and Pickets
    const postCount = Math.max(2, Math.floor(length / 4));
    const halfLength = length / 2;
    
    const postGeom = new THREE.BoxGeometry(0.14, 2.3, 0.14);
    const postCapGeom = new THREE.ConeGeometry(0.10, 0.22, 6);

    const picketGeom = new THREE.BoxGeometry(0.04, 1.8, 0.04);
    const picketCapGeom = new THREE.ConeGeometry(0.04, 0.12, 4);

    for (let i = 0; i <= postCount; i++) {
      const postLocalX = -halfLength + (i / postCount) * length;
      
      // Render main post
      const post = new THREE.Mesh(postGeom, material);
      post.position.set(postLocalX, 1.15, 0); // Y centered at 1.15 (0 to 2.3)
      post.castShadow = true;
      segmentGroup.add(post);

      const cap = new THREE.Mesh(postCapGeom, material);
      cap.position.set(postLocalX, 2.3 + 0.11, 0);
      cap.castShadow = true;
      segmentGroup.add(cap);

      // Render pickets between this post and the next
      if (i < postCount) {
        const nextPostLocalX = -halfLength + ((i + 1) / postCount) * length;
        const subDistance = nextPostLocalX - postLocalX;
        const picketSpacing = 0.65;
        const pickets = Math.floor(subDistance / picketSpacing) - 1;
        const actualSpacing = subDistance / (pickets + 1);

        for (let p = 1; p <= pickets; p++) {
          const picketLocalX = postLocalX + p * actualSpacing;

          const picket = new THREE.Mesh(picketGeom, material);
          picket.position.set(picketLocalX, 1.15, 0); // Y centered at 1.15 (0.25 to 2.05)
          picket.castShadow = true;
          segmentGroup.add(picket);

          const picketCap = new THREE.Mesh(picketCapGeom, material);
          picketCap.position.set(picketLocalX, 2.05 + 0.06, 0);
          picketCap.castShadow = true;
          segmentGroup.add(picketCap);
        }
      }
    }

    // Position and rotate the segment group
    const midpoint = start.clone().add(end).multiplyScalar(0.5);
    segmentGroup.position.set(midpoint.x, 0, midpoint.z);
    segmentGroup.rotation.y = rotationY;
    
    this.scene.add(segmentGroup);
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

    railLines.forEach(({ radius }) => {
      const curve = this.createStadiumCurve(TRACK_STRAIGHT_HALF_LENGTH, radius, 0.9, 28);
      for (let index = 0; index < 76; index += 1) {
        const post = new THREE.Mesh(
          new THREE.CylinderGeometry(0.11, 0.14, 1.8, 8),
          railMaterial,
        );
        post.position.copy(curve.getPointAt(index / 76));
        post.castShadow = true;
        this.scene.add(post);
      }
    });
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
    const bannerCenterZ = (TRACK_OUTER_RADIUS + TRACK_INNER_RADIUS) / 2; // 24
    const bannerWidth = 22.8;

    // Truss Frame (top and bottom horizontal rails)
    const topRail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, bannerWidth + 0.4), ironMat);
    topRail.position.set(TRACK_STRAIGHT_HALF_LENGTH, 7.45, bannerCenterZ);
    topRail.castShadow = true;
    this.scene.add(topRail);

    const bottomRail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, bannerWidth + 0.4), ironMat);
    bottomRail.position.set(TRACK_STRAIGHT_HALF_LENGTH, 6.15, bannerCenterZ);
    bottomRail.castShadow = true;
    this.scene.add(bottomRail);

    // Banner Board
    const banner = new THREE.Mesh(new THREE.BoxGeometry(0.28, 1.2, bannerWidth), bannerMat);
    banner.position.set(TRACK_STRAIGHT_HALF_LENGTH, 6.8, bannerCenterZ);
    banner.castShadow = true;
    this.scene.add(banner);

    // Checkerboard ends of the banner board
    for (const side of [-1, 1]) {
      const endZ = bannerCenterZ + side * (bannerWidth / 2 - 0.8);
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

    // 4. Marker Post (indicators)
    const markerZ = TRACK_OUTER_RADIUS + 3.4;
    // Pedestal
    const markerPedestal = new THREE.Mesh(new THREE.BoxGeometry(0.65, 1.2, 0.65), stoneMat);
    markerPedestal.position.set(TRACK_STRAIGHT_HALF_LENGTH, 0.6, markerZ);
    markerPedestal.castShadow = true;
    markerPedestal.receiveShadow = true;
    this.scene.add(markerPedestal);

    // Post
    const markerPost = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 5.2, 6), ironMat);
    markerPost.position.set(TRACK_STRAIGHT_HALF_LENGTH, 3.8, markerZ);
    markerPost.castShadow = true;
    this.scene.add(markerPost);

    // Circle Indicator Board
    const boardRing = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.12, 10), goldMat);
    boardRing.position.set(TRACK_STRAIGHT_HALF_LENGTH, 6.4, markerZ);
    boardRing.rotation.z = Math.PI / 2;
    boardRing.castShadow = true;
    this.scene.add(boardRing);

    const boardCenter = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.16, 10), redMat);
    boardCenter.position.set(TRACK_STRAIGHT_HALF_LENGTH - 0.02, 6.4, markerZ);
    boardCenter.rotation.z = Math.PI / 2;
    boardCenter.castShadow = true;
    this.scene.add(boardCenter);
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

    this.updateCameraRail(delta);
    this.updateClouds(delta);
    this.weatherEffect?.update(delta);
    this.skyline.update(delta, this.running);

    if (this.running) {
      this.updateHorses(delta);
      this.updateParticles(delta);
    }

    this.renderer.render(this.scene, this.camera);
    this.animationFrame = requestAnimationFrame(this.tick);
  };

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

    const baseDirection = this.cameraTarget.clone().sub(this.camera.position).normalize();
    const baseYaw = Math.atan2(baseDirection.x, baseDirection.z);
    const basePitch = Math.asin(baseDirection.y);
    const yaw = baseYaw + this.freeLookYaw;
    const pitch = THREE.MathUtils.clamp(basePitch + this.freeLookPitch, -0.82, 0.58);
    const lookDirection = new THREE.Vector3(
      Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      Math.cos(yaw) * Math.cos(pitch),
    );

    this.camera.lookAt(this.camera.position.clone().add(lookDirection));
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
    const maxParticles = 250;
    const particleGeometry = new THREE.BoxGeometry(0.32, 0.32, 0.32);
    // Sand/dirt colored material, flat-shaded for low-poly feel
    const particleMaterial = new THREE.MeshStandardMaterial({
      color: 0xbfab8f,
      roughness: 0.9,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    });

    this.dustParticles = new THREE.InstancedMesh(particleGeometry, particleMaterial, maxParticles);
    this.dustParticles.castShadow = true;
    this.scene.add(this.dustParticles);

    // Initialize the pool
    const dummy = new THREE.Object3D();
    dummy.position.set(0, -999, 0);
    dummy.scale.setScalar(0);
    dummy.updateMatrix();

    for (let i = 0; i < maxParticles; i++) {
      this.particles.push({
        position: new THREE.Vector3(0, -999, 0),
        velocity: new THREE.Vector3(0, 0, 0),
        age: 1.0,
        maxAge: 0.5,
        scale: 0,
      });
      this.dustParticles.setMatrixAt(i, dummy.matrix);
    }
    this.dustParticles.instanceMatrix.needsUpdate = true;
  }

  private spawnDust(position: THREE.Vector3, backwardDir: THREE.Vector3, count = 3) {
    const maxParticles = 250;
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
      const sideDir = new THREE.Vector3(-backwardDir.z, 0, backwardDir.x);
      p.velocity.addScaledVector(sideDir, (Math.random() - 0.5) * 0.8);

      p.age = 0;
      p.maxAge = 0.3 + Math.random() * 0.25; // 0.3 to 0.55 seconds
      p.scale = 0.5 + Math.random() * 0.5;   // random initial scale

      this.particleIndex = (this.particleIndex + 1) % maxParticles;
    }
  }

  private updateParticles(delta: number) {
    if (!this.dustParticles) return;

    const dummy = new THREE.Object3D();
    const maxParticles = 250;

    for (let i = 0; i < maxParticles; i++) {
      const p = this.particles[i];
      if (p.age < p.maxAge) {
        // physics
        p.age += delta;
        p.position.addScaledVector(p.velocity, delta);

        // drag and gravity
        p.velocity.y -= delta * 0.8; // gravity pulls dust down slowly
        p.velocity.multiplyScalar(0.93); // general air resistance slows it down

        const progress = p.age / p.maxAge;
        // dust puffs expand slightly then shrink/fade
        const scale = p.scale * (1.0 - progress) * (1.0 + progress * 0.5);

        dummy.position.copy(p.position);
        dummy.scale.setScalar(scale);
        dummy.updateMatrix();
        this.dustParticles.setMatrixAt(i, dummy.matrix);
      } else {
        // dead particle, place out of view
        dummy.position.set(0, -999, 0);
        dummy.scale.setScalar(0);
        dummy.updateMatrix();
        this.dustParticles.setMatrixAt(i, dummy.matrix);
      }
    }

    this.dustParticles.instanceMatrix.needsUpdate = true;
  }

  private addLondonSkyline() {
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

    const skylineGroup = new THREE.Group();

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

    skylineGroup.add(bigBen);

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

    skylineGroup.add(shard);

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
    skylineGroup.add(londonEye);

    // 4. Distant classic spires/buildings (Westminster silhouette block)
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

    skylineGroup.add(westminster);

    // Add everything to scene
    this.scene.add(skylineGroup);
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

        // Use Dodecahedron for clean, low-poly facets
        const puffGeom = new THREE.DodecahedronGeometry(radius, 1);
        const puffMesh = new THREE.Mesh(puffGeom, cloudMaterial);
        puffMesh.position.set(posX, posY, posZ);
        // Random orientation for variety in facets
        puffMesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
        puffMesh.castShadow = false;
        puffMesh.receiveShadow = false;

        cloudGroup.add(puffMesh);

        puffsList.push({
          mesh: puffMesh,
          baseScale: new THREE.Vector3(1, 1, 1),
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

      // Scale group down as it fades out/in (breathing dispersing effect)
      const scaleFactor = 0.2 + 0.8 * fadeFactor;
      cloud.group.scale.setScalar(cloud.baseScale * scaleFactor);

      // 4. Animate individual puffs within the cloud (breathing/morphing effect)
      cloud.puffs.forEach((puff) => {
        const scaleMult = 1.0 + Math.sin(time * puff.speed + puff.phase) * puff.amp;
        puff.mesh.scale.copy(puff.baseScale).multiplyScalar(scaleMult);
      });

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
