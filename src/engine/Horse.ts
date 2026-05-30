import * as THREE from 'three';
import { Person } from './Person';

export interface HorseConfig {
  color: number;
  index: number;
  laneOffset: number;
  initialProgress: number;
  speed: number;
}

export class Horse {
  public readonly group: THREE.Group;
  private readonly legs: THREE.Group[] = [];
  private readonly lowerLegs: THREE.Group[] = [];
  private leftRein!: THREE.Line;
  private rightRein!: THREE.Line;
  private hoverRing!: THREE.Mesh;
  public readonly index: number;
  public readonly speed: number;
  public readonly laneOffset: number;
  private readonly initialProgress: number;
  private jockey!: Person;
  private prevSwings: number[] = [0, 0, 0, 0];
  private readonly normal = new THREE.Vector3();
  private readonly hoofPos = new THREE.Vector3();
  private readonly backwardDir = new THREE.Vector3();
  private readonly leftHandWorld = new THREE.Vector3();
  private readonly rightHandWorld = new THREE.Vector3();
  private readonly leftHandLocal = new THREE.Vector3();
  private readonly rightHandLocal = new THREE.Vector3();
  private readonly leftReinPositions = new Float32Array([2.5, 2.3, 0.12, -0.15, 2.35, 0.08]);
  private readonly rightReinPositions = new Float32Array([2.5, 2.3, -0.12, -0.15, 2.35, -0.08]);
  private leftReinPositionAttribute!: THREE.BufferAttribute;
  private rightReinPositionAttribute!: THREE.BufferAttribute;
  public pendingStrikes: { position: THREE.Vector3; backwardDir: THREE.Vector3 }[] = [];

  public progress: number;
  public phase: number;

  constructor(config: HorseConfig) {
    this.index = config.index;
    this.speed = config.speed;
    this.laneOffset = config.laneOffset;
    this.initialProgress = config.initialProgress;

    this.progress = this.initialProgress;
    this.phase = this.index * 0.7;

    this.group = new THREE.Group();
    this.buildModel(config.color);
  }

  private buildModel(color: number) {
    const bodyMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.72 });
    const clothMaterial = new THREE.MeshStandardMaterial({
      color: [0xd84d38, 0x2d7dd2, 0xe7c948, 0x54a66d, 0x8b5bd6, 0xf47a30][this.index % 6],
      roughness: 0.5,
    });
    const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x16110d, roughness: 0.8 });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(3.0, 1.15, 0.6), bodyMaterial);
    body.position.y = 1.45;
    body.castShadow = true;
    this.group.add(body);

    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.72, 1.1, 0.54), bodyMaterial);
    chest.position.set(1.2, 1.55, 0);
    chest.castShadow = true;
    this.group.add(chest);

    // Front Shoulders & Rear Hips (Thighs)
    const shoulders = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.72, 0.64), bodyMaterial);
    shoulders.position.set(0.85, 1.25, 0);
    shoulders.castShadow = true;
    this.group.add(shoulders);

    const hips = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.8, 0.7), bodyMaterial);
    hips.position.set(-1.05, 1.25, 0);
    hips.castShadow = true;
    this.group.add(hips);

    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.35, 0.44), bodyMaterial);
    neck.position.set(1.55, 2.15, 0);
    neck.rotation.z = -0.45;
    neck.castShadow = true;
    this.group.add(neck);

    // Detailed Head & Muzzle
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.6, 0.4), bodyMaterial);
    head.position.set(2.0, 2.45, 0);
    head.castShadow = true;
    this.group.add(head);

    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.42, 0.32), bodyMaterial);
    snout.position.set(2.5, 2.3, 0);
    snout.castShadow = true;
    this.group.add(snout);

    const noseTip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.18), darkMaterial);
    noseTip.position.set(2.78, 2.25, 0);
    noseTip.castShadow = true;
    this.group.add(noseTip);

    // Ears
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.32, 0.14), bodyMaterial);
      ear.position.set(1.9, 2.8, side * 0.12);
      ear.rotation.z = -0.15;
      ear.castShadow = true;
      this.group.add(ear);
    }

    // Eyes
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.09), darkMaterial);
      eye.position.set(2.1, 2.5, side * 0.21);
      this.group.add(eye);
    }

    // Mane
    const mane1 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 0.18), darkMaterial);
    mane1.position.set(1.65, 2.65, 0);
    mane1.castShadow = true;
    this.group.add(mane1);

    const mane2 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.25, 0.14), darkMaterial);
    mane2.position.set(1.25, 2.15, 0);
    mane2.castShadow = true;
    this.group.add(mane2);

    // Multi-part Tail (Rotated to point backward and down to flow with the horse's motion)
    const upperTail = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.75, 0.12), darkMaterial);
    upperTail.position.set(-1.6, 1.6, 0);
    upperTail.rotation.z = -0.65; // Negative Z rotation to tilt backward
    upperTail.castShadow = true;
    this.group.add(upperTail);

    const lowerTail = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.85, 0.08), darkMaterial);
    lowerTail.position.set(-2.05, 1.0, 0); // Positioned to connect smoothly
    lowerTail.rotation.z = -0.95; // Tilts further backward
    lowerTail.castShadow = true;
    this.group.add(lowerTail);

    // Saddle Blanket
    const blanket = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.55, 0.64), whiteMat);
    blanket.position.set(-0.15, 1.7, 0);
    blanket.castShadow = true;
    this.group.add(blanket);

    // Saddle
    const saddle = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.18, 0.68), clothMaterial);
    saddle.position.set(-0.15, 2.05, 0);
    saddle.castShadow = true;
    this.group.add(saddle);

    // Jockey
    const uniformColor = [0xd84d38, 0x2d7dd2, 0xe7c948, 0x54a66d, 0x8b5bd6, 0xf47a30][this.index % 6];
    this.jockey = new Person({
      clothColor: uniformColor,
      helmetColor: uniformColor,
    });
    this.jockey.group.position.set(-0.15, 2.53, 0); // Position correctly to sit on saddle
    this.jockey.group.scale.setScalar(0.82); // Scale jockey up relative to the horse (about 100% larger in world coords)
    this.jockey.pose(-0.28, 0.15, -0.6, -0.6, 1.15, 1.15); // Arms forward, elbows bent to hold reins
    
    // Position legs to straddle the horse flanks (hugging the sides)
    this.jockey.leftLeg.position.set(0.12, -0.54, 0.45);
    this.jockey.rightLeg.position.set(0.12, -0.54, -0.45);
    this.jockey.leftLeg.rotation.set(0.18, 0, -0.5);  // Positive X tilts left leg inward to hug horse
    this.jockey.rightLeg.rotation.set(-0.18, 0, -0.5); // Negative X tilts right leg inward to hug horse

    this.group.add(this.jockey.group);

    // Legs with Hooves (jointed design)
    const legXPositions = [-1.05, -1.05, 0.85, 0.85];
    const legZPositions = [-0.22, 0.22, -0.22, 0.22];
    const isFrontLeg = [false, false, true, true];

    for (let i = 0; i < 4; i++) {
      const x = legXPositions[i];
      const z = legZPositions[i];
      const isFront = isFrontLeg[i];

      // Create a pivot group for the upper leg
      const legGroup = new THREE.Group();
      legGroup.position.set(x, 0.95, z);
      this.group.add(legGroup);

      // Upper leg (thigh / upper arm)
      const upperLength = 0.68;
      const upperWidth = isFront ? 0.24 : 0.28;
      const upperGeo = new THREE.BoxGeometry(upperWidth, upperLength, 0.22);
      const upperLeg = new THREE.Mesh(upperGeo, bodyMaterial);
      upperLeg.position.set(0, -upperLength / 2, 0);
      upperLeg.castShadow = true;
      legGroup.add(upperLeg);

      // Lower leg group/pivot at bottom of upper leg
      const lowerGroup = new THREE.Group();
      lowerGroup.position.set(0, -upperLength, 0);
      legGroup.add(lowerGroup);

      // Lower leg (shin / forearm)
      const lowerLength = 0.68;
      const lowerGeo = new THREE.BoxGeometry(0.18, lowerLength, 0.18);
      const lowerLeg = new THREE.Mesh(lowerGeo, bodyMaterial);
      lowerLeg.position.set(0, -lowerLength / 2, 0);
      lowerLeg.castShadow = true;
      lowerGroup.add(lowerLeg);

      // Hoof
      const hoofGeo = new THREE.BoxGeometry(0.24, 0.15, 0.24);
      const hoof = new THREE.Mesh(hoofGeo, darkMaterial);
      hoof.position.set(0, -lowerLength - 0.075, 0);
      hoof.castShadow = true;
      lowerGroup.add(hoof);

      // Store references to the pivots for animation
      this.legs.push(legGroup);
      this.lowerLegs.push(lowerGroup);
    }

    // Reins connecting horse snout to jockey's hands
    const reinMaterial = new THREE.LineBasicMaterial({ color: 0x221105 }); // Dark leather reins
    
    const leftReinGeo = new THREE.BufferGeometry();
    this.leftReinPositionAttribute = new THREE.BufferAttribute(this.leftReinPositions, 3);
    leftReinGeo.setAttribute('position', this.leftReinPositionAttribute);
    this.leftRein = new THREE.Line(leftReinGeo, reinMaterial);
    this.group.add(this.leftRein);

    const rightReinGeo = new THREE.BufferGeometry();
    this.rightReinPositionAttribute = new THREE.BufferAttribute(this.rightReinPositions, 3);
    rightReinGeo.setAttribute('position', this.rightReinPositionAttribute);
    this.rightRein = new THREE.Line(rightReinGeo, reinMaterial);
    this.group.add(this.rightRein);

    // Create a flat hover ring underneath the horse, matching its jersey color
    const ringColor = [0xd84d38, 0x2d7dd2, 0xe7c948, 0x54a66d, 0x8b5bd6, 0xf47a30][this.index % 6];
    const ringGeo = new THREE.RingGeometry(1.2, 1.45, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: ringColor,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    this.hoverRing = new THREE.Mesh(ringGeo, ringMat);
    this.hoverRing.position.y = 0.05; // slightly above track surface
    this.hoverRing.visible = false;
    this.group.add(this.hoverRing);

    this.group.scale.setScalar(1.05);
  }

  public reset() {
    this.progress = this.initialProgress;
    this.phase = this.index * 0.7;
    this.prevSwings = [0, 0, 0, 0];
    this.pendingStrikes.length = 0;
  }

  public update(delta: number, trackCurve: THREE.CatmullRomCurve3) {
    this.phase += delta * 12;
    this.progress += this.speed * delta;

    if (this.progress >= 1) {
      this.progress = this.progress - 1;
    }

    const position = trackCurve.getPointAt(Math.max(0, this.progress));
    const tangent = trackCurve.getTangentAt(Math.max(0, this.progress)).normalize();
    this.normal.set(-tangent.z, 0, tangent.x).normalize();
    const laneBob = Math.sin(this.phase) * 0.12;

    this.group.position.copy(position).addScaledVector(this.normal, this.laneOffset);
    this.group.position.y = 0.628 + laneBob;
    this.group.rotation.set(0, -Math.atan2(tangent.z, tangent.x), 0);

    const phaseAngle = this.phase + this.index;

    // Realistic desynchronized horse gallop gait:
    const swings = [
      Math.sin(phaseAngle) * 0.5,           // Back-Left
      Math.sin(phaseAngle - 0.5) * 0.5,     // Back-Right
      -Math.sin(phaseAngle - 0.3) * 0.5,    // Front-Left
      -Math.sin(phaseAngle - 0.8) * 0.5     // Front-Right
    ];

    this.pendingStrikes.length = 0;
    const hoofOffset = -0.68 - 0.075;

    for (let i = 0; i < 4; i++) {
      const swing = swings[i];
      // Upper leg rotates by swing
      this.legs[i].rotation.z = swing;

      // Lower leg bends at the knee/hock:
      // If swinging forward (swing > 0), the knee folds backward (negative Z rotation).
      // We use Math.max(0, swing) to only bend the joint during the forward swing,
      // and keep the leg straight during the backward push.
      this.lowerLegs[i].rotation.z = -Math.max(0, swing) * 1.5;

      // Check for strike: transition from forward (swing > 0) to backward (swing < 0)
      const prevSwing = this.prevSwings[i];
      if (swing < 0 && prevSwing >= 0) {
        this.hoofPos.set(0, hoofOffset, 0);
        this.lowerLegs[i].localToWorld(this.hoofPos);
        this.hoofPos.y = 0.04; // align with track height
        this.backwardDir.set(-tangent.x, 0, -tangent.z).normalize();
        this.pendingStrikes.push({
          position: this.hoofPos.clone(),
          backwardDir: this.backwardDir.clone(),
        });
      }
      this.prevSwings[i] = swing;
    }

    const dynamicLean = -0.28 + Math.sin(phaseAngle) * 0.08;
    // Set elbows to bent position to look like holding reins
    this.jockey.pose(
      dynamicLean,
      0.15 - Math.sin(phaseAngle) * 0.04,
      -0.6,
      -0.6,
      1.15,
      1.15
    );

    // Update reins positions dynamically to connect horse snout to jockey's hands
    this.jockey.leftHand.getWorldPosition(this.leftHandWorld);
    this.jockey.rightHand.getWorldPosition(this.rightHandWorld);

    this.leftHandLocal.copy(this.leftHandWorld);
    this.rightHandLocal.copy(this.rightHandWorld);
    this.group.worldToLocal(this.leftHandLocal);
    this.group.worldToLocal(this.rightHandLocal);

    // snout/mouth bit attachment point is around x=2.5, y=2.3, z=±0.12
    this.leftReinPositions[3] = this.leftHandLocal.x;
    this.leftReinPositions[4] = this.leftHandLocal.y;
    this.leftReinPositions[5] = this.leftHandLocal.z;
    this.leftReinPositionAttribute.needsUpdate = true;

    this.rightReinPositions[3] = this.rightHandLocal.x;
    this.rightReinPositions[4] = this.rightHandLocal.y;
    this.rightReinPositions[5] = this.rightHandLocal.z;
    this.rightReinPositionAttribute.needsUpdate = true;
  }

  public setHovered(hovered: boolean) {
    const highlightColor = new THREE.Color(0xfff5d6);
    this.hoverRing.visible = hovered;
    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh && child !== this.hoverRing) {
        const mat = child.material;
        if (mat && 'emissive' in mat) {
          if (hovered) {
            mat.emissive.copy(highlightColor);
            mat.emissiveIntensity = 0.35;
          } else {
            mat.emissive.setHex(0x000000);
            mat.emissiveIntensity = 0.0;
          }
        }
      }
    });
  }
}
