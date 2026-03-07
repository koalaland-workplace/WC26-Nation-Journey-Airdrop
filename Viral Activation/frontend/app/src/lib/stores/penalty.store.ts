import { get, writable } from "svelte/store";
import {
  fetchPenaltyDaily,
  finalizePenaltyMatch,
  startPenaltyMatch,
  submitPenaltyShot
} from "../modules/penalty/api";
import type {
  PenaltyActor,
  PenaltyDailyState,
  PenaltyFinalizeResponse,
  PenaltyMode,
  PenaltyOpponent,
  PenaltyShotState
} from "../modules/penalty/types";
import { sessionStore } from "./session.store";

export type PenaltyStatus = "idle" | "loading" | "ready" | "error";
export type PenaltyStage = "lobby" | "arena";

export interface PenaltyMatchState {
  matchId: string;
  mode: PenaltyMode;
  opponent: PenaltyOpponent | null;
  meFirst: boolean;
  suddenActive: boolean;
  meScore: number;
  oppScore: number;
  myIdx: number;
  oppIdx: number;
  mySeq: boolean[];
  oppSeq: boolean[];
  expectedActor: PenaltyActor | null;
  done: boolean;
}

export interface PenaltyState {
  status: PenaltyStatus;
  stage: PenaltyStage;
  daily: PenaltyDailyState;
  match: PenaltyMatchState | null;
  isBusy: boolean;
  playMessage: string;
  lastResult: PenaltyFinalizeResponse | null;
  errorMessage: string | null;
}

const DEFAULT_DAILY: PenaltyDailyState = {
  day: "",
  soloPlays: 0,
  soloFreeLeft: 3,
  soloShotRateNow: 0.75
};

const initialState: PenaltyState = {
  status: "idle",
  stage: "lobby",
  daily: DEFAULT_DAILY,
  match: null,
  isBusy: false,
  playMessage: "",
  lastResult: null,
  errorMessage: null
};

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return "Penalty service unavailable.";
}

function expectedActorFromState(shot: PenaltyShotState, meFirst: boolean): PenaltyActor | null {
  if (shot.done) return null;

  const regShots = 5;
  const sdShots = 5;
  const maxShots = regShots + sdShots;

  if (shot.myIdx >= maxShots && shot.oppIdx >= maxShots) return null;
  if (shot.myIdx >= maxShots) return "opp";
  if (shot.oppIdx >= maxShots) return "me";

  if (shot.suddenActive) {
    const mySd = Math.max(0, shot.myIdx - regShots);
    const oppSd = Math.max(0, shot.oppIdx - regShots);

    if (mySd === oppSd) {
      return meFirst ? "me" : "opp";
    }

    return mySd < oppSd ? "me" : "opp";
  }

  if (shot.myIdx === shot.oppIdx) {
    return meFirst ? "me" : "opp";
  }

  return shot.myIdx < shot.oppIdx ? "me" : "opp";
}

function matchFromShot(
  matchId: string,
  mode: PenaltyMode,
  meFirst: boolean,
  shot: PenaltyShotState,
  fallbackOpponent?: PenaltyOpponent
): PenaltyMatchState {
  return {
    matchId,
    mode,
    opponent: shot.opponent ?? fallbackOpponent ?? null,
    meFirst,
    suddenActive: shot.suddenActive,
    meScore: shot.meScore,
    oppScore: shot.oppScore,
    myIdx: shot.myIdx,
    oppIdx: shot.oppIdx,
    mySeq: shot.mySeq,
    oppSeq: shot.oppSeq,
    done: shot.done,
    expectedActor: expectedActorFromState(shot, meFirst)
  };
}

function createPenaltyStore() {
  const { subscribe, set, update } = writable<PenaltyState>(initialState);

  async function refresh(sessionId: string): Promise<void> {
    if (!sessionId) return;

    update((state) => ({ ...state, status: "loading", errorMessage: null }));

    try {
      const payload = await fetchPenaltyDaily(sessionId);
      sessionStore.sync({ economy: payload.economy });

      update((state) => ({
        ...state,
        status: "ready",
        daily: payload.penalty,
        errorMessage: null
      }));
    } catch (error) {
      update((state) => ({
        ...state,
        status: "error",
        errorMessage: toErrorMessage(error)
      }));
    }
  }

  async function start(sessionId: string, mode: PenaltyMode, opponentId?: string): Promise<void> {
    if (!sessionId) return;

    update((state) => ({
      ...state,
      isBusy: true,
      errorMessage: null,
      playMessage: "Creating match..."
    }));

    try {
      const payload = await startPenaltyMatch({ sessionId, mode, opponentId });
      sessionStore.sync({ economy: payload.economy });

      const baseShot: PenaltyShotState = {
        actor: payload.match.meFirst ? "me" : "opp",
        scored: false,
        done: false,
        suddenActive: payload.match.suddenActive,
        meScore: payload.match.meScore,
        oppScore: payload.match.oppScore,
        myIdx: payload.match.myIdx,
        oppIdx: payload.match.oppIdx,
        mySeq: [],
        oppSeq: [],
        opponent: payload.match.opponent
      };

      update((state) => ({
        ...state,
        stage: "arena",
        isBusy: false,
        daily: payload.penalty,
        match: matchFromShot(
          payload.match.matchId,
          mode,
          payload.match.meFirst,
          baseShot,
          payload.match.opponent
        ),
        playMessage: payload.match.meFirst ? "Your turn to shoot." : "Opponent starts.",
        errorMessage: null,
        lastResult: null
      }));
    } catch (error) {
      update((state) => ({
        ...state,
        isBusy: false,
        errorMessage: toErrorMessage(error)
      }));
    }
  }

  async function finalize(sessionId: string): Promise<void> {
    const current = get({ subscribe });

    if (!current || !current.match || !sessionId) return;

    try {
      const payload = await finalizePenaltyMatch({
        sessionId,
        matchId: current.match.matchId
      });

      sessionStore.sync({ economy: payload.economy });

      const prefix =
        payload.result === "win"
          ? "🏆 You win"
          : payload.result === "loss"
            ? "💥 You lost"
            : "🤝 Draw";

      update((state) => ({
        ...state,
        stage: "lobby",
        daily: payload.penalty,
        match: null,
        isBusy: false,
        lastResult: payload,
        playMessage: `${prefix} ${payload.final.meScore}:${payload.final.oppScore} (${payload.deltaApplied >= 0 ? "+" : ""}${payload.deltaApplied.toLocaleString("en-US")} KICK)`,
        errorMessage: null
      }));
    } catch (error) {
      update((state) => ({
        ...state,
        isBusy: false,
        errorMessage: toErrorMessage(error)
      }));
    }
  }

  async function submitTurn(
    sessionId: string,
    actor: PenaltyActor,
    onTarget: boolean,
    keeperCovered: boolean,
    auto: boolean
  ): Promise<void> {
    const current = get({ subscribe });

    if (!current || !current.match || !sessionId || current.isBusy) return;

    if (current.match.expectedActor !== actor) return;

    update((state) => ({ ...state, isBusy: true, errorMessage: null }));

    try {
      const payload = await submitPenaltyShot({
        sessionId,
        matchId: current.match.matchId,
        actor,
        onTarget,
        keeperCovered,
        auto
      });

      const match = matchFromShot(
        current.match.matchId,
        current.match.mode,
        current.match.meFirst,
        payload.shot,
        current.match.opponent ?? undefined
      );

      const shotLabel = payload.shot.scored ? "GOAL" : "MISS";
      const by =
        actor === "me"
          ? "You"
          : current.match.opponent?.isAi
            ? "AI"
            : current.match.opponent?.name || "Opponent";

      update((state) => ({
        ...state,
        match,
        isBusy: false,
        playMessage: `${by}: ${shotLabel} · ${payload.shot.meScore}:${payload.shot.oppScore}`,
        errorMessage: null
      }));

      if (payload.shot.done) {
        await finalize(sessionId);
        return;
      }
    } catch (error) {
      update((state) => ({
        ...state,
        isBusy: false,
        errorMessage: toErrorMessage(error)
      }));
    }
  }

  async function shoot(sessionId: string, onTarget = true): Promise<void> {
    await submitTurn(sessionId, "me", onTarget, false, false);
  }

  async function defend(sessionId: string, keeperCovered: boolean, auto = false): Promise<void> {
    await submitTurn(sessionId, "opp", false, keeperCovered, auto);
  }

  function backToLobby(): void {
    update((state) => ({
      ...state,
      stage: "lobby",
      match: null,
      isBusy: false,
      errorMessage: null
    }));
  }

  return {
    subscribe,
    refresh,
    start,
    shoot,
    defend,
    backToLobby,
    reset: () => set(initialState)
  };
}

export const penaltyStore = createPenaltyStore();
