import * as THREE from 'three';

type HorseState = {
  group: THREE.Group;
  legs: THREE.Mesh[];
  progress: number;
  speed: number;
  laneOffset: number;
  phase: number;
};

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
  private readonly horses: HorseState[] = [];
  private readonly pressedKeys = new Set<string>();
  private readonly cameraTarget = new THREE.Vector3(0, 5, 0);
  private cameraRailAngle = Math.atan2(52, -42);
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

  reset() {
    this.running = true;
    this.horses.forEach((horse, index) => {
      horse.progress = 0.02 - index * 0.004;
      horse.phase = index * 0.7;
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

    const sun = new THREE.DirectionalLight(0xfff6dc, 2.6);
    sun.position.set(-35, 62, 34);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 140;
    sun.shadow.camera.left = -80;
    sun.shadow.camera.right = 80;
    sun.shadow.camera.top = 80;
    sun.shadow.camera.bottom = -80;
    this.scene.add(sun);
    this.scene.add(new THREE.HemisphereLight(0xddefff, 0x485238, 1.8));

    this.addEnvironment();
    this.addGround();
    this.addLondonParkDetails();
    this.addTrack();
    this.addRails();
    this.addGrandstand();
    this.addFinishLine();
    this.addHorses();
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
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(360, 48, 24),
      new THREE.ShaderMaterial({
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
      }),
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
    const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x6b5849, roughness: 0.92 });
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

      const height = 6.4 + (placedTrees % 5) * 0.75;

      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.46, height, 7), trunkMaterial);
      trunk.position.set(x, height / 2, z);
      trunk.castShadow = true;
      treeLine.add(trunk);

      const canopy = new THREE.Mesh(
        new THREE.SphereGeometry(3.2 + (placedTrees % 3) * 0.42, 10, 8),
        canopyMaterials[placedTrees % canopyMaterials.length],
      );
      canopy.scale.y = 0.72;
      canopy.position.set(x, height + 1.9, z);
      canopy.castShadow = true;
      treeLine.add(canopy);
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
      this.addLampPost(new THREE.Vector3(...lamp), ironMaterial);
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

      this.addBench(new THREE.Vector3(bench[0], bench[1], bench[2]), bench[3], ironMaterial, stoneMaterial);
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
        this.addTerraceHouse(new THREE.Vector3(x, 0, northZ - (index % 2) * 2), 0, index, brickMaterials);
      }

      if (!this.isStreetOpening(x, southZ, 8)) {
        this.addTerraceHouse(new THREE.Vector3(x, 0, southZ + (index % 2) * 2), Math.PI, index + 30, brickMaterials);
      }
    }

    for (let z = -PARK_BOUNDARY_HALF_DEPTH - 24, index = 0; z <= PARK_BOUNDARY_HALF_DEPTH + 24; z += spacing, index += 1) {
      if (!this.isStreetOpening(westX, z, 8)) {
        this.addTerraceHouse(new THREE.Vector3(westX - (index % 2) * 2, 0, z), -Math.PI / 2, index + 60, brickMaterials);
      }

      if (!this.isStreetOpening(eastX, z, 8)) {
        this.addTerraceHouse(new THREE.Vector3(eastX + (index % 2) * 2, 0, z), Math.PI / 2, index + 90, brickMaterials);
      }
    }
  }

  private addTerraceHouse(
    position: THREE.Vector3,
    rotationY: number,
    index: number,
    brickMaterials: THREE.Material[],
  ) {
    const house = new THREE.Group();
    const width = 11.5 + (index % 3) * 1.3;
    const height = 10.5 + (index % 4) * 1.25;
    const depth = 5.4 + (index % 2) * 0.8;
    const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), brickMaterials[index % brickMaterials.length]);
    body.position.y = height / 2;
    body.castShadow = true;
    house.add(body);

    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(width + 1.1, 1.1, depth + 0.8),
      new THREE.MeshStandardMaterial({ color: index % 3 === 0 ? 0x514a43 : 0x3f3e3b, roughness: 0.76 }),
    );
    roof.position.y = height + 0.72;
    roof.castShadow = true;
    house.add(roof);

    const door = new THREE.Mesh(
      new THREE.BoxGeometry(1.55, 2.9, 0.1),
      new THREE.MeshStandardMaterial({ color: [0x243d52, 0x4a2f2f, 0x1f4a3d][index % 3], roughness: 0.58 }),
    );
    door.position.set(0, 1.45, depth / 2 + 0.06);
    house.add(door);

    const windowMaterial = new THREE.MeshStandardMaterial({ color: 0xe5d6b9, roughness: 0.35 });
    for (const x of [-width * 0.28, width * 0.28]) {
      for (const y of [height * 0.38, height * 0.68]) {
        const window = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.55, 0.08), windowMaterial);
        window.position.set(x, y, depth / 2 + 0.07);
        house.add(window);
      }
    }

    house.position.copy(position);
    house.rotation.y = rotationY;
    this.scene.add(house);
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
    const midpoint = start.clone().add(end).multiplyScalar(0.5);
    const length = start.distanceTo(end);
    const isVerticalRun = Math.abs(start.x - end.x) < 0.01;
    const rotationY = isVerticalRun ? Math.PI / 2 : 0;

    for (const height of [1.0, 1.9]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(length, 0.11, 0.11), material);
      rail.position.set(midpoint.x, height, midpoint.z);
      rail.rotation.y = rotationY;
      rail.castShadow = true;
      this.scene.add(rail);
    }

    const postCount = Math.max(2, Math.floor(length / 4));
    for (let index = 0; index <= postCount; index += 1) {
      const t = index / postCount;
      const position = start.clone().lerp(end, t);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.4, 6), material);
      post.position.set(position.x, 1.2, position.z);
      post.castShadow = true;
      this.scene.add(post);
    }
  }

  private addLampPost(position: THREE.Vector3, material: THREE.Material) {
    const lamp = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 5.4, 10), material);
    post.position.y = 2.7;
    post.castShadow = true;
    lamp.add(post);

    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(0.95, 0.9, 0.95),
      new THREE.MeshStandardMaterial({ color: 0xf2dfaa, roughness: 0.28, emissive: 0x3a2b12, emissiveIntensity: 0.22 }),
    );
    cap.position.y = 5.75;
    cap.castShadow = true;
    lamp.add(cap);

    const top = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.52, 6), material);
    top.position.y = 6.45;
    top.castShadow = true;
    lamp.add(top);

    lamp.position.copy(position);
    this.scene.add(lamp);
  }

  private addBench(
    position: THREE.Vector3,
    rotation: number,
    ironMaterial: THREE.Material,
    woodMaterial: THREE.Material,
  ) {
    const bench = new THREE.Group();

    for (const y of [0.78, 1.15]) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.18, 0.34), woodMaterial);
      slat.position.y = y;
      slat.castShadow = true;
      bench.add(slat);
    }

    for (const x of [-2.1, 2.1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.8, 0.5), ironMaterial);
      leg.position.set(x, 0.4, 0);
      leg.castShadow = true;
      bench.add(leg);
    }

    bench.position.copy(position);
    bench.rotation.y = rotation;
    this.scene.add(bench);
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

  private addGrandstand() {
    const concreteMaterial = new THREE.MeshStandardMaterial({ color: 0x687079, roughness: 0.82 });
    const shadowMaterial = new THREE.MeshStandardMaterial({ color: 0x252b31, roughness: 0.75 });
    const aisleMaterial = new THREE.MeshStandardMaterial({ color: 0xd8d2c5, roughness: 0.62 });
    const railMaterial = new THREE.MeshStandardMaterial({ color: 0xf4ead6, roughness: 0.48 });
    const roofMaterial = new THREE.MeshStandardMaterial({ color: 0xd8d6cd, roughness: 0.42 });
    const roofTrimMaterial = new THREE.MeshStandardMaterial({ color: 0x34414a, roughness: 0.55 });
    const endCapMaterial = new THREE.MeshStandardMaterial({
      color: 0x1b2227,
      roughness: 0.76,
      side: THREE.DoubleSide,
    });
    const seatMaterials = [0xb8493b, 0x2f6f9f, 0xd7ae3f].map(
      (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.58 }),
    );
    const crowdMaterials = [0x1f4a63, 0xb94f3f, 0xd0a23b, 0x3f6a45, 0x6a4f8f, 0xd8d2c5].map(
      (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.7 }),
    );
    const skinMaterial = new THREE.MeshStandardMaterial({ color: 0xc59b74, roughness: 0.65 });

    const stand = new THREE.Group();
    stand.position.set(-8, 0, -48.5);
    stand.scale.set(0.94, 0.84, 0.94);

    const standWidth = 70.4;
    const seatRowWidth = standWidth - 0.4;

    const podium = new THREE.Mesh(new THREE.BoxGeometry(standWidth, 2.4, 13), shadowMaterial);
    podium.position.set(0, 1.2, 0);
    podium.castShadow = true;
    podium.receiveShadow = true;
    stand.add(podium);

    const rearWall = new THREE.Mesh(new THREE.BoxGeometry(standWidth, 12.5, 1.1), shadowMaterial);
    rearWall.position.set(0, 8.45, -8.6);
    rearWall.castShadow = true;
    rearWall.receiveShadow = true;
    stand.add(rearWall);

    const sideProfile = new THREE.Shape();
    sideProfile.moveTo(-4.85, 2.05);
    sideProfile.lineTo(-4.85, 5.5);
    sideProfile.lineTo(8.75, 14.55);
    sideProfile.lineTo(8.75, 2.05);
    sideProfile.lineTo(-4.85, 2.05);

    for (const x of [-35.2, 35.2]) {
      const endCap = new THREE.Mesh(new THREE.ShapeGeometry(sideProfile), endCapMaterial);
      endCap.position.set(x, 0, 0);
      endCap.rotation.y = Math.PI /2;
      endCap.castShadow = true;
      endCap.receiveShadow = true;
      stand.add(endCap);
    }

    for (const x of [-37.6, 37.6]) {
      this.addGrandstandEntryStairs(stand, x, concreteMaterial, railMaterial);
    }

    for (let row = 0; row < 7; row += 1) {
      const tierDepth = 2.15;
      const tierWidth = seatRowWidth;
      const tread = new THREE.Mesh(new THREE.BoxGeometry(tierWidth, 0.32, tierDepth), concreteMaterial);
      tread.position.set(0, 3.24 + row * 1.25, 4.9 - row * 1.85);
      tread.castShadow = true;
      tread.receiveShadow = true;
      stand.add(tread);

      const riser = new THREE.Mesh(new THREE.BoxGeometry(tierWidth, 1.18, 0.34), concreteMaterial);
      riser.position.set(0, 2.8 + row * 1.25, 5.82 - row * 1.85);
      riser.castShadow = true;
      riser.receiveShadow = true;
      stand.add(riser);

      const rowContentWidth = tierWidth - 0.4;
      const seat = new THREE.Mesh(
        new THREE.BoxGeometry(rowContentWidth, 0.48, 0.8),
        seatMaterials[row % seatMaterials.length],
      );
      seat.position.set(0, 3.66 + row * 1.25, 5.25 - row * 1.85);
      seat.castShadow = true;
      stand.add(seat);

      this.addGrandstandCrowdRow(
        stand,
        row,
        rowContentWidth,
        4.05 + row * 1.25,
        5.52 - row * 1.85,
        crowdMaterials,
        skinMaterial,
      );
    }

    for (const x of [-24, 0, 24]) {
      this.addGrandstandStairRun(stand, {
        x,
        railX: x,
        bottomZ: 7,
        width: 2.2,
        treadDepth: 1.85,
        riserHeight: 1.25,
        baseHeight: 2.1,
        targetHeight: 7.5,
        stairThickness: 0.5,
        landingDepth: 0,
        material: aisleMaterial,
        railMaterial,
        withRails: false,
      });
    }

    for (const x of [-32, -16, 16, 32]) {
      const column = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.42, 12.7, 10), shadowMaterial);
      column.position.set(x, 8.65, -6.8);
      column.castShadow = true;
      stand.add(column);
    }

    const frontWall = new THREE.Mesh(new THREE.BoxGeometry(standWidth, 2.2, 0.65), shadowMaterial);
    frontWall.position.set(0, 2.15, 7.0);
    frontWall.castShadow = true;
    frontWall.receiveShadow = true;
    stand.add(frontWall);

    const frontRail = new THREE.Mesh(new THREE.BoxGeometry(standWidth - 0.6, 0.15, 0.35), railMaterial);
    frontRail.position.set(0, 3.8, 7.0);
    frontRail.castShadow = true;
    stand.add(frontRail);

    for (const x of [-33, -16.5, 0, 16.5, 33]) {
      const railPost = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.35, 8), railMaterial);
      railPost.position.set(x, 3.2, 7.0);
      railPost.castShadow = true;
      stand.add(railPost);
    }

    const roof = new THREE.Mesh(new THREE.BoxGeometry(76, 0.85, 22), roofMaterial);
    roof.position.set(0, 14.95, -1.0);
    roof.castShadow = true;
    stand.add(roof);

    const fascia = new THREE.Mesh(new THREE.BoxGeometry(77, 1.1, 0.8), roofTrimMaterial);
    fascia.position.set(0, 14.1, 10.0);
    fascia.castShadow = true;
    stand.add(fascia);

    for (const x of [-34, -17, 0, 17, 34]) {
      const fasciaPost = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 10.7, 8), roofTrimMaterial);
      fasciaPost.position.set(x, 8.75, 7.0);
      fasciaPost.castShadow = true;
      stand.add(fasciaPost);

      const cantilever = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.24, 3.15), roofTrimMaterial);
      cantilever.position.set(x, 14.1, 8.5);
      cantilever.castShadow = true;
      stand.add(cantilever);
    }

    for (const x of [-34, 34]) {
      const roofEndCap = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.1, 22), roofTrimMaterial);
      roofEndCap.position.set(x, 14.35, -1.0);
      roofEndCap.castShadow = true;
      stand.add(roofEndCap);
    }

    this.scene.add(stand);
  }

  private addGrandstandEntryStairs(
    stand: THREE.Group,
    x: number,
    concreteMaterial: THREE.Material,
    railMaterial: THREE.Material,
  ) {
    const direction = Math.sign(x);
    const stairX = x - direction * 1.9;
    const railX = x + direction * 0.1;
    this.addGrandstandStairRun(stand, {
      x: stairX,
      railX,
      bottomZ: 12.05,
      width: 3.7,
      treadDepth: 0.82,
      riserHeight: 0.4,
      baseHeight: 0.4,
      targetHeight: 2.1,
      stairThickness: 0.3,
      landingDepth: 1.7,
      material: concreteMaterial,
      railMaterial,
      withRails: true,
    });
  }

  private addGrandstandStairRun(
    stand: THREE.Group,
    options: {
      x: number;
      railX: number;
      bottomZ: number;
      width: number;
      treadDepth: number;
      riserHeight: number;
      baseHeight: number;
      targetHeight: number;
      stairThickness: number;
      landingDepth: number;
      material: THREE.Material;
      railMaterial: THREE.Material;
      withRails: boolean;
    },
  ) {
    const {
      x,
      railX,
      bottomZ,
      width,
      treadDepth,
      riserHeight,
      baseHeight,
      targetHeight,
      stairThickness,
      landingDepth,
      material,
      railMaterial,
      withRails,
    } = options;
    const stepCount = Math.ceil(targetHeight / riserHeight);
    const actualHeight = stepCount * riserHeight;
    const topZ = bottomZ - stepCount * treadDepth;

    for (let step = 0; step < stepCount; step += 1) {
      const stepTop = (step + 1) * riserHeight;
      const stair = new THREE.Mesh(new THREE.BoxGeometry(width, stairThickness, treadDepth), material);
      stair.position.set(
        x,
        baseHeight + stepTop - stairThickness / 2,
        bottomZ - step * treadDepth - treadDepth / 2,
      );
      stair.castShadow = true;
      stair.receiveShadow = true;
      stand.add(stair);
    }

    if (landingDepth > 0) {
      const landing = new THREE.Mesh(new THREE.BoxGeometry(width, stairThickness, landingDepth), material);
      landing.position.set(x, baseHeight + actualHeight - stairThickness / 2, topZ - landingDepth / 2);
      landing.castShadow = true;
      landing.receiveShadow = true;
      stand.add(landing);
    }

    if (!withRails) {
      return;
    }

    const postHeight = riserHeight * 3;
    const railClearance = 0.25;
    const postSteps = new Set<number>([0, stepCount]);
    for (let step = 3; step < stepCount; step += 3) {
      postSteps.add(step);
    }

    const railPoints = [...postSteps].sort((a, b) => a - b).map((step) => {
      const stepHeight = step * riserHeight;
      return {
        step,
        y: baseHeight + stepHeight + railClearance + postHeight / 2,
        z: bottomZ - step * treadDepth,
      };
    });

    for (const point of railPoints) {
      const supportTop = baseHeight + Math.max(riserHeight, point.step * riserHeight) - stairThickness;
      const supportHeight = Math.max(0.25, supportTop);

      for (const supportX of [x - width * 0.34, x + width * 0.34]) {
        const support = new THREE.Mesh(new THREE.BoxGeometry(0.18, supportHeight, 0.18), railMaterial);
        support.position.set(supportX, supportHeight / 2, point.z);
        support.castShadow = true;
        stand.add(support);
      }
    }

    for (const point of railPoints) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 2.2, 8), railMaterial);
      post.scale.y = postHeight / 2.2;
      post.position.set(railX, point.y, point.z);
      post.castShadow = true;
      stand.add(post);
    }

    for (let index = 0; index < railPoints.length - 1; index += 1) {
      const start = railPoints[index];
      const end = railPoints[index + 1];
      const deltaY = end.y - start.y;
      const deltaZ = end.z - start.z;
      const length = Math.hypot(deltaY, deltaZ);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, length), railMaterial);
      rail.position.set(railX, (start.y + end.y) / 2 + postHeight / 2, (start.z + end.z) / 2);
      rail.rotation.x = Math.atan2(deltaY, -deltaZ);
      rail.castShadow = true;
      stand.add(rail);
    }
  }

  private addGrandstandCrowdRow(
    stand: THREE.Group,
    row: number,
    width: number,
    y: number,
    z: number,
    clothingMaterials: THREE.Material[],
    skinMaterial: THREE.Material,
  ) {
    const spacing = 0.9;
    const columns = Math.floor(width / spacing);
    const startX = -((columns - 1) * spacing) / 2;

    for (let column = 0; column < columns; column += 1) {
      const jitterX = (this.stableNoise(row, column, 1) - 0.5) * 0.46;
      const jitterZ = (this.stableNoise(row, column, 2) - 0.5) * 0.38;
      const x = startX + column * spacing + jitterX;

      if (Math.abs(x) < 2.2 || Math.abs(x - 24) < 2.4 || Math.abs(x + 24) < 2.4) {
        continue;
      }

      if (this.stableNoise(row, column, 3) < 0.08) {
        continue;
      }

      const spectator = new THREE.Group();
      const scale = 0.86 + this.stableNoise(row, column, 4) * 0.24;
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.74, 0.32),
        clothingMaterials[Math.floor(this.stableNoise(row, column, 5) * clothingMaterials.length)],
      );
      body.position.y = 0.41;
      body.castShadow = true;
      spectator.add(body);

      const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), skinMaterial);
      head.position.y = 0.92;
      head.castShadow = true;
      spectator.add(head);

      spectator.position.set(x, y, z + jitterZ);
      spectator.rotation.y = (this.stableNoise(row, column, 6) - 0.5) * 0.34;
      spectator.scale.setScalar(scale);
      stand.add(spectator);
    }
  }

  private stableNoise(row: number, column: number, salt: number) {
    const value = Math.sin(row * 127.1 + column * 311.7 + salt * 74.7) * 43758.5453;
    return value - Math.floor(value);
  }

  private addFinishLine() {
    const line = new THREE.Mesh(
      new THREE.BoxGeometry(TRACK_OUTER_RADIUS - TRACK_INNER_RADIUS, 0.05, 0.55),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }),
    );
    line.position.set(TRACK_STRAIGHT_HALF_LENGTH, 0.12, (TRACK_OUTER_RADIUS + TRACK_INNER_RADIUS) / 2);
    line.rotation.y = Math.PI / 2;
    line.receiveShadow = true;
    this.scene.add(line);

    const postMaterial = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 });
    const bannerMaterial = new THREE.MeshStandardMaterial({ color: 0xf5efe0, roughness: 0.45 });

    for (const z of [TRACK_INNER_RADIUS - 1.1, TRACK_OUTER_RADIUS + 1.1]) {
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 7, 0.5),
        postMaterial,
      );
      post.position.set(TRACK_STRAIGHT_HALF_LENGTH, 3.5, z);
      post.castShadow = true;
      this.scene.add(post);
    }

    const banner = new THREE.Mesh(
      new THREE.BoxGeometry(23, 1.05, 0.45),
      bannerMaterial,
    );
    banner.position.set(TRACK_STRAIGHT_HALF_LENGTH, 6.8, (TRACK_OUTER_RADIUS + TRACK_INNER_RADIUS) / 2);
    banner.rotation.y = Math.PI / 2;
    banner.castShadow = true;
    this.scene.add(banner);

    const marker = new THREE.Mesh(
      new THREE.BoxGeometry(0.65, 7.8, 0.65),
      new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 }),
    );
    marker.position.set(TRACK_STRAIGHT_HALF_LENGTH, 3.9, TRACK_OUTER_RADIUS + 3);
    marker.castShadow = true;
    this.scene.add(marker);
  }

  private addHorses() {
    const colors = [0x3b2217, 0x5b3522, 0xc08a52, 0x191615, 0x7b5739, 0xefe2c8];

    colors.forEach((color, index) => {
      const horse = this.createHorse(color, index);
      const state: HorseState = {
        group: horse.group,
        legs: horse.legs,
        progress: 0.02 - index * 0.004,
        speed: 0.018 + index * 0.0012,
        laneOffset: this.getLaneCenterRadius(index) - TRACK_CENTER_RADIUS,
        phase: index * 0.7,
      };
      this.horses.push(state);
      this.scene.add(horse.group);
    });
  }

  private createHorse(color: number, index: number) {
    const group = new THREE.Group();
    const legs: THREE.Mesh[] = [];
    const bodyMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.72 });
    const clothMaterial = new THREE.MeshStandardMaterial({
      color: [0xd84d38, 0x2d7dd2, 0xe7c948, 0x54a66d, 0x8b5bd6, 0xf47a30][index],
      roughness: 0.5,
    });
    const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x16110d, roughness: 0.8 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(2.7, 1.05, 0.82), bodyMaterial);
    body.position.y = 1.35;
    body.castShadow = true;
    group.add(body);

    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.65, 1.0, 0.76), bodyMaterial);
    chest.position.set(1.05, 1.45, 0);
    chest.castShadow = true;
    group.add(chest);

    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.1, 0.55), bodyMaterial);
    neck.position.set(1.38, 1.98, 0);
    neck.rotation.z = -0.45;
    neck.castShadow = true;
    group.add(neck);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.55, 0.5), bodyMaterial);
    head.position.set(1.9, 2.18, 0);
    head.castShadow = true;
    group.add(head);

    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.85, 0.18), darkMaterial);
    tail.position.set(-1.5, 1.38, 0);
    tail.rotation.z = 0.72;
    tail.castShadow = true;
    group.add(tail);

    const saddle = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.18, 0.9), clothMaterial);
    saddle.position.set(-0.15, 1.96, 0);
    saddle.castShadow = true;
    group.add(saddle);

    const jockey = new THREE.Group();
    const riderBody = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.72, 0.36), clothMaterial);
    riderBody.position.y = 2.55;
    riderBody.rotation.z = -0.28;
    riderBody.castShadow = true;
    jockey.add(riderBody);

    const helmet = new THREE.Mesh(
      new THREE.SphereGeometry(0.23, 16, 10),
      new THREE.MeshStandardMaterial({ color: 0xf2d4ac, roughness: 0.55 }),
    );
    helmet.position.set(0.12, 3.02, 0);
    helmet.castShadow = true;
    jockey.add(helmet);
    group.add(jockey);

    for (const x of [-0.95, 0.75]) {
      for (const z of [-0.3, 0.3]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.35, 0.18), darkMaterial);
        leg.position.set(x, 0.58, z);
        leg.castShadow = true;
        group.add(leg);
        legs.push(leg);
      }
    }

    group.scale.setScalar(0.9);
    return { group, legs };
  }

  private tick = () => {
    const delta = Math.min(this.clock.getDelta(), 0.033);

    this.updateCameraRail(delta);

    if (this.running) {
      this.updateHorses(delta);
    }

    this.renderer.render(this.scene, this.camera);
    this.animationFrame = requestAnimationFrame(this.tick);
  };

  private updateHorses(delta: number) {
    this.horses.forEach((horse, index) => {
      horse.phase += delta * 12;
      horse.progress += horse.speed * delta;

      if (horse.progress >= 1) {
        horse.progress = horse.progress - 1;
      }

      const position = this.trackCurve.getPointAt(Math.max(0, horse.progress));
      const tangent = this.trackCurve.getTangentAt(Math.max(0, horse.progress)).normalize();
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
      const laneBob = Math.sin(horse.phase) * 0.12;

      horse.group.position.copy(position).addScaledVector(normal, horse.laneOffset);
      horse.group.position.y = 0.34 + laneBob;
      horse.group.rotation.set(0, -Math.atan2(tangent.z, tangent.x), 0);

      const stride = Math.sin(horse.phase + index);
      horse.legs.forEach((leg, legIndex) => {
        leg.rotation.z = stride * (legIndex % 2 === 0 ? 0.34 : -0.34);
      });
    });
  }

  private handleKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;

    event.preventDefault();
    this.pressedKeys.add(event.key);
  };

  private handleKeyUp = (event: KeyboardEvent) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;

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

    const radius = 67;
    const height = 30;
    this.camera.position.set(
      Math.cos(this.cameraRailAngle) * radius,
      height,
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

  private resize() {
    const width = this.host.clientWidth;
    const height = this.host.clientHeight;

    if (width === 0 || height === 0) return;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }
}
