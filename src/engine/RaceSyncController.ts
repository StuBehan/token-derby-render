import * as THREE from 'three';
import { Horse } from './Horse';
import { HorseView, RaceView } from './RaceClient';
import { getLaneCenterOffset, getDynamicLaneOffset } from './TrackLayout';

// Races vary hugely in real duration (a 2 minute demo vs. a 12 hour live race), so the lap count
// is derived from race length to keep a roughly constant, visually satisfying time-per-lap instead
// of stretching a fixed lap count across whatever the real duration happens to be.
const TARGET_SECONDS_PER_LAP = 24;
const FALLBACK_TOTAL_LAPS = 5;

export class RaceSyncController {
  private race: RaceView | null = null;
  private serverTimeOffset = 0;
  private startTime = 0;
  private endTime = 0;
  private totalLapsCount = FALLBACK_TOTAL_LAPS;

  get liveRace() {
    return this.race;
  }

  get totalLaps() {
    return this.totalLapsCount;
  }

  setRace(race: RaceView) {
    this.race = race;
    this.startTime = Date.parse(race.start_time);
    this.endTime = Date.parse(race.end_time);
    this.serverTimeOffset = Date.parse(race.server_time) - Date.now();

    const durationSeconds = (this.endTime - this.startTime) / 1000;
    this.totalLapsCount = durationSeconds > 0
      ? Math.max(1, Math.round(durationSeconds / TARGET_SECONDS_PER_LAP))
      : FALLBACK_TOTAL_LAPS;
  }

  clearRace() {
    this.race = null;
    this.serverTimeOffset = 0;
    this.startTime = 0;
    this.endTime = 0;
    this.totalLapsCount = FALLBACK_TOTAL_LAPS;
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
    const totalLaps = this.totalLapsCount;

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

      if (race.status === 'finished') {
        horse.cumulativeProgress = totalLaps;
        horse.progress = 0;
        horse.speed = 0;
        horse.isEatingGrass = false;
        return;
      }

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
      // The idle floor speed is likewise capped to half the pace required to finish exactly at
      // end_time, so a horse can never coast past that pace on long races (e.g. multi-hour races
      // were finishing visually within minutes because the old flat 0.0035 floor assumed demo-length races).
      let maxSpeed = 0.038;
      let idleSpeedCap = 0.0035;
      if (race.status === 'live' && this.endTime > 0) {
        const now = Date.now() + this.serverTimeOffset;
        const timeLeftSeconds = (this.endTime - now) / 1000;
        if (timeLeftSeconds > 0) {
          const remainingProgress = totalLaps - horse.cumulativeProgress;
          if (remainingProgress > 0) {
            const requiredSpeed = remainingProgress / Math.max(0.5, timeLeftSeconds - 0.5);
            maxSpeed = Math.min(0.055, Math.max(maxSpeed, requiredSpeed));
            idleSpeedCap = Math.min(idleSpeedCap, requiredSpeed * 0.5);
          }
        }
      }

      const baseSpeed = race.status === 'live' && horse.cumulativeProgress < totalLaps && !isInactive
        ? idleSpeedCap
        : 0;
      const desiredSpeed = Math.max(baseSpeed, Math.min(maxSpeed, diff / 1.2));
      const currentSpeed = horse.speed || 0;
      const speedDiff = desiredSpeed - currentSpeed;
      // Smooth out sudden speed spikes (like catching up to a token burst) by lowering acceleration limits
      const maxAccel = 0.02;
      const maxDecel = 0.03;
      const limit = speedDiff > 0 ? maxAccel * delta : maxDecel * delta;
      const nextSpeed = currentSpeed + Math.max(-limit, Math.min(limit, speedDiff));

      horse.cumulativeProgress = Math.min(totalLaps, horse.cumulativeProgress + nextSpeed * delta);
      horse.progress = horse.cumulativeProgress >= totalLaps ? 0 : horse.cumulativeProgress % 1.0;
      if (horse.cumulativeProgress >= totalLaps) {
        horse.speed = 0;
        return;
      }
      horse.speed = nextSpeed;
    });
  }

  private getInitialProgress(apiHorse: HorseView, leaderTokens: number, elapsed: number) {
    const totalLaps = this.totalLapsCount;
    const tokenRatio = apiHorse.current_tokens / leaderTokens;
    let progress = tokenRatio * elapsed * totalLaps;

    if (this.race?.status === 'pending') {
      progress = 0.0;
    } else if (this.race?.status === 'finished' || progress >= totalLaps) {
      progress = totalLaps;
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
