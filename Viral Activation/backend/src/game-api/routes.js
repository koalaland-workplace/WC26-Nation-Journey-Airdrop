import { writeJson } from "./http.js";
import { postEarnTaskClaim, getEarnTasksState } from "./handlers/earn.js";
import {
  getPenaltyDaily,
  postPenaltyFinalize,
  postPenaltyShot,
  postPenaltyStart
} from "./handlers/penalty.js";
import { getQuizDaily, postQuizAnswer, postQuizFinalize } from "./handlers/quiz.js";
import { postReferralBoost, getReferralState } from "./handlers/referral.js";
import { getHealth, postSessionInit, postSessionSync } from "./handlers/session.js";
import {
  getSpinState,
  postSpinResetTest,
  postSpinRoll,
  postSpinUnlock
} from "./handlers/spin.js";

const ENDPOINTS = [
  "POST /api/session/init",
  "POST /api/session/sync",
  "GET /api/referral/state",
  "POST /api/referral/boost",
  "GET /api/earn/tasks/state",
  "POST /api/earn/tasks/claim",
  "GET /api/quiz/daily",
  "POST /api/quiz/answer",
  "POST /api/quiz/finalize",
  "GET /api/spin/state",
  "POST /api/spin/unlock",
  "POST /api/spin/reset-test",
  "POST /api/spin/roll",
  "GET /api/penalty/daily",
  "POST /api/penalty/start",
  "POST /api/penalty/shot",
  "POST /api/penalty/finalize",
  "GET /health"
];

const ROUTES = new Map([
  ["POST /api/session/init", (req, res) => postSessionInit(req, res)],
  ["POST /api/session/sync", (req, res) => postSessionSync(req, res)],
  ["GET /api/referral/state", (_req, res, url) => getReferralState(res, url)],
  ["POST /api/referral/boost", (req, res) => postReferralBoost(req, res)],
  ["GET /api/earn/tasks/state", (_req, res, url) => getEarnTasksState(res, url)],
  ["POST /api/earn/tasks/claim", (req, res) => postEarnTaskClaim(req, res)],
  ["GET /api/quiz/daily", (_req, res, url) => getQuizDaily(res, url)],
  ["POST /api/quiz/answer", (req, res) => postQuizAnswer(req, res)],
  ["POST /api/quiz/finalize", (req, res) => postQuizFinalize(req, res)],
  ["GET /api/spin/state", (_req, res, url) => getSpinState(res, url)],
  ["POST /api/spin/unlock", (req, res) => postSpinUnlock(req, res)],
  ["POST /api/spin/reset-test", (req, res) => postSpinResetTest(req, res)],
  ["POST /api/spin/roll", (req, res) => postSpinRoll(req, res)],
  ["GET /api/penalty/daily", (_req, res, url) => getPenaltyDaily(res, url)],
  ["POST /api/penalty/start", (req, res) => postPenaltyStart(req, res)],
  ["POST /api/penalty/shot", (req, res) => postPenaltyShot(req, res)],
  ["POST /api/penalty/finalize", (req, res) => postPenaltyFinalize(req, res)],
  ["GET /health", (_req, res) => getHealth(res)]
]);

export async function handleGameApiRequest(req, res) {
  if (req.method === "OPTIONS") {
    writeJson(res, 200, { ok: true });
    return;
  }

  const url = new URL(req.url || "/", "http://localhost");
  const routeKey = `${req.method || "GET"} ${url.pathname}`;
  const handler = ROUTES.get(routeKey);

  if (!handler) {
    writeJson(res, 404, {
      ok: false,
      error: "not_found",
      endpoints: ENDPOINTS
    });
    return;
  }

  try {
    await handler(req, res, url);
  } catch (error) {
    writeJson(res, 500, {
      ok: false,
      error: "server_error",
      message: error && error.message ? error.message : "unknown_error"
    });
  }
}
