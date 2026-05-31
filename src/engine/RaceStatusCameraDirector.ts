import type { RequestedCameraMode, SceneCameraMode } from './CameraController';
import type { RaceView } from './RaceClient';

export class RaceStatusCameraDirector {
  private previousStatus = '';

  reset() {
    this.previousStatus = '';
  }

  getModeForRaceUpdate(race: RaceView, currentMode: SceneCameraMode): RequestedCameraMode | null {
    const statusChanged = this.previousStatus !== race.status;
    this.previousStatus = race.status;

    if (!statusChanged) return null;

    if (race.status === 'pending') return 'start_pan';
    if (race.status === 'finished') return 'finish_view';

    if (race.status === 'live') {
      if (currentMode === 'start_hold' || currentMode === 'start_pan') {
        return 'start_follow';
      }
      return 'free';
    }

    return null;
  }
}
