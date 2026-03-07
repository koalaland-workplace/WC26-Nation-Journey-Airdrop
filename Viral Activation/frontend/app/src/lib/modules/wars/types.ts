export interface NationStat {
  code: string;
  flag: string;
  name: string;
  users: number;
  eligibleUsers: number;
  totalKick: number;
  changePct: number;
}

export interface NationRankItem extends NationStat {
  warPoint: number;
}

export interface NationState {
  code: string;
  lastChangedAt: number;
  lockedUntil: number;
  canChange: boolean;
  remainingSeconds: number;
  remainingDays: number;
}

export interface NationStateResponse {
  ok: boolean;
  nation: NationState;
}

export interface NationApplyRequest {
  sessionId: string;
  nationCode: string;
}

export interface NationApplyResponse {
  ok: boolean;
  changed: boolean;
  nation: NationState;
}
