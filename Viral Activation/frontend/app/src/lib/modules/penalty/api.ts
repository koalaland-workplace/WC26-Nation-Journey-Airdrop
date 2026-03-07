import { httpGet, httpPost } from "../../api/http";
import type {
  PenaltyDailyResponse,
  PenaltyFinalizeRequest,
  PenaltyFinalizeResponse,
  PenaltyPvpOpponentsResponse,
  PenaltyShotRequest,
  PenaltyShotResponse,
  PenaltyStartRequest,
  PenaltyStartResponse
} from "./types";

const PENALTY_DAILY_ENDPOINT = "/api/penalty/daily";
const PENALTY_START_ENDPOINT = "/api/penalty/start";
const PENALTY_SHOT_ENDPOINT = "/api/penalty/shot";
const PENALTY_FINALIZE_ENDPOINT = "/api/penalty/finalize";
const PENALTY_PVP_OPPONENTS_ENDPOINT = "/api/penalty/pvp/opponents";

export async function fetchPenaltyDaily(sessionId: string): Promise<PenaltyDailyResponse> {
  const encodedSessionId = encodeURIComponent(sessionId);
  return httpGet<PenaltyDailyResponse>(`${PENALTY_DAILY_ENDPOINT}?sessionId=${encodedSessionId}`);
}

export async function startPenaltyMatch(payload: PenaltyStartRequest): Promise<PenaltyStartResponse> {
  return httpPost<PenaltyStartResponse, PenaltyStartRequest>(PENALTY_START_ENDPOINT, payload);
}

export async function fetchPenaltyPvpOpponents(
  sessionId: string
): Promise<PenaltyPvpOpponentsResponse> {
  const encodedSessionId = encodeURIComponent(sessionId);
  return httpGet<PenaltyPvpOpponentsResponse>(
    `${PENALTY_PVP_OPPONENTS_ENDPOINT}?sessionId=${encodedSessionId}`
  );
}

export async function submitPenaltyShot(payload: PenaltyShotRequest): Promise<PenaltyShotResponse> {
  return httpPost<PenaltyShotResponse, PenaltyShotRequest>(PENALTY_SHOT_ENDPOINT, payload);
}

export async function finalizePenaltyMatch(
  payload: PenaltyFinalizeRequest
): Promise<PenaltyFinalizeResponse> {
  return httpPost<PenaltyFinalizeResponse, PenaltyFinalizeRequest>(
    PENALTY_FINALIZE_ENDPOINT,
    payload
  );
}
