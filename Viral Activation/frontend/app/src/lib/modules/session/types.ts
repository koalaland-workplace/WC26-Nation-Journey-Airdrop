export interface SessionSpinState {
  day: string;
  used: number;
  invite: number;
  share: number;
  tickets: number;
  cap: number;
  left: number;
}

export interface SessionPenaltyState {
  day: string;
  soloPlays: number;
  soloFreeLeft: number;
  soloShotRateNow: number;
}

export interface SessionReferralState {
  boostMult: number;
  f1Registered: number;
  f1Active7: number;
  f2Registered: number;
  f2Active7: number;
}

export interface SessionViewState {
  sessionId: string;
  dayKey: string;
  kick: number;
  dailyEarned: number;
  quizBoostDay: string;
  quizBoostMult: number;
  refBoostDay: string;
  refBoostMult: number;
  spin: SessionSpinState;
  penalty: SessionPenaltyState;
  referral: SessionReferralState;
}

export interface SessionInitRequest {
  sessionId?: string;
  referralSessionId?: string;
}

export interface SessionInitResponse {
  ok: boolean;
  state: SessionViewState;
}

export interface SessionSyncRequest {
  sessionId: string;
  kick?: number;
  dailyEarned?: number;
}

export interface SessionSyncResponse {
  ok: boolean;
  state: SessionViewState;
}

export interface SessionBoosts {
  quizBoostMult: number;
  refBoostMult: number;
}

export interface SessionEconomy {
  kick: number;
  dailyEarned: number;
}

export interface SessionSyncPayload {
  spin?: SessionSpinState;
  boosts?: SessionBoosts;
  economy?: SessionEconomy;
}
