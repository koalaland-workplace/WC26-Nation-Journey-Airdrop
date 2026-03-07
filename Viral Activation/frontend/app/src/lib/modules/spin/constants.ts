import type { SpinBoosts, SpinEconomy, SpinRewardId, SpinState } from "./types";

export const MAX_DAILY_SPIN_CAP = 10;

export const SPIN_SEGMENT_ORDER: SpinRewardId[] = [
  "k50",
  "k100",
  "nothing",
  "k200",
  "q2x",
  "r3x",
  "ticket"
];

export const DEFAULT_SPIN_STATE: SpinState = {
  day: "",
  used: 0,
  invite: 0,
  share: 0,
  tickets: 0,
  cap: 1,
  left: 1
};

export const DEFAULT_SPIN_BOOSTS: SpinBoosts = {
  quizBoostMult: 1,
  refBoostMult: 1
};

export const DEFAULT_SPIN_ECONOMY: SpinEconomy = {
  kick: 24_350,
  dailyEarned: 0
};
