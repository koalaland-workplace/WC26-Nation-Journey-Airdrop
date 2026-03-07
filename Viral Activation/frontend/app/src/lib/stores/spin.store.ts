import { writable } from "svelte/store";
import { rollSpin, fetchSpinState, unlockSpin } from "../modules/spin/api";
import {
  DEFAULT_SPIN_BOOSTS,
  DEFAULT_SPIN_ECONOMY,
  DEFAULT_SPIN_STATE
} from "../modules/spin/constants";
import {
  safeSpinBoosts,
  safeSpinEconomy,
  safeSpinState
} from "../modules/spin/utils";
import type {
  SpinBoosts,
  SpinEconomy,
  SpinRollResponse,
  SpinState,
  SpinUnlockResponse,
  SpinUnlockType
} from "../modules/spin/types";
import { sessionStore, type SessionState } from "./session.store";

export type SpinStatus = "idle" | "loading" | "ready" | "error";

export interface SpinStoreState {
  status: SpinStatus;
  spin: SpinState;
  boosts: SpinBoosts;
  economy: SpinEconomy;
  wheelAngle: number;
  isRolling: boolean;
  resultMessage: string;
  resultGood: boolean;
  errorMessage: string | null;
}

const CACHE_TTL_MS = 20_000;

const initialState: SpinStoreState = {
  status: "idle",
  spin: DEFAULT_SPIN_STATE,
  boosts: DEFAULT_SPIN_BOOSTS,
  economy: DEFAULT_SPIN_ECONOMY,
  wheelAngle: 0,
  isRolling: false,
  resultMessage: "Spin to claim reward and activate boost.",
  resultGood: false,
  errorMessage: null
};

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return "Spin service unavailable.";
}

function createSpinStore() {
  const { subscribe, set, update } = writable<SpinStoreState>(initialState);

  let lastFetchAtMs = 0;
  let refreshPromise: Promise<void> | null = null;

  function applyState(
    payload: {
      spin?: SpinState;
      boosts?: SpinBoosts;
      economy?: SpinEconomy;
    },
    status: SpinStatus = "ready"
  ): void {
    update((current) => ({
      ...current,
      status,
      spin: payload.spin ? safeSpinState(payload.spin) : current.spin,
      boosts: payload.boosts ? safeSpinBoosts(payload.boosts) : current.boosts,
      economy: payload.economy ? safeSpinEconomy(payload.economy) : current.economy,
      errorMessage: null
    }));

    sessionStore.sync({
      spin: payload.spin,
      boosts: payload.boosts,
      economy: payload.economy
    });
  }

  function hydrateFromSession(session: SessionState): void {
    update((current) => ({
      ...current,
      spin: safeSpinState(session.spin),
      boosts: safeSpinBoosts({
        quizBoostMult: session.quizBoostMult,
        refBoostMult: session.refBoostMult
      }),
      economy: safeSpinEconomy({
        kick: session.kick,
        dailyEarned: session.dailyEarned
      })
    }));
  }

  async function refresh(sessionId: string, force = false): Promise<void> {
    if (!sessionId) return;
    if (refreshPromise && !force) return refreshPromise;

    const now = Date.now();
    if (!force && lastFetchAtMs > 0 && now - lastFetchAtMs < CACHE_TTL_MS) {
      return;
    }

    const run = (async () => {
      update((current) => ({ ...current, status: "loading", errorMessage: null }));
      const payload = await fetchSpinState(sessionId);
      lastFetchAtMs = Date.now();
      applyState(
        {
          spin: payload.spin,
          boosts: payload.boosts,
          economy: payload.economy
        },
        "ready"
      );
    })()
      .catch((error) => {
        update((current) => ({
          ...current,
          status: "error",
          errorMessage: toErrorMessage(error)
        }));
      })
      .finally(() => {
        refreshPromise = null;
      });

    refreshPromise = run;
    return run;
  }

  async function unlock(sessionId: string, type: SpinUnlockType): Promise<SpinUnlockResponse> {
    const payload = await unlockSpin(sessionId, type);
    applyState({ spin: payload.spin, economy: payload.economy }, "ready");
    return payload;
  }

  async function roll(sessionId: string, applyImmediately = true): Promise<SpinRollResponse> {
    const payload = await rollSpin(sessionId);
    if (applyImmediately) {
      lastFetchAtMs = Date.now();
      applyState(
        {
          spin: payload.spin,
          boosts: payload.boosts,
          economy: payload.economy
        },
        "ready"
      );
    }
    return payload;
  }

  function applyRoll(payload: SpinRollResponse): void {
    lastFetchAtMs = Date.now();
    applyState(
      {
        spin: payload.spin,
        boosts: payload.boosts,
        economy: payload.economy
      },
      "ready"
    );
  }

  function setWheelAngle(angle: number): void {
    update((current) => ({ ...current, wheelAngle: angle }));
  }

  function setRolling(value: boolean): void {
    update((current) => ({ ...current, isRolling: value }));
  }

  function setResult(message: string, good: boolean): void {
    update((current) => ({ ...current, resultMessage: message, resultGood: good }));
  }

  function setError(error: string | null): void {
    update((current) => ({ ...current, errorMessage: error }));
  }

  function reset(): void {
    lastFetchAtMs = 0;
    set(initialState);
  }

  return {
    subscribe,
    hydrateFromSession,
    refresh,
    unlock,
    roll,
    applyRoll,
    setWheelAngle,
    setRolling,
    setResult,
    setError,
    reset
  };
}

export const spinStore = createSpinStore();
