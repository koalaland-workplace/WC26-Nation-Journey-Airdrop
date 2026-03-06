export type EarnTaskTone = "g" | "y" | "b" | "r";

export interface EarnTaskCategory {
  id: string;
  icon: string;
  title: string;
  totalLabel: string;
  tone: EarnTaskTone;
}

export interface EarnTask {
  id: string;
  categoryId: string;
  icon: string;
  name: string;
  description: string;
  points: number;
  actionLabel: string;
  tone: EarnTaskTone;
  phase?: string;
  capPerDay?: number | null;
  isActive?: boolean;
  requiresVerification?: boolean;
  verificationHint?: string | null;
}

export interface EarnClaimResult {
  taskId: string;
  appliedKick: number;
  message: string;
}

export interface EarnStatePayload {
  taskCap: number;
  claimedKick: number;
  claimedTaskIds: string[];
  verifiedTaskIds?: string[];
}

export interface EarnStateResponse {
  ok: boolean;
  earn: EarnStatePayload;
  economy: {
    kick: number;
    dailyEarned: number;
  };
}

export interface EarnClaimRequest {
  sessionId: string;
  taskId: string;
  points?: number;
}

export interface EarnClaimResponse {
  ok: boolean;
  taskId: string;
  alreadyClaimed: boolean;
  appliedKick: number;
  earn: EarnStatePayload;
  economy: {
    kick: number;
    dailyEarned: number;
  };
}

export interface EarnVerifyRequest {
  sessionId: string;
  taskId: string;
  proof?: string;
}

export interface EarnVerifyResponse {
  ok: boolean;
  taskId: string;
  verified: boolean;
  requiresVerification: boolean;
  message: string;
  earn: EarnStatePayload;
  economy: {
    kick: number;
    dailyEarned: number;
  };
}

export interface EarnChannelItem {
  id: string;
  platform: string;
  name: string;
  url: string;
  icon: string;
  tasks: number;
  kick: number;
}

export interface EarnCatalogResponse {
  ok: boolean;
  categories: EarnTaskCategory[];
  tasks: EarnTask[];
  channels: EarnChannelItem[];
}
