import { writable } from "svelte/store";
import { initSession } from "../modules/session/api";
import {
  clearStoredSessionId,
  getStoredSessionId,
  resolveReferralSessionId,
  storeSessionId
} from "../modules/session/utils";
import type {
  SessionSpinState,
  SessionSyncPayload,
  SessionViewState
} from "../modules/session/types";

export type SessionStatus = "idle" | "loading" | "ready" | "error";

export interface SessionState {
  status: SessionStatus;
  sessionId: string | null;
  dayKey: string | null;
  kick: number;
  dailyEarned: number;
  quizBoostMult: number;
  refBoostMult: number;
  spin: SessionSpinState;
  errorMessage: string | null;
}

const DEFAULT_SPIN_STATE: SessionSpinState = {
  day: "",
  used: 0,
  invite: 0,
  share: 0,
  tickets: 0,
  cap: 1,
  left: 1
};

const initialState: SessionState = {
  status: "idle",
  sessionId: null,
  dayKey: null,
  kick: 0,
  dailyEarned: 0,
  quizBoostMult: 1,
  refBoostMult: 1,
  spin: DEFAULT_SPIN_STATE,
  errorMessage: null
};

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return "Failed to initialize session.";
}

function safeSpinState(spin: SessionSpinState | null | undefined): SessionSpinState {
  if (!spin) return DEFAULT_SPIN_STATE;
  return {
    day: spin.day,
    used: Math.max(0, Math.floor(Number(spin.used) || 0)),
    invite: Math.max(0, Math.floor(Number(spin.invite) || 0)),
    share: Math.max(0, Math.floor(Number(spin.share) || 0)),
    tickets: Math.max(0, Math.floor(Number(spin.tickets) || 0)),
    cap: Math.max(1, Math.floor(Number(spin.cap) || 1)),
    left: Math.max(0, Math.floor(Number(spin.left) || 0))
  };
}

function createSessionStore() {
  const { subscribe, set, update } = writable<SessionState>(initialState);
  let initPromise: Promise<string | null> | null = null;

  function applyView(state: SessionViewState): void {
    storeSessionId(state.sessionId);
    update((current) => ({
      ...current,
      status: "ready",
      sessionId: state.sessionId,
      dayKey: state.dayKey,
      kick: Math.max(0, Math.floor(Number(state.kick) || 0)),
      dailyEarned: Math.max(0, Math.floor(Number(state.dailyEarned) || 0)),
      quizBoostMult: Math.max(1, Math.floor(Number(state.quizBoostMult) || 1)),
      refBoostMult: Math.max(1, Math.floor(Number(state.refBoostMult) || 1)),
      spin: safeSpinState(state.spin),
      errorMessage: null
    }));
  }

  async function init(force = false): Promise<string | null> {
    if (initPromise && !force) return initPromise;

    const run = (async () => {
      update((current) => ({ ...current, status: "loading", errorMessage: null }));
      const storedSessionId = getStoredSessionId() ?? undefined;
      const response = await initSession({
        sessionId: storedSessionId,
        referralSessionId: storedSessionId ? undefined : resolveReferralSessionId()
      });

      if (!response.ok || !response.state) {
        throw new Error("invalid_session_response");
      }

      applyView(response.state);
      return response.state.sessionId;
    })()
      .catch((error) => {
        const message = toErrorMessage(error);
        update((current) => ({ ...current, status: "error", errorMessage: message }));
        clearStoredSessionId();
        return null;
      })
      .finally(() => {
        initPromise = null;
      });

    initPromise = run;
    return run;
  }

  function sync(payload: SessionSyncPayload): void {
    update((current) => ({
      ...current,
      spin: payload.spin ? safeSpinState(payload.spin) : current.spin,
      quizBoostMult: payload.boosts
        ? Math.max(1, Math.floor(Number(payload.boosts.quizBoostMult) || 1))
        : current.quizBoostMult,
      refBoostMult: payload.boosts
        ? Math.max(1, Math.floor(Number(payload.boosts.refBoostMult) || 1))
        : current.refBoostMult,
      kick: payload.economy
        ? Math.max(0, Math.floor(Number(payload.economy.kick) || 0))
        : current.kick,
      dailyEarned: payload.economy
        ? Math.max(0, Math.floor(Number(payload.economy.dailyEarned) || 0))
        : current.dailyEarned
    }));
  }

  function reset(): void {
    clearStoredSessionId();
    set(initialState);
  }

  return {
    subscribe,
    init,
    sync,
    reset
  };
}

export const sessionStore = createSessionStore();
