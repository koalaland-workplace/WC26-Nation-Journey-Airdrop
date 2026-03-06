import { readJson, writeJson } from "../http.js";
import { earnApplyKick, getSession, sessionView } from "../state.js";

function economyView(session) {
  return {
    kick: session.kick,
    dailyEarned: session.economy.dailyEarned
  };
}

export function getEarnTasksState(res, url) {
  const session = getSession(url.searchParams.get("sessionId"));
  if (!session) {
    writeJson(res, 400, { ok: false, error: "invalid_session" });
    return;
  }

  const view = sessionView(session);
  writeJson(res, 200, {
    ok: true,
    earn: view.earn,
    economy: economyView(session)
  });
}

export async function postEarnTaskClaim(req, res) {
  const body = await readJson(req);
  const session = getSession(body.sessionId);
  if (!session) {
    writeJson(res, 400, { ok: false, error: "invalid_session" });
    return;
  }

  const taskId = String(body.taskId || "").trim();
  if (!taskId || taskId.length > 120) {
    writeJson(res, 400, { ok: false, error: "invalid_task_id" });
    return;
  }

  const points = Math.max(0, Math.floor(Number(body.points) || 0));
  if (points <= 0 || points > 50000) {
    writeJson(res, 400, { ok: false, error: "invalid_task_points" });
    return;
  }

  const alreadyClaimed = !!session.earn.claimedTasks[taskId];
  let appliedKick = 0;
  if (!alreadyClaimed) {
    session.earn.claimedTasks[taskId] = Date.now();
    appliedKick = earnApplyKick(session, points);
  }

  const view = sessionView(session);
  writeJson(res, 200, {
    ok: true,
    taskId,
    alreadyClaimed,
    appliedKick,
    earn: view.earn,
    economy: economyView(session)
  });
}
