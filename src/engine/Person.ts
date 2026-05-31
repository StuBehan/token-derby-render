import * as THREE from 'three';

// Shared module-level geometries to avoid duplicate GPU buffer allocations
const upperLength = 0.36;
const forearmLength = 0.33;

const torsoGeom = new THREE.BoxGeometry(0.525, 1.08, 0.54);
const headGeom = new THREE.SphereGeometry(0.345, 16, 10);
const helmetCapGeom = new THREE.SphereGeometry(0.36, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2);
const upperArmGeom = new THREE.BoxGeometry(0.165, upperLength, 0.165);
const forearmGeom = new THREE.BoxGeometry(0.135, forearmLength, 0.135);
const handGeom = new THREE.BoxGeometry(0.12, 0.12, 0.12);

// Leg geometry is translated so its origin is at the hip joint pivot
const legGeom = new THREE.BoxGeometry(0.24, 0.76, 0.24);
legGeom.translate(0, -0.38, 0);

export interface PersonConfig {
  clothColor: number;
  helmetColor: number;
}

export class Person {
  public readonly group: THREE.Group;
  private readonly torso: THREE.Mesh;
  private readonly head: THREE.Mesh;
  public readonly leftArm: THREE.Group;
  public readonly rightArm: THREE.Group;
  public readonly leftForearm: THREE.Group;
  public readonly rightForearm: THREE.Group;
  public readonly leftHand: THREE.Mesh;
  public readonly rightHand: THREE.Mesh;
  public readonly leftLeg: THREE.Mesh;
  public readonly rightLeg: THREE.Mesh;

  private readonly clothMaterial: THREE.MeshStandardMaterial;
  private readonly helmetMaterial: THREE.MeshStandardMaterial;

  constructor(config: PersonConfig) {
    this.group = new THREE.Group();

    // Create materials
    this.clothMaterial = new THREE.MeshStandardMaterial({
      color: config.clothColor,
      roughness: 0.5,
    });
    this.helmetMaterial = new THREE.MeshStandardMaterial({
      color: config.helmetColor,
      roughness: 0.55,
    });
    const clothMaterial = this.clothMaterial;
    const helmetMaterial = this.helmetMaterial;
    const skinMaterial = new THREE.MeshStandardMaterial({
      color: 0xf2d4ac,
      roughness: 0.55,
    });
    const darkMaterial = new THREE.MeshStandardMaterial({
      color: 0x222222,
      roughness: 0.8,
    });

    // Torso (waist/center of the body)
    this.torso = new THREE.Mesh(torsoGeom, clothMaterial);
    this.torso.castShadow = true;
    this.group.add(this.torso);

    // Head / Helmet (grouped under torso for easy hierarchical posing)
    this.head = new THREE.Mesh(headGeom, skinMaterial);
    this.head.position.set(0.18, 0.705, 0);
    this.head.castShadow = true;
    this.torso.add(this.head);

    // Add a helmet cap on top of head
    const helmetCap = new THREE.Mesh(helmetCapGeom, helmetMaterial);
    helmetCap.position.set(0, 0.075, 0);
    helmetCap.castShadow = true;
    this.head.add(helmetCap);

    // Left Arm Group (Shoulder pivot)
    this.leftArm = new THREE.Group();
    this.leftArm.position.set(0.15, 0.225, 0.33);
    this.torso.add(this.leftArm);

    // Left Upper Arm Mesh
    const leftUpperArmMesh = new THREE.Mesh(upperArmGeom, clothMaterial);
    leftUpperArmMesh.position.set(0, -upperLength / 2, 0);
    leftUpperArmMesh.castShadow = true;
    this.leftArm.add(leftUpperArmMesh);

    // Left Forearm Group (Elbow pivot)
    this.leftForearm = new THREE.Group();
    this.leftForearm.position.set(0, -upperLength, 0);
    this.leftArm.add(this.leftForearm);

    // Left Forearm Mesh
    const leftForearmMesh = new THREE.Mesh(forearmGeom, clothMaterial);
    leftForearmMesh.position.set(0, -forearmLength / 2, 0);
    leftForearmMesh.castShadow = true;
    this.leftForearm.add(leftForearmMesh);

    // Left Hand (skin)
    this.leftHand = new THREE.Mesh(handGeom, skinMaterial);
    this.leftHand.position.set(0, -forearmLength - 0.06, 0);
    this.leftHand.castShadow = true;
    this.leftForearm.add(this.leftHand);

    // Right Arm Group (Shoulder pivot)
    this.rightArm = new THREE.Group();
    this.rightArm.position.set(0.15, 0.225, -0.33);
    this.torso.add(this.rightArm);

    // Right Upper Arm Mesh
    const rightUpperArmMesh = new THREE.Mesh(upperArmGeom, clothMaterial);
    rightUpperArmMesh.position.set(0, -upperLength / 2, 0);
    rightUpperArmMesh.castShadow = true;
    this.rightArm.add(rightUpperArmMesh);

    // Right Forearm Group (Elbow pivot)
    this.rightForearm = new THREE.Group();
    this.rightForearm.position.set(0, -upperLength, 0);
    this.rightArm.add(this.rightForearm);

    // Right Forearm Mesh
    const rightForearmMesh = new THREE.Mesh(forearmGeom, clothMaterial);
    rightForearmMesh.position.set(0, -forearmLength / 2, 0);
    rightForearmMesh.castShadow = true;
    this.rightForearm.add(rightForearmMesh);

    // Right Hand (skin)
    this.rightHand = new THREE.Mesh(handGeom, skinMaterial);
    this.rightHand.position.set(0, -forearmLength - 0.06, 0);
    this.rightHand.castShadow = true;
    this.rightForearm.add(this.rightHand);

    // Legs (grip the horse body/saddle)
    this.leftLeg = new THREE.Mesh(legGeom, darkMaterial);
    this.leftLeg.position.set(0.12, -0.54, 0.33);
    this.leftLeg.rotation.set(0.2, 0, -0.5); // default sitting/straddle angle
    this.leftLeg.castShadow = true;
    this.torso.add(this.leftLeg);

    this.rightLeg = new THREE.Mesh(legGeom, darkMaterial);
    this.rightLeg.position.set(0.12, -0.54, -0.33);
    this.rightLeg.rotation.set(-0.2, 0, -0.5); // default sitting/straddle angle
    this.rightLeg.castShadow = true;
    this.torso.add(this.rightLeg);
  }

  /**
   * Pose the person by adjusting joint rotations.
   * @param torsoLean Torso rotation around Z axis (lean forward/backward)
   * @param headTilt Head rotation around Z axis (relative to torso)
   * @param leftArmSwing Left upper arm rotation around Z axis
   * @param rightArmSwing Right upper arm rotation around Z axis
   * @param leftElbowBend Left elbow rotation around Z axis (relative to upper arm)
   * @param rightElbowBend Right elbow rotation around Z axis (relative to upper arm)
   */
  public pose(
    torsoLean: number,
    headTilt: number = 0,
    leftArmSwing: number = -0.6,
    rightArmSwing: number = -0.6,
    leftElbowBend: number = 0,
    rightElbowBend: number = 0
  ) {
    this.torso.rotation.z = torsoLean;
    this.head.rotation.z = headTilt;
    this.leftArm.rotation.z = leftArmSwing;
    this.rightArm.rotation.z = rightArmSwing;
    this.leftForearm.rotation.z = leftElbowBend;
    this.rightForearm.rotation.z = rightElbowBend;
  }

  public updateColors(colorHex: string) {
    const col = new THREE.Color(colorHex);
    this.clothMaterial.color.copy(col);
    this.helmetMaterial.color.copy(col);
  }
}
