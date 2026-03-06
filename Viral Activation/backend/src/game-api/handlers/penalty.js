import { randomUUID } from "node:crypto";
import { readJson, writeJson } from "../http.js";
import {
  applyKick,
  getSession,
  getSoloShotRate,
  penaltyEvaluate,
  penaltyExpectedActor,
  penaltyMaxShots,
  sessionView
} from "../state.js";

function economyView(session) {
  return {
    kick: session.kick,
    dailyEarned: session.economy.dailyEarned
  };
}

export function getPenaltyDaily(res, url) {
  const session = getSession(url.searchParams.get("sessionId"));
  if (!session) {
    writeJson(res, 400, { ok: false, error: "invalid_session" });
    return;
  }

  writeJson(res, 200, {
    ok: true,
    penalty: sessionView(session).penalty,
    economy: economyView(session)
  });
}

export async function postPenaltyStart(req, res) {
  const body = await readJson(req);
  const session = getSession(body.sessionId);
  if (!session) {
    writeJson(res, 400, { ok: false, error: "invalid_session" });
    return;
  }

  const mode = body.mode === "pvp" ? "pvp" : "solo";
  let entryFeeApplied = 0;
  const soloShotRateNow = getSoloShotRate(session.penalty.soloPlays);

  if (mode === "solo") {
    const freeLeft = Math.max(0, 3 - session.penalty.soloPlays);
    if (freeLeft <= 0) {
      if (session.kick < 500) {
        writeJson(res, 409, { ok: false, error: "insufficient_kick_for_solo_entry" });
        return;
      }
      entryFeeApplied = applyKick(session, -500);
    }
    session.penalty.soloPlays += 1;
  }

  const matchId = randomUUID();
  session.penalty.matches[matchId] = {
    id: matchId,
    mode,
    regShots: 5,
    sdShots: 5,
    suddenActive: false,
    meFirst: Math.random() < 0.5,
    mySeq: [],
    oppSeq: [],
    myIdx: 0,
    oppIdx: 0,
    meScore: 0,
    oppScore: 0,
    soloShotRate: soloShotRateNow,
    done: false,
    createdAt: Date.now()
  };

  writeJson(res, 200, {
    ok: true,
    match: {
      matchId,
      mode,
      meFirst: session.penalty.matches[matchId].meFirst,
      suddenActive: false,
      meScore: 0,
      oppScore: 0,
      myIdx: 0,
      oppIdx: 0,
      soloShotRateNow
    },
    entryFeeApplied,
    penalty: sessionView(session).penalty,
    economy: economyView(session)
  });
}

export async function postPenaltyShot(req, res) {
  const body = await readJson(req);
  const session = getSession(body.sessionId);
  if (!session) {
    writeJson(res, 400, { ok: false, error: "invalid_session" });
    return;
  }

  const matchId = String(body.matchId || "");
  const actor = body.actor === "opp" ? "opp" : "me";
  const match = session.penalty.matches[matchId];
  if (!match) {
    writeJson(res, 404, { ok: false, error: "match_not_found" });
    return;
  }

  penaltyEvaluate(match);
  if (match.done) {
    writeJson(res, 409, { ok: false, error: "match_already_done" });
    return;
  }

  const expected = penaltyExpectedActor(match);
  if (expected && expected !== actor) {
    writeJson(res, 409, {
      ok: false,
      error: "wrong_turn",
      expectedActor: expected
    });
    return;
  }

  const maxShots = penaltyMaxShots(match);
  if (actor === "me" && match.myIdx >= maxShots) {
    writeJson(res, 409, { ok: false, error: "my_shots_exhausted" });
    return;
  }
  if (actor === "opp" && match.oppIdx >= maxShots) {
    writeJson(res, 409, { ok: false, error: "opp_shots_exhausted" });
    return;
  }

  const onTarget = !!body.onTarget;
  const keeperCovered = !!body.keeperCovered;
  const auto = !!body.auto;

  let scored = false;
  if (actor === "me") {
    if (match.mode === "solo") {
      scored = onTarget && Math.random() < match.soloShotRate;
    } else {
      scored = onTarget;
    }
    match.mySeq.push(scored);
    match.myIdx += 1;
  } else {
    if (match.mode === "solo") {
      let saveChance = 0.25;
      if (auto) saveChance *= 0.6;
      const saved = Math.random() < saveChance;
      scored = !saved;
    } else {
      const saved = !auto && keeperCovered;
      scored = !saved;
    }
    match.oppSeq.push(scored);
    match.oppIdx += 1;
  }

  penaltyEvaluate(match);

  writeJson(res, 200, {
    ok: true,
    shot: {
      actor,
      scored,
      done: match.done,
      suddenActive: match.suddenActive,
      meScore: match.meScore,
      oppScore: match.oppScore,
      myIdx: match.myIdx,
      oppIdx: match.oppIdx,
      mySeq: match.mySeq,
      oppSeq: match.oppSeq
    }
  });
}

export async function postPenaltyFinalize(req, res) {
  const body = await readJson(req);
  const session = getSession(body.sessionId);
  if (!session) {
    writeJson(res, 400, { ok: false, error: "invalid_session" });
    return;
  }

  const matchId = String(body.matchId || "");
  const match = session.penalty.matches[matchId];
  if (!match) {
    writeJson(res, 404, { ok: false, error: "match_not_found" });
    return;
  }

  penaltyEvaluate(match);

  let result = "draw";
  if (match.meScore > match.oppScore) result = "win";
  else if (match.meScore < match.oppScore) result = "loss";

  let delta = 0;
  if (result === "win") delta = 2000;
  else if (result === "loss" && match.mode === "pvp") delta = -2500;

  const deltaApplied = delta === 0 ? 0 : applyKick(session, delta);
  delete session.penalty.matches[matchId];

  writeJson(res, 200, {
    ok: true,
    result,
    deltaApplied,
    final: {
      meScore: match.meScore,
      oppScore: match.oppScore,
      mode: match.mode
    },
    penalty: sessionView(session).penalty,
    economy: economyView(session)
  });
}
