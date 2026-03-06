import { readJson, writeJson } from "../http.js";
import { dayKey, getSession, sessionView } from "../state.js";

export function getReferralState(res, url) {
  const session = getSession(url.searchParams.get("sessionId"));
  if (!session) {
    writeJson(res, 400, { ok: false, error: "invalid_session" });
    return;
  }

  writeJson(res, 200, {
    ok: true,
    referral: sessionView(session).referral
  });
}

export async function postReferralBoost(req, res) {
  const body = await readJson(req);
  const session = getSession(body.sessionId);
  if (!session) {
    writeJson(res, 400, { ok: false, error: "invalid_session" });
    return;
  }

  const today = dayKey();
  const mult = Math.max(1, Math.floor(Number(body.mult || 3)));
  session.referral.boostDay = today;
  session.referral.boostMult = Math.max(session.referral.boostMult || 1, mult);

  writeJson(res, 200, {
    ok: true,
    referral: sessionView(session).referral
  });
}
