import { DEFAULT_SPIN_DAILY_CAP } from "../constants.js";
import { readJson, writeJson } from "../http.js";
import {
  applyKick,
  dayKey,
  ensureToday,
  getAllSessions,
  getSession,
  pickSpinReward,
  sessionView,
  spinCap,
  spinLeft
} from "../state.js";

function boostsView(view) {
  return {
    quizBoostMult: view.quizBoostMult,
    refBoostMult: view.refBoostMult
  };
}

function economyView(session) {
  return {
    kick: session.kick,
    dailyEarned: session.economy.dailyEarned
  };
}

export function getSpinState(res, url) {
  const session = getSession(url.searchParams.get("sessionId"));
  if (!session) {
    writeJson(res, 400, { ok: false, error: "invalid_session" });
    return;
  }

  const view = sessionView(session);
  writeJson(res, 200, {
    ok: true,
    spin: view.spin,
    boosts: boostsView(view),
    economy: economyView(session)
  });
}

export async function postSpinUnlock(req, res) {
  const body = await readJson(req);
  const session = getSession(body.sessionId);
  if (!session) {
    writeJson(res, 400, { ok: false, error: "invalid_session" });
    return;
  }

  if (spinCap(session) >= Math.max(1, Math.floor(Number(session.spin.cap || DEFAULT_SPIN_DAILY_CAP)))) {
    writeJson(res, 409, { ok: false, error: "spin_cap_reached" });
    return;
  }

  const type = String(body.type || "").trim();
  if (type !== "invite" && type !== "share") {
    writeJson(res, 400, { ok: false, error: "invalid_unlock_type" });
    return;
  }

  if (type === "invite") session.spin.invite += 1;
  if (type === "share") session.spin.share += 1;

  const view = sessionView(session);
  writeJson(res, 200, { ok: true, spin: view.spin });
}

export async function postSpinResetTest(req, res) {
  const body = await readJson(req);
  const cap = Math.max(1, Math.min(20, Math.floor(Number(body.left || 10))));
  const sid = String(body.sessionId || "").trim();

  if (!sid) {
    let count = 0;
    for (const session of getAllSessions()) {
      ensureToday(session);
      session.spin.cap = cap;
      session.spin.used = 0;
      session.spin.invite = Math.max(0, cap - 1);
      session.spin.share = 0;
      count += 1;
    }
    writeJson(res, 200, { ok: true, resetAll: true, resetCount: count, left: cap });
    return;
  }

  const session = getSession(sid);
  if (!session) {
    writeJson(res, 400, { ok: false, error: "invalid_session" });
    return;
  }

  session.spin.cap = cap;
  session.spin.used = 0;
  session.spin.invite = Math.max(0, cap - 1);
  session.spin.share = 0;

  const view = sessionView(session);
  writeJson(res, 200, {
    ok: true,
    spin: view.spin,
    boosts: boostsView(view),
    economy: economyView(session)
  });
}

export async function postSpinRoll(req, res) {
  const body = await readJson(req);
  const session = getSession(body.sessionId);
  if (!session) {
    writeJson(res, 400, { ok: false, error: "invalid_session" });
    return;
  }
  if (spinLeft(session) <= 0) {
    writeJson(res, 409, { ok: false, error: "no_spins_left" });
    return;
  }

  session.spin.used += 1;
  const reward = pickSpinReward();
  const today = dayKey();
  let deltaApplied = 0;

  if (reward.type === "kick") {
    deltaApplied = applyKick(session, reward.value);
  } else if (reward.type === "quiz_boost") {
    session.quiz.boostDay = today;
    session.quiz.boostMult = Math.max(2, session.quiz.boostMult || 1);
  } else if (reward.type === "ref_boost") {
    session.referral.boostDay = today;
    session.referral.boostMult = Math.max(3, session.referral.boostMult || 1);
  } else if (reward.type === "ticket") {
    session.spin.tickets += 1;
  }

  const view = sessionView(session);
  writeJson(res, 200, {
    ok: true,
    reward,
    deltaApplied,
    spin: view.spin,
    boosts: boostsView(view),
    economy: economyView(session)
  });
}
