export type SpinRewardType = "kick" | "quiz_boost" | "ref_boost" | "ticket" | "none";
export type SpinRewardId = "k50" | "k100" | "k200" | "q2x" | "r3x" | "ticket" | "nothing";
export type SpinUnlockType = "invite" | "share";

export interface SpinReward {
  id: SpinRewardId;
  label: string;
  chance: number;
  type: SpinRewardType;
  value: number;
}

export interface SpinState {
  day: string;
  used: number;
  invite: number;
  share: number;
  tickets: number;
  cap: number;
  left: number;
}

export interface SpinBoosts {
  quizBoostMult: number;
  refBoostMult: number;
}

export interface SpinEconomy {
  kick: number;
  dailyEarned: number;
}

export interface SpinStateResponse {
  ok: boolean;
  spin: SpinState;
  boosts: SpinBoosts;
  economy: SpinEconomy;
}

export interface SpinUnlockRequest {
  sessionId: string;
  type: SpinUnlockType;
}

export interface SpinUnlockResponse {
  ok: boolean;
  spin: SpinState;
  economy?: SpinEconomy;
  inviteBonus?: {
    verified: boolean;
    spinGranted: number;
    kickGranted: number;
    championPoolEligible: boolean;
    pendingClaims: number;
  };
}

export interface SpinRollRequest {
  sessionId: string;
}

export interface SpinRollResponse {
  ok: boolean;
  reward: SpinReward;
  deltaApplied: number;
  spin: SpinState;
  boosts: SpinBoosts;
  economy: SpinEconomy;
}

export interface SpinSyncPayload {
  spin: SpinState;
  boosts?: SpinBoosts;
  economy?: SpinEconomy;
}
