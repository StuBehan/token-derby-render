import * as THREE from 'three';
import { Horse } from './Horse';
import { HorseView, RaceView } from './RaceClient';
import { getLaneCenterOffset, getDynamicLaneOffset } from './TrackLayout';

const TOTAL_LAPS = 5;

export class RaceSyncController {
  private race: RaceView | null = null;
  private serverTimeOffset = 0;
  private startTime = 0;
  private endTime = 0;

  get liveRace() {
    return this.race;
  }

  get totalLaps() {
    return TOTAL_LAPS;
  }

  setRace(race: RaceView) {
    this.race = race;
    this.startTime = Date.parse(race.start_time);
    this.endTime = Date.parse(race.end_time);
    this.serverTimeOffset = Date.parse(race.server_time) - Date.now();
  }

  clearRace() {
    this.race = null;
    this.serverTimeOffset = 0;
    this.startTime = 0;
    this.endTime = 0;
  }

  syncHorses(
    horses: Horse[],
    scene: THREE.Scene,
    apiHorses: HorseView[],
    clearHorses: () => void,
  ) {
    const needsRecreate =
      horses.length !== apiHorses.length ||
      horses.some((horse, index) => horse.name !== apiHorses[index].name);

    if (needsRecreate) {
      clearHorses();

      const leaderTokens = this.getLeaderTokens(apiHorses);
      const elapsed = this.getElapsedRaceRatio();

      apiHorses.forEach((apiHorse, index) => {
        const horse = new Horse({
          color: 0x3b2217,
          index,
          initialProgress: this.getInitialProgress(apiHorse, leaderTokens, elapsed),
          speed: 0,
          laneOffset: getDynamicLaneOffset(index, apiHorses.length),
          name: apiHorse.name,
          colors: apiHorse.colors,
        });
        horses.push(horse);
        scene.add(horse.group);
      });
    } else {
      apiHorses.forEach((apiHorse, index) => {
        const horse = horses[index];
        horse.name = apiHorse.name;
        horse.updateColors(apiHorse.colors);
      });
    }
  }

  updateHorseProgress(horses: Horse[], delta: number) {
    const race = this.race;
    if (!race) return;

    const elapsed = this.getElapsedRaceRatio();
    const leaderTokens = this.getLeaderTokens(race.horses);

    horses.forEach((horse, index) => {
      const apiHorse = race.horses[index];
      if (!apiHorse) return;

      const lastHeartbeatMs = Date.parse(apiHorse.last_heartbeat);
      const serverTimeMs = Date.parse(race.server_time);
      const isInactive = race.status !== 'finished' && (serverTimeMs - lastHeartbeatMs) > 75000;

      // Update horse's eating grass state
      horse.isEatingGrass = isInactive;

      let targetProgress = isInactive
        ? horse.cumulativeProgress
        : this.getInitialProgress(apiHorse, leaderTokens, elapsed);

      if (race.status === 'live' && !isInactive) {
        targetProgress = Math.max(horse.cumulativeProgress, targetProgress);
      }

      const diff = targetProgress - horse.cumulativeProgress;

      if (diff < 0) {
        horse.cumulativeProgress = targetProgress;
        horse.progress = targetProgress % 1.0;
        horse.speed = 0;
        return;
      }

      // Handle super high token per minute counts by capping the speed at a comfortable/natural rate.
      // Under normal circumstances, cap speed to a natural limit (e.g., 0.038).
      // However, if the race is live and the timer is running out, we dynamically increase
      // the speed cap up to an absolute limit (e.g., 0.055) so the horse can catch up and finish on time.
      let maxSpeed = 0.038;
      if (race.status === 'live' && this.endTime > 0) {
        const now = Date.now() + this.serverTimeOffset;
        const timeLeftSeconds = (this.endTime - now) / 1000;
        if (timeLeftSeconds > 0) {
          const remainingProgress = TOTAL_LAPS - horse.cumulativeProgress;
          if (remainingProgress > 0) {
            const requiredSpeed = remainingProgress / Math.max(0.5, timeLeftSeconds - 0.5);
            maxSpeed = Math.min(0.055, Math.max(maxSpeed, requiredSpeed));
          }
        }
      }

      const baseSpeed = race.status === 'live' && horse.cumulativeProgress < TOTAL_LAPS && !isInactive
        ? 0.0035
        : 0;
      const desiredSpeed = Math.max(baseSpeed, Math.min(maxSpeed, diff / 1.2));
      const currentSpeed = horse.speed || 0;
      const speedDiff = desiredSpeed - currentSpeed;
      // Smooth out sudden speed spikes (like catching up to a token burst) by lowering acceleration limits
      const maxAccel = 0.02;
      const maxDecel = 0.03;
      const limit = speedDiff > 0 ? maxAccel * delta : maxDecel * delta;
      const nextSpeed = currentSpeed + Math.max(-limit, Math.min(limit, speedDiff));

      horse.cumulativeProgress += nextSpeed * delta;
      horse.progress = horse.cumulativeProgress % 1.0;
      horse.speed = nextSpeed;
    });
  }

  private getInitialProgress(apiHorse: HorseView, leaderTokens: number, elapsed: number) {
    const tokenRatio = apiHorse.current_tokens / leaderTokens;
    let progress = tokenRatio * elapsed * TOTAL_LAPS;

    if (this.race?.status === 'pending') {
      progress = 0.0;
    } else if (this.race?.status === 'finished' || progress >= TOTAL_LAPS) {
      progress = TOTAL_LAPS;
    }

    return progress;
  }

  private getElapsedRaceRatio() {
    if (!this.race) return 0;

    const now = Date.now() + this.serverTimeOffset;
    const durationMs = this.endTime - this.startTime;
    let elapsed = 0;

    if (durationMs > 0) {
      elapsed = Math.max(0, Math.min(1, (now - this.startTime) / durationMs));
    }

    if (this.race.status === 'pending') return 0;
    if (this.race.status === 'finished') return 1.0;
    return elapsed;
  }

  private getLeaderTokens(horses: HorseView[]) {
    let leaderTokens = 1;
    horses.forEach((horse) => {
      if (horse.current_tokens > leaderTokens) {
        leaderTokens = horse.current_tokens;
      }
    });
    return leaderTokens;
  }
}
