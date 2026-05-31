import { Horse } from './Horse';
import { RequestedCameraMode, SceneCameraMode } from './CameraController';

export function getDemoCameraModeRequest(
  horses: Horse[],
  currentMode: SceneCameraMode,
  running: boolean,
  hasLiveRace: boolean,
): RequestedCameraMode | null {
  if (hasLiveRace) return null;

  const leadingProgress = getLeadingProgress(horses);

  if (currentMode === 'start_hold' && running && leadingProgress > 0.005 && leadingProgress < 0.05) {
    return 'start_follow';
  }

  if (currentMode === 'free' && leadingProgress >= 0.93 && leadingProgress < 1.0) {
    return 'finish_view';
  }

  return null;
}

function getLeadingProgress(horses: Horse[]) {
  let leadingProgress = 0;
  horses.forEach((horse) => {
    if (horse.cumulativeProgress > leadingProgress) {
      leadingProgress = horse.cumulativeProgress;
    }
  });
  return leadingProgress;
}
