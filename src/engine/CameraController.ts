import * as THREE from 'three';
import { Horse } from './Horse';

export type SceneCameraMode = 'free' | 'start_pan' | 'finish_view' | 'start_hold' | 'start_follow' | 'transitioning';
export type RequestedCameraMode = Exclude<SceneCameraMode, 'transitioning'>;
export type HorseCameraMode = 'free' | 'follow' | 'jockey';

interface CameraUpdateContext {
  horses: Horse[];
  selectedHorse: Horse | null;
  hasLiveRace: boolean;
}

const CAMERA_RAIL_RADIUS = 67;

export class CameraController {
  public selectedHorseMode: HorseCameraMode = 'free';

  private mode: SceneCameraMode = 'start_hold';
  private timer = 0;
  private railAngle = Math.atan2(52, -42);
  private height = 30;
  private freeLookYaw = 0;
  private freeLookPitch = 0;
  private readonly pressedKeys = new Set<string>();
  private readonly target = new THREE.Vector3(0, 5, 0);
  private readonly baseDirection = new THREE.Vector3();
  private readonly lookDirection = new THREE.Vector3();
  private readonly lookTarget = new THREE.Vector3();
  private readonly transStartPos = new THREE.Vector3();
  private readonly transStartLook = new THREE.Vector3();
  private readonly transEndPos = new THREE.Vector3();
  private readonly transEndLook = new THREE.Vector3();
  private transTimer = 0;
  private readonly scratchVec1 = new THREE.Vector3();
  private readonly scratchVec2 = new THREE.Vector3();
  private readonly scratchVec3 = new THREE.Vector3();
  private readonly scratchVec4 = new THREE.Vector3();

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly trackCurve: THREE.CatmullRomCurve3,
  ) {}

  get currentMode() {
    return this.mode;
  }

  get isLocked() {
    return this.mode === 'transitioning' || this.mode === 'start_pan' || this.mode === 'finish_view';
  }

  setMode(mode: RequestedCameraMode, selectedHorse: Horse | null = null) {
    if (mode === 'free') {
      this.transitionToFree(selectedHorse);
    } else {
      this.mode = mode;
      this.timer = 0.0;
    }
  }

  setHorseMode(mode: HorseCameraMode, selectedHorse: Horse | null) {
    if (this.selectedHorseMode === mode) return;
    this.selectedHorseMode = mode;
    this.transitionToFree(selectedHorse);
  }

  setSelectedHorseMode(mode: HorseCameraMode) {
    this.selectedHorseMode = mode;
  }

  handleKeyDown(key: string, selectedHorse: Horse | null) {
    if (!this.isArrowKey(key)) return false;
    if (this.mode === 'transitioning') return true;

    this.pressedKeys.add(key);
    this.requestManualControl(selectedHorse);
    return true;
  }

  handleKeyUp(key: string) {
    if (!this.isArrowKey(key)) return false;
    if (this.mode === 'transitioning') return true;

    this.pressedKeys.delete(key);
    return true;
  }

  beginPointerLook(selectedHorse: Horse | null) {
    if (this.mode === 'transitioning') return false;
    this.requestManualControl(selectedHorse);
    return true;
  }

  dragPointerLook(deltaX: number, deltaY: number, selectedHorse: Horse | null) {
    if (this.mode === 'transitioning') return false;

    if (this.requestManualControl(selectedHorse)) {
      return true;
    }

    this.freeLookYaw -= deltaX * 0.004;
    this.freeLookPitch = THREE.MathUtils.clamp(this.freeLookPitch - deltaY * 0.003, -0.58, 0.42);
    return true;
  }

  update(delta: number, context: CameraUpdateContext) {
    if (this.mode === 'transitioning') {
      this.updateTransition(delta, context.selectedHorse);
      return;
    }

    if (this.mode === 'start_hold') {
      this.timer += delta;
      const hover = Math.sin(this.timer * 0.7) * 0.3;
      this.camera.position.set(-15.0, 4.0 + hover, -10.0);
      this.camera.lookAt(this.scratchVec1.set(-31.0, 1.8, -24.0));
      return;
    }

    if (this.mode === 'start_follow') {
      this.timer += delta;
      if (this.timer > 5.0) {
        this.setMode('free', context.selectedHorse);
      } else {
        const leadingHorse = this.getLeadingHorse(context.horses);
        if (!leadingHorse) return;
        const horsePos = leadingHorse.group.position;
        this.camera.position.set(horsePos.x + 8.0, 3.5, -14.0);
        this.camera.lookAt(horsePos);
        return;
      }
    }

    if (this.mode === 'start_pan') {
      this.updateStartPan(delta);
      return;
    }

    if (this.mode === 'finish_view') {
      this.timer += delta;
      if (!context.hasLiveRace && this.timer > 6.0) {
        this.setMode('free', context.selectedHorse);
      } else {
        const driftX = Math.sin(this.timer * 0.25) * 1.2;
        const driftY = Math.cos(this.timer * 0.25) * 0.4;
        this.camera.position.set(-44.0 + driftX, 4.2 + driftY, -14.0);
        this.camera.lookAt(this.scratchVec1.set(-31.0, 1.8, -24.0));
        return;
      }
    }

    if (context.selectedHorse && this.selectedHorseMode === 'follow') {
      this.updateFollowCamera(context.selectedHorse, delta);
      return;
    }

    if (context.selectedHorse && this.selectedHorseMode === 'jockey') {
      this.updateJockeyCamera(context.selectedHorse);
      return;
    }

    this.updateFreeCamera(delta);
  }

  private requestManualControl(selectedHorse: Horse | null) {
    if (this.mode !== 'free' || (selectedHorse && this.selectedHorseMode !== 'free')) {
      this.selectedHorseMode = 'free';
      this.transitionToFree(selectedHorse);
      return true;
    }

    return false;
  }

  private transitionToFree(selectedHorse: Horse | null) {
    this.transStartPos.copy(this.camera.position);

    const dir = this.scratchVec3;
    this.camera.getWorldDirection(dir);
    this.transStartLook.copy(this.camera.position).addScaledVector(dir, 15.0);

    this.computeTransitionTarget(selectedHorse);
    this.mode = 'transitioning';
    this.transTimer = 0.0;
  }

  private updateTransition(delta: number, selectedHorse: Horse | null) {
    this.transTimer += delta;
    const t = Math.min(this.transTimer / 1.5, 1.0);
    const smoothT = t * t * (3 - 2 * t);

    if (selectedHorse && (this.selectedHorseMode === 'follow' || this.selectedHorseMode === 'jockey')) {
      this.computeTransitionTarget(selectedHorse);
    }

    const currentPos = this.scratchVec1.lerpVectors(this.transStartPos, this.transEndPos, smoothT);
    const currentLook = this.scratchVec2.lerpVectors(this.transStartLook, this.transEndLook, smoothT);

    this.camera.position.copy(currentPos);
    this.camera.lookAt(currentLook);

    if (t >= 1.0) {
      this.mode = 'free';
      this.timer = 0.0;
    }
  }

  private computeTransitionTarget(selectedHorse: Horse | null) {
    if (selectedHorse && this.selectedHorseMode === 'follow') {
      this.computeFollowTarget(selectedHorse, this.transEndPos, this.transEndLook);
      return;
    }

    if (selectedHorse && this.selectedHorseMode === 'jockey') {
      this.computeJockeyTarget(selectedHorse, this.transEndPos, this.transEndLook);
      return;
    }

    this.transEndPos.set(
      Math.cos(this.railAngle) * CAMERA_RAIL_RADIUS,
      this.height,
      Math.sin(this.railAngle) * CAMERA_RAIL_RADIUS,
    );

    this.baseDirection.subVectors(this.target, this.transEndPos).normalize();
    const baseYaw = Math.atan2(this.baseDirection.x, this.baseDirection.z);
    const basePitch = Math.asin(this.baseDirection.y);
    const yaw = baseYaw + this.freeLookYaw;
    const pitch = THREE.MathUtils.clamp(basePitch + this.freeLookPitch, -0.82, 0.58);

    this.lookDirection.set(
      Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      Math.cos(yaw) * Math.cos(pitch),
    ).normalize();

    this.transEndLook.copy(this.transEndPos).addScaledVector(this.lookDirection, 15.0);
  }

  private updateStartPan(delta: number) {
    this.timer += delta;

    if (this.timer < 4.0) {
      const p = this.timer / 4.0;
      const x = -35.0 + p * 50.0;
      this.camera.position.set(x, 7.5, -34.0);
      this.camera.lookAt(this.scratchVec1.set(-8.0, 6.0, -48.5));
    } else if (this.timer < 7.5) {
      const p = (this.timer - 4.0) / 3.5;
      const t = p * p * (3 - 2 * p);

      const startPos = this.scratchVec1.set(15.0, 7.5, -34.0);
      const endPos = this.scratchVec2.set(-15.0, 4.0, -10.0);
      const lookStart = this.scratchVec3.set(-8.0, 6.0, -48.5);
      const lookEnd = this.scratchVec4.set(-31.0, 1.8, -24.0);

      this.camera.position.lerpVectors(startPos, endPos, t);
      const currentLook = this.scratchVec3.lerpVectors(lookStart, lookEnd, t);
      this.camera.lookAt(currentLook);
    } else {
      this.setMode('start_hold');
    }
  }

  private updateFollowCamera(horse: Horse, delta: number) {
    const targetPos = this.scratchVec1;
    const lookTarget = this.scratchVec2;
    this.computeFollowTarget(horse, targetPos, lookTarget);

    this.camera.position.lerp(targetPos, delta * 12.0);
    this.camera.lookAt(lookTarget);
  }

  private updateJockeyCamera(horse: Horse) {
    const targetPos = this.scratchVec1;
    const lookTarget = this.scratchVec2;
    this.computeJockeyTarget(horse, targetPos, lookTarget);

    this.camera.position.copy(targetPos);
    this.camera.lookAt(lookTarget);
  }

  private updateFreeCamera(delta: number) {
    const direction =
      (this.pressedKeys.has('ArrowLeft') ? 1 : 0) -
      (this.pressedKeys.has('ArrowRight') ? 1 : 0);

    this.railAngle += direction * delta * 0.95;

    const heightDirection =
      (this.pressedKeys.has('ArrowUp') ? 1 : 0) -
      (this.pressedKeys.has('ArrowDown') ? 1 : 0);

    this.height = THREE.MathUtils.clamp(
      this.height + heightDirection * delta * 22,
      2,
      85,
    );

    this.camera.position.set(
      Math.cos(this.railAngle) * CAMERA_RAIL_RADIUS,
      this.height,
      Math.sin(this.railAngle) * CAMERA_RAIL_RADIUS,
    );

    this.baseDirection.subVectors(this.target, this.camera.position).normalize();
    const baseYaw = Math.atan2(this.baseDirection.x, this.baseDirection.z);
    const basePitch = Math.asin(this.baseDirection.y);
    const yaw = baseYaw + this.freeLookYaw;
    const pitch = THREE.MathUtils.clamp(basePitch + this.freeLookPitch, -0.82, 0.58);
    this.lookDirection.set(
      Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      Math.cos(yaw) * Math.cos(pitch),
    );

    this.lookTarget.copy(this.camera.position).add(this.lookDirection);
    this.camera.lookAt(this.lookTarget);
  }

  private computeFollowTarget(horse: Horse, outPosition: THREE.Vector3, outLook: THREE.Vector3) {
    const tangent = this.trackCurve.getTangentAt(horse.progress, this.scratchVec4).normalize();
    const horsePos = horse.group.position;
    outPosition.copy(horsePos).addScaledVector(tangent, -8.5);
    outPosition.y += 3.2;
    outLook.copy(horsePos);
    outLook.y += 1.3;
  }

  private computeJockeyTarget(horse: Horse, outPosition: THREE.Vector3, outLook: THREE.Vector3) {
    const tangent = this.trackCurve.getTangentAt(horse.progress, this.scratchVec4).normalize();
    const horsePos = horse.group.position;
    outPosition.copy(horsePos).addScaledVector(tangent, 0.3);
    outPosition.y += 3.25;
    outLook.copy(outPosition).addScaledVector(tangent, 15.0);
    outLook.y -= 0.55;
  }

  private getLeadingHorse(horses: Horse[]) {
    let leadingHorse = horses[0];
    if (!leadingHorse) return null;

    horses.forEach((horse) => {
      if (horse.cumulativeProgress > leadingHorse.cumulativeProgress) {
        leadingHorse = horse;
      }
    });

    return leadingHorse;
  }

  private isArrowKey(key: string) {
    return key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowDown';
  }
}
