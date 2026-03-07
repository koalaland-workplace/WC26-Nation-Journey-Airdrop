import { DEFAULT_SPIN_BOOSTS, DEFAULT_SPIN_ECONOMY, DEFAULT_SPIN_STATE, SPIN_SEGMENT_ORDER } from "./constants";
import type { SpinBoosts, SpinEconomy, SpinReward, SpinRewardId, SpinState, SpinUnlockType } from "./types";

export interface SpinResultViewModel {
  message: string;
  good: boolean;
}

function clampInteger(value: number, min: number, max: number): number {
  const rounded = Math.floor(Number(value) || 0);
  return Math.max(min, Math.min(max, rounded));
}

export function safeSpinState(spin: SpinState | null | undefined): SpinState {
  if (!spin) return DEFAULT_SPIN_STATE;

  return {
    day: spin.day,
    used: clampInteger(spin.used, 0, 999),
    invite: clampInteger(spin.invite, 0, 999),
    share: clampInteger(spin.share, 0, 999),
    tickets: clampInteger(spin.tickets, 0, 999),
    cap: Math.max(1, clampInteger(spin.cap, 1, 999)),
    left: clampInteger(spin.left, 0, 999)
  };
}

export function safeSpinBoosts(boosts: SpinBoosts | null | undefined): SpinBoosts {
  if (!boosts) return DEFAULT_SPIN_BOOSTS;
  return {
    quizBoostMult: Math.max(1, clampInteger(boosts.quizBoostMult, 1, 99)),
    refBoostMult: Math.max(1, clampInteger(boosts.refBoostMult, 1, 99))
  };
}

export function safeSpinEconomy(economy: SpinEconomy | null | undefined): SpinEconomy {
  if (!economy) return DEFAULT_SPIN_ECONOMY;
  return {
    kick: Math.max(0, clampInteger(economy.kick, 0, Number.MAX_SAFE_INTEGER)),
    dailyEarned: Math.max(0, clampInteger(economy.dailyEarned, 0, Number.MAX_SAFE_INTEGER))
  };
}

export function spinRewardIndexById(rewardId: SpinRewardId): number {
  const index = SPIN_SEGMENT_ORDER.indexOf(rewardId);
  return index >= 0 ? index : 0;
}

export function spinRewardAngleById(rewardId: SpinRewardId): number {
  const segmentSize = 360 / SPIN_SEGMENT_ORDER.length;
  const center = spinRewardIndexById(rewardId) * segmentSize + segmentSize / 2;
  return ((center % 360) + 360) % 360;
}

export function getSpinTargetAngle(currentAngle: number, rewardId: SpinRewardId, turns = 6): number {
  const segmentSize = 360 / SPIN_SEGMENT_ORDER.length;
  const index = spinRewardIndexById(rewardId);
  const desired = ((360 - (index * segmentSize + segmentSize / 2)) % 360 + 360) % 360;
  const normalizedCurrent = ((currentAngle % 360) + 360) % 360;
  const delta = (desired - normalizedCurrent + 360) % 360;
  return currentAngle + 360 * Math.max(1, turns) + delta;
}

export function formatSpinSubtitle(left: number): string {
  const safeLeft = Math.max(0, Math.floor(Number(left) || 0));
  if (safeLeft > 0) {
    return `${safeLeft} Free Spin${safeLeft > 1 ? "s" : ""} Ready`;
  }
  return "All spins used · Unlock more below";
}

export function formatUnlockMessage(type: SpinUnlockType): string {
  return type === "invite"
    ? "👥 Verified F1 confirmed: +1 spin, +250 KICK, Champion Pool eligible."
    : "📣 WAR share bonus granted (+1 spin).";
}

export function formatSpinResult(reward: SpinReward, deltaApplied: number): SpinResultViewModel {
  if (reward.type === "kick") {
    if (deltaApplied > 0) {
      return {
        message: `🎉 ${reward.label} claimed.`,
        good: true
      };
    }
    return {
      message: `⚠️ ${reward.label} rolled but daily KICK cap reached.`,
      good: false
    };
  }

  if (reward.type === "quiz_boost") {
    return {
      message: "⚡ 2x Quiz boost activated for today.",
      good: true
    };
  }

  if (reward.type === "ref_boost") {
    return {
      message: "🚀 3x Referral boost activated for today.",
      good: true
    };
  }

  if (reward.type === "ticket") {
    return {
      message: "🎟️ +1 Rising Box Ticket added.",
      good: true
    };
  }

  return {
    message: "😶 No reward this spin. Try next spin.",
    good: false
  };
}
