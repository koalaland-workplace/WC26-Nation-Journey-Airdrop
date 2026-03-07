import { resolveTierPolicyByKick } from "../tier/policy";

const SESSION_ID_STORAGE_KEY = "wc26_session_id_v1";
const KICK_PROGRESS_TARGET = 50_000;
const FALLBACK_REFERRAL_SESSION_ID = "b61ddaac-82a3-4424-bef9-4cb9d7b80f6b";
const REFERRAL_QUERY_KEYS = ["startapp", "start", "ref", "referral", "invite", "code"] as const;

function safeLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

function normalizeSessionLikeId(value: unknown): string | null {
  const text = String(value ?? "").trim();
  if (text.length < 8 || text.length > 128) return null;
  return text;
}

function defaultReferralSessionId(): string {
  const fromEnv = normalizeSessionLikeId(import.meta.env.VITE_DEFAULT_REFERRAL_SESSION_ID);
  return fromEnv ?? FALLBACK_REFERRAL_SESSION_ID;
}

function parseHashParams(hash: string): URLSearchParams {
  const clean = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!clean) return new URLSearchParams();
  const queryIndex = clean.indexOf("?");
  if (queryIndex >= 0) {
    return new URLSearchParams(clean.slice(queryIndex + 1));
  }
  if (clean.includes("=")) return new URLSearchParams(clean);
  return new URLSearchParams();
}

function referralFromUrl(): string | null {
  if (typeof window === "undefined") return null;

  const url = new URL(window.location.href);
  const hashParams = parseHashParams(url.hash);
  const allParams = [url.searchParams, hashParams];

  for (const key of REFERRAL_QUERY_KEYS) {
    for (const params of allParams) {
      const value = normalizeSessionLikeId(params.get(key));
      if (value) return value;
    }
  }
  return null;
}

function referralFromTelegram(): string | null {
  if (typeof window === "undefined") return null;

  const telegram = (window as typeof window & { Telegram?: { WebApp?: { initDataUnsafe?: { start_param?: unknown } } } })
    .Telegram;
  const raw = telegram?.WebApp?.initDataUnsafe?.start_param;
  return normalizeSessionLikeId(raw);
}

export function resolveReferralSessionId(): string {
  return referralFromUrl() ?? referralFromTelegram() ?? defaultReferralSessionId();
}

export function getStoredSessionId(): string | null {
  const storage = safeLocalStorage();
  if (!storage) return null;
  const sessionId = storage.getItem(SESSION_ID_STORAGE_KEY);
  if (!sessionId) return null;
  const trimmed = sessionId.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function storeSessionId(sessionId: string): void {
  const storage = safeLocalStorage();
  if (!storage) return;
  const trimmed = sessionId.trim();
  if (trimmed.length > 0) storage.setItem(SESSION_ID_STORAGE_KEY, trimmed);
}

export function clearStoredSessionId(): void {
  const storage = safeLocalStorage();
  if (!storage) return;
  storage.removeItem(SESSION_ID_STORAGE_KEY);
}

export function resolveTierLabel(kick: number): string {
  const tier = resolveTierPolicyByKick(kick);
  return tier?.label ?? "Unranked";
}

export function resolveRankLine(kick: number): string {
  const baselineKick = 24_350;
  const baselineNationRank = 132;
  const baselineGlobalRank = 5_342;
  const delta = Math.floor((kick - baselineKick) / 275);

  const nationRank = Math.max(1, baselineNationRank - delta);
  const globalRank = Math.max(1, baselineGlobalRank - delta * 18);

  return `🇧🇷 Brazil #${nationRank.toLocaleString("en-US")} | Global #${globalRank.toLocaleString("en-US")}`;
}

export function resolveKickRingPct(kick: number): number {
  const pct = Math.floor((kick / KICK_PROGRESS_TARGET) * 100);
  return Math.max(0, Math.min(100, pct));
}
