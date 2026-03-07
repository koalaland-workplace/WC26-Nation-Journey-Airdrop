import { writable } from "svelte/store";
import { fetchHotSignals } from "../modules/news/api";
import { DEFAULT_HOT_SIGNALS, type HotSignal } from "../modules/news/types";
import type { AppLanguageCode } from "../modules/i18n/types";

export type HotSignalsStatus = "idle" | "loading" | "ready" | "error";

export interface HotSignalsState {
  status: HotSignalsStatus;
  items: HotSignal[];
  lastUpdatedAt: string | null;
  errorMessage: string | null;
}

const CACHE_TTL_MS = 120_000;

const initialState: HotSignalsState = {
  status: "idle",
  items: DEFAULT_HOT_SIGNALS.slice(0, 5),
  lastUpdatedAt: null,
  errorMessage: null
};

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return "Failed to load hot signals.";
}

function createHotSignalsStore() {
  const { subscribe, set, update } = writable<HotSignalsState>(initialState);
  let lastFetchAtMs = 0;
  let isLoading = false;
  let lastLanguage: AppLanguageCode | null = null;

  async function refresh(limit = 5, force = false, language: AppLanguageCode = "en"): Promise<void> {
    if (isLoading) return;
    const now = Date.now();
    if (!force && lastLanguage === language && lastFetchAtMs > 0 && now - lastFetchAtMs < CACHE_TTL_MS) {
      return;
    }

    isLoading = true;
    update((state) => ({ ...state, status: "loading", errorMessage: null }));

    try {
      const items = await fetchHotSignals({ limit, language });
      lastFetchAtMs = Date.now();
      lastLanguage = language;
      update((state) => ({
        ...state,
        status: "ready",
        items: items.length > 0 ? items : DEFAULT_HOT_SIGNALS.slice(0, limit),
        lastUpdatedAt: new Date().toISOString(),
        errorMessage: null
      }));
    } catch (error) {
      update((state) => ({
        ...state,
        status: "error",
        items: state.items.length > 0 ? state.items : DEFAULT_HOT_SIGNALS.slice(0, limit),
        errorMessage: toErrorMessage(error)
      }));
    } finally {
      isLoading = false;
    }
  }

  return {
    subscribe,
    refresh,
      reset: () => {
        lastFetchAtMs = 0;
        lastLanguage = null;
        set(initialState);
      }
  };
}

export const hotSignalsStore = createHotSignalsStore();
