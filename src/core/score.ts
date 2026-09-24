import { SCORE } from '../config';

export interface StepScoreInput {
  gemsCleared: number;
  cascadeDepth: number;
  lines: number;
  bombs: number;
  hypers: number;
  secondsSinceLastMove: number;
  /** Timed mode keeps the clock as the pressure, so the speed bonus is skipped. */
  useSpeedBonus: boolean;
}

export interface StepScore {
  base: number;
  bonus: number;
  speed: number;
  total: number;
  multiplier: number;
}

export const multiplierForDepth = (depth: number): number =>
  Math.min(SCORE.maxMultiplier, 1 + SCORE.multiplierStep * Math.max(0, depth - 1));

/** Points needed to complete level `level` (1-indexed). */
export const levelTarget = (level: number): number =>
  Math.round(SCORE.levelBase * Math.pow(SCORE.levelGrowth, Math.max(0, level - 1)));

export function stepScore(input: StepScoreInput): StepScore {
  const multiplier = multiplierForDepth(input.cascadeDepth);
  const base = Math.ceil(input.gemsCleared * SCORE.gemBase * multiplier);
  const bonus =
    input.lines * SCORE.specialBonus.line +
    input.bombs * SCORE.specialBonus.bomb +
    input.hypers * SCORE.specialBonus.hyper;

  let speed = 0;
  if (input.useSpeedBonus && input.gemsCleared > 0) {
    const seconds = Math.max(SCORE.speedBonusMinSeconds, input.secondsSinceLastMove);
    speed = Math.min(SCORE.speedBonusCap, Math.round(base / seconds));
  }

  return { base, bonus, speed, total: base + bonus + speed, multiplier };
}

/** Colour tier for combo popups — purely presentational. */
export const multiplierTier = (multiplier: number): number => {
  if (multiplier >= 6) return 4;
  if (multiplier >= 4) return 3;
  if (multiplier >= 2.5) return 2;
  if (multiplier >= 1.5) return 1;
  return 0;
};
