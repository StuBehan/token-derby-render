import type { RaceView } from '../engine/RaceClient';
import { levelInfo, xpForRaceFinish } from './leveling';

export type PodiumPosition = 'first' | 'second' | 'third';

export function buildPodiumHorses(race: RaceView | null) {
  if (!race) return [];

  const sorted = [...race.horses].sort((a, b) => a.rank - b.rank);
  const winnerTokens = sorted[0]?.current_tokens ?? 0;

  return sorted.map((horse) => {
    const liveXp = horse.live_xp || 0;
    const xpBefore = horse.xp;
    const xpAwarded = xpForRaceFinish(horse.rank, horse.current_tokens, winnerTokens, liveXp);
    const xpAfter = xpBefore + xpAwarded;
    const beforeInfo = levelInfo(xpBefore);
    const afterInfo = levelInfo(xpAfter);

    return {
      ...horse,
      xpAwarded,
      xpBefore,
      xpAfter,
      beforeInfo,
      afterInfo,
      levelledUp: afterInfo.level > beforeInfo.level,
    };
  });
}

export function buildVisualPodium<T>(horses: T[]) {
  const first = horses[0];
  const second = horses[1] || null;
  const third = horses[2] || null;
  const result: { position: PodiumPosition; data: T; badge: string; label: string }[] = [];

  if (second) result.push({ position: 'second', data: second, badge: '🥈', label: '2nd' });
  if (first) result.push({ position: 'first', data: first, badge: '🥇', label: '1st' });
  if (third) result.push({ position: 'third', data: third, badge: '🥉', label: '3rd' });
  return result;
}

export function getPillarNumber(position: string) {
  if (position === 'first') return '1';
  if (position === 'second') return '2';
  return '3';
}
