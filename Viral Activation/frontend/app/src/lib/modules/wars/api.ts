import { httpGet, httpPost } from "../../api/http";
import type { PenaltyPvpOpponentsResponse } from "../penalty/types";
import type {
  NationApplyRequest,
  NationApplyResponse,
  NationStateResponse
} from "./types";

const NATION_STATE_ENDPOINT = "/api/nation/state";
const NATION_APPLY_ENDPOINT = "/api/nation/apply";
const PENALTY_PVP_OPPONENTS_ENDPOINT = "/api/penalty/pvp/opponents";

export async function fetchNationState(sessionId: string): Promise<NationStateResponse> {
  const encodedSessionId = encodeURIComponent(sessionId);
  return httpGet<NationStateResponse>(`${NATION_STATE_ENDPOINT}?sessionId=${encodedSessionId}`);
}

export async function applyNationSelection(
  payload: NationApplyRequest
): Promise<NationApplyResponse> {
  return httpPost<NationApplyResponse, NationApplyRequest>(NATION_APPLY_ENDPOINT, payload);
}

export async function fetchPvpOpponents(sessionId: string): Promise<PenaltyPvpOpponentsResponse> {
  const encodedSessionId = encodeURIComponent(sessionId);
  return httpGet<PenaltyPvpOpponentsResponse>(
    `${PENALTY_PVP_OPPONENTS_ENDPOINT}?sessionId=${encodedSessionId}`
  );
}
