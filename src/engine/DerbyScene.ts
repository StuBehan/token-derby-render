import * as THREE from 'three';

type HorseState = {
  group: THREE.Group;
  legs: THREE.Mesh[];
  progress: number;
  speed: number;
  laneOffset: number;
  phase: number;
};

const TAU = Math.PI * 2;
const TRACK_CENTER_RADIUS_X = 46;
const TRACK_CENTER_RADIUS_Z = 24;
const TRACK_INNER_RADIUS_X = 37;
const TRACK_INNER_RADIUS_Z = 17;
const TRACK_OUTER_RADIUS_X = 56;
const TRACK_OUTER_RADIUS_Z = 32;

export class DerbyScene {
  private readonly host: HTMLElement;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true });
  private readonly clock = new THREE.Clock();
  private readonly trackCurve: THREE.CatmullRomCurve3;
  private readonly horses: HorseState[] = [];
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

    this.camera.position.set(-42, 30, 52);
    this.camera.lookAt(0, 0, 0);

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
    this.scene.background = new THREE.Color(0x89a9b8);
    this.scene.fog = new THREE.Fog(0x89a9b8, 95, 210);

    const sun = new THREE.DirectionalLight(0xfff4d2, 3.2);
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

    this.addGround();
    this.addTrack();
    this.addRails();
    this.addGrandstand();
    this.addFinishLine();
    this.addHorses();
  }

  private createTrackCurve() {
    const points: THREE.Vector3[] = [];

    for (let index = 0; index < 96; index += 1) {
      const angle = (index / 96) * TAU;
      points.push(this.ellipsePoint(TRACK_CENTER_RADIUS_X, TRACK_CENTER_RADIUS_Z, angle, 0.08));
    }

    return new THREE.CatmullRomCurve3(points, true, 'centripetal');
  }

  private addGround() {
    const grass = new THREE.Mesh(
      new THREE.PlaneGeometry(180, 120),
      new THREE.MeshStandardMaterial({ color: 0x4f7b3f, roughness: 0.95 }),
    );
    grass.rotation.x = -Math.PI / 2;
    grass.receiveShadow = true;
    this.scene.add(grass);

    const infield = new THREE.Mesh(
      new THREE.CircleGeometry(21, 96),
      new THREE.MeshStandardMaterial({ color: 0x6d934a, roughness: 0.9 }),
    );
    infield.scale.set(1.72, 1, 0.76);
    infield.rotation.x = -Math.PI / 2;
    infield.position.y = 0.02;
    infield.receiveShadow = true;
    this.scene.add(infield);
  }

  private addTrack() {
    const trackShape = new THREE.Shape();
    trackShape.absellipse(0, 0, TRACK_OUTER_RADIUS_X, TRACK_OUTER_RADIUS_Z, 0, TAU, false, 0);

    const hole = new THREE.Path();
    hole.absellipse(0, 0, TRACK_INNER_RADIUS_X, TRACK_INNER_RADIUS_Z, 0, TAU, true, 0);
    trackShape.holes.push(hole);

    const track = new THREE.Mesh(
      new THREE.ShapeGeometry(trackShape, 128),
      new THREE.MeshStandardMaterial({ color: 0xa46d3f, roughness: 0.98 }),
    );
    track.rotation.x = -Math.PI / 2;
    track.position.y = 0.04;
    track.receiveShadow = true;
    this.scene.add(track);

    const laneMaterial = new THREE.MeshStandardMaterial({ color: 0xd7b285, roughness: 0.85 });
    for (const laneRadius of [41, 45, 49, 53]) {
      const lane = new THREE.Mesh(
        new THREE.TubeGeometry(this.createEllipseCurve(laneRadius, laneRadius * 0.56, 0.11), 192, 0.035, 6, true),
        laneMaterial,
      );
      lane.receiveShadow = true;
      this.scene.add(lane);
    }
  }

  private addRails() {
    const railMaterial = new THREE.MeshStandardMaterial({ color: 0xf5efe0, roughness: 0.5 });
    const railLines = [
      { radiusX: 36.4, radiusZ: 16.6 },
      { radiusX: 56.8, radiusZ: 32.8 },
    ];

    railLines.forEach(({ radiusX, radiusZ }) => {
      for (const height of [0.82, 1.42]) {
        const rail = new THREE.Mesh(
          new THREE.TubeGeometry(this.createEllipseCurve(radiusX, radiusZ, height), 192, 0.09, 8, true),
          railMaterial,
        );
        rail.castShadow = true;
        this.scene.add(rail);
      }
    });

    for (let index = 0; index < 72; index += 1) {
      const angle = (index / 72) * TAU;
      railLines.forEach(({ radiusX, radiusZ }) => {
        const post = new THREE.Mesh(
          new THREE.CylinderGeometry(0.11, 0.14, 1.8, 8),
          railMaterial,
        );
        post.position.copy(this.ellipsePoint(radiusX, radiusZ, angle, 0.9));
        post.castShadow = true;
        this.scene.add(post);
      });
    }
  }

  private addGrandstand() {
    const baseMaterial = new THREE.MeshStandardMaterial({ color: 0x263139, roughness: 0.7 });
    const seatMaterial = new THREE.MeshStandardMaterial({ color: 0xb94f3f, roughness: 0.65 });
    const roofMaterial = new THREE.MeshStandardMaterial({ color: 0xe0d7c2, roughness: 0.52 });

    const stand = new THREE.Group();
    stand.position.set(-8, 0, -47);

    const base = new THREE.Mesh(new THREE.BoxGeometry(62, 8, 10), baseMaterial);
    base.position.y = 4;
    base.castShadow = true;
    base.receiveShadow = true;
    stand.add(base);

    for (let row = 0; row < 5; row += 1) {
      const seats = new THREE.Mesh(new THREE.BoxGeometry(58, 1.2, 1.8), seatMaterial);
      seats.position.set(0, 8.8 + row * 1.15, 3.4 - row * 1.8);
      seats.castShadow = true;
      stand.add(seats);
    }

    const roof = new THREE.Mesh(new THREE.BoxGeometry(68, 1, 18), roofMaterial);
    roof.position.set(0, 17, -1);
    roof.rotation.x = -0.12;
    roof.castShadow = true;
    stand.add(roof);

    this.scene.add(stand);
  }

  private addFinishLine() {
    const line = new THREE.Mesh(
      new THREE.BoxGeometry(TRACK_OUTER_RADIUS_X - TRACK_INNER_RADIUS_X, 0.05, 0.55),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }),
    );
    line.position.set((TRACK_OUTER_RADIUS_X + TRACK_INNER_RADIUS_X) / 2, 0.12, 0);
    line.receiveShadow = true;
    this.scene.add(line);

    const postMaterial = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 });
    const bannerMaterial = new THREE.MeshStandardMaterial({ color: 0xf5efe0, roughness: 0.45 });

    for (const x of [TRACK_INNER_RADIUS_X - 1.1, TRACK_OUTER_RADIUS_X + 1.1]) {
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 7, 0.5),
        postMaterial,
      );
      post.position.set(x, 3.5, -1.2);
      post.castShadow = true;
      this.scene.add(post);
    }

    const banner = new THREE.Mesh(
      new THREE.BoxGeometry(23, 1.05, 0.45),
      bannerMaterial,
    );
    banner.position.set((TRACK_OUTER_RADIUS_X + TRACK_INNER_RADIUS_X) / 2, 6.8, -1.2);
    banner.castShadow = true;
    this.scene.add(banner);

    const marker = new THREE.Mesh(
      new THREE.BoxGeometry(0.65, 7.8, 0.65),
      new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 }),
    );
    marker.position.set(TRACK_OUTER_RADIUS_X + 3, 3.9, 0);
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
        laneOffset: -7.2 + index * 2.9,
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

  private createEllipseCurve(radiusX: number, radiusZ: number, y: number) {
    const points: THREE.Vector3[] = [];

    for (let index = 0; index < 128; index += 1) {
      points.push(this.ellipsePoint(radiusX, radiusZ, (index / 128) * TAU, y));
    }

    return new THREE.CatmullRomCurve3(points, true, 'centripetal');
  }

  private ellipsePoint(radiusX: number, radiusZ: number, angle: number, y: number) {
    return new THREE.Vector3(Math.cos(angle) * radiusX, y, Math.sin(angle) * radiusZ);
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
