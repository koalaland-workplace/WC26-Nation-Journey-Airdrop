import { randomUUID } from "node:crypto";
import { readJson, writeJson } from "../http.js";
import { getSession, sessionView } from "../state.js";

export async function postSessionInit(req, res) {
  const body = await readJson(req);
  let sessionId = String(body.sessionId || "").trim();
  if (!sessionId) {
    sessionId = randomUUID();
  }
  const session = getSession(sessionId);
  if (!session) {
    writeJson(res, 400, { ok: false, error: "invalid_session" });
    return;
  }
  writeJson(res, 200, { ok: true, state: sessionView(session) });
}

export async function postSessionSync(req, res) {
  const body = await readJson(req);
  const session = getSession(body.sessionId);
  if (!session) {
    writeJson(res, 400, { ok: false, error: "invalid_session" });
    return;
  }

  if (Number.isFinite(Number(body.kick))) {
    session.kick = Math.max(0, Math.floor(Number(body.kick)));
  }
  if (Number.isFinite(Number(body.dailyEarned))) {
    session.economy.dailyEarned = Math.max(0, Math.floor(Number(body.dailyEarned)));
  }

  writeJson(res, 200, { ok: true, state: sessionView(session) });
}

export function getHealth(res) {
  writeJson(res, 200, { ok: true, service: "wc26-telecampaign-backend" });
}
