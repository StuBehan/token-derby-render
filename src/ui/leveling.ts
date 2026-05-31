export const MAX_LEVEL = 30;

const XP_AWARDS = {
  compete: 25,
  podium: 25,
  runnerUp: 15,
  winner: 30,
  tokenBonusMax: 15,
};

export interface LevelInfo {
  level: number;
  xp: number;
  level_start_xp: number;
  next_level_xp: number | null;
  xp_into_level: number;
  xp_for_level: number | null;
  progress: number;
}

export function xpForLevel(n: number): number {
  return 1.8 * n ** 3 + 18 * n ** 2 + 50 * n - 19.8;
}

export function thresholdForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.round(xpForLevel(level - 1));
}

export function levelFromXp(xp: number): number {
  const v = Math.max(0, Math.floor(xp));
  let level = 1;
  while (level < MAX_LEVEL && v >= thresholdForLevel(level + 1)) {
    level += 1;
  }
  return level;
}

export function levelInfo(xp: number): LevelInfo {
  const v = Math.max(0, Math.floor(xp));
  const level = levelFromXp(v);
  const level_start_xp = thresholdForLevel(level);
  const isMax = level >= MAX_LEVEL;
  const next_level_xp = isMax ? null : thresholdForLevel(level + 1);
  const xp_into_level = v - level_start_xp;
  const xp_for_level = isMax ? null : next_level_xp! - level_start_xp;
  const progress = isMax ? 1 : Math.min(1, xp_into_level / Math.max(1, xp_for_level!));
  return { level, xp: v, level_start_xp, next_level_xp, xp_into_level, xp_for_level, progress };
}

export function xpForRaceResult(rank: number): number {
  let xp = XP_AWARDS.compete;
  if (rank <= 3) xp += XP_AWARDS.podium;
  if (rank === 2) xp += XP_AWARDS.runnerUp;
  if (rank === 1) xp += XP_AWARDS.winner;
  return xp;
}

export function xpForTokenBonus(rank: number, tokens: number, winner_tokens: number): number {
  if (rank === 1) return XP_AWARDS.tokenBonusMax;
  if (winner_tokens <= 0) return 0;
  const ratio = Math.max(0, tokens) / winner_tokens;
  return Math.round(Math.min(1, ratio) * XP_AWARDS.tokenBonusMax);
}

export function xpForRaceFinish(rank: number, tokens: number, winner_tokens: number, live_xp: number = 0): number {
  return xpForRaceResult(rank) + xpForTokenBonus(rank, tokens, winner_tokens) + live_xp;
}
