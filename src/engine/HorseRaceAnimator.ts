import * as THREE from 'three';
import type { RequestedCameraMode, SceneCameraMode } from './CameraController';
import type { DustParticleSystem } from './DustParticleSystem';
import { getDemoCameraModeRequest } from './DemoRaceCameraDirector';
import type { Horse } from './Horse';
import { updateHorseLaneTargets } from './HorseLaneController';
import type { RaceSyncController } from './RaceSyncController';

interface HorseRaceAnimatorContext {
  delta: number;
  horses: Horse[];
  trackCurve: THREE.CatmullRomCurve3;
  raceSync: RaceSyncController;
  currentCameraMode: SceneCameraMode;
  running: boolean;
  dustParticles: DustParticleSystem;
  setCameraMode: (mode: RequestedCameraMode) => void;
}

export function updateRaceHorses(context: HorseRaceAnimatorContext) {
  const {
    delta,
    horses,
    trackCurve,
    raceSync,
    currentCameraMode,
    running,
    dustParticles,
    setCameraMode,
  } = context;

  raceSync.updateHorseProgress(horses, delta);
  updateHorseLaneTargets(horses, raceSync.liveRace, raceSync.totalLaps);

  const demoCameraMode = getDemoCameraModeRequest(
    horses,
    currentCameraMode,
    running,
    !!raceSync.liveRace,
  );
  if (demoCameraMode) {
    setCameraMode(demoCameraMode);
  }

  horses.forEach((horse) => {
    if (raceSync.liveRace && horse.cumulativeProgress >= raceSync.totalLaps) {
      horse.speed = 0;
    }

    horse.update(delta, trackCurve);

    if (raceSync.liveRace && horse.cumulativeProgress >= raceSync.totalLaps) {
      horse.cumulativeProgress = raceSync.totalLaps;
      horse.progress = 0;
      horse.speed = 0;
    }

    horse.pendingStrikes.forEach((strike) => {
      dustParticles.spawn(strike.position, strike.backwardDir, 3);
    });
  });
}
