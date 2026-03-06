import {
  DAILY_KICK_CAP,
  DEFAULT_SPIN_DAILY_CAP,
  QUIZ_BANK,
  QUIZ_RULES,
  SPIN_REWARDS,
  TASK_KICK_CAP
} from "./constants.js";

const sessions = new Map();

export function dayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dayDiff(a, b) {
  if (!a || !b) return 999;
  const left = new Date(`${a}T00:00:00`);
  const right = new Date(`${b}T00:00:00`);
  return Math.round((right.getTime() - left.getTime()) / 86400000);
}

function seededInt(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function rngFromSeed(seed) {
  let current = seed || 123456789;
  return () => {
    current = (current + 0x6d2b79f5) | 0;
    let value = Math.imul(current ^ (current >>> 15), 1 | current);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(items, rand) {
  const out = items.slice();
  for (let index = out.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rand() * (index + 1));
    const temp = out[index];
    out[index] = out[swapIndex];
    out[swapIndex] = temp;
  }
  return out;
}

function pickNByDiff(diff, size, rand) {
  const pool = QUIZ_BANK.filter((item) => item.diff === diff);
  return shuffled(pool, rand).slice(0, size);
}

function buildQuizDailySet(session) {
  const today = dayKey();
  const rand = rngFromSeed(seededInt(`quiz:${today}:${session.sessionId}`));
  const selected = [
    ...pickNByDiff("easy", QUIZ_RULES.easy, rand),
    ...pickNByDiff("medium", QUIZ_RULES.medium, rand),
    ...pickNByDiff("hard", QUIZ_RULES.hard, rand)
  ];
  return shuffled(selected, rand).map((question) => ({
    id: question.id,
    diff: question.diff,
    pts: question.pts,
    text: question.text,
    opts: question.opts.slice(),
    correct: question.correct
  }));
}

function createSession(sessionId) {
  const today = dayKey();
  return {
    sessionId,
    kick: 24350,
    economy: {
      day: today,
      dailyEarned: 0
    },
    quiz: {
      day: "",
      questions: [],
      answers: {},
      streak: 0,
      lastQuizDay: "",
      boostDay: "",
      boostMult: 1
    },
    spin: {
      day: today,
      used: 0,
      invite: 0,
      share: 0,
      tickets: 0,
      cap: DEFAULT_SPIN_DAILY_CAP
    },
    referral: {
      boostDay: "",
      boostMult: 1,
      f1Registered: 7,
      f1Active7: 3,
      f2Registered: 25,
      f2Active7: 16
    },
    earn: {
      taskCap: TASK_KICK_CAP,
      claimedKick: 0,
      claimedTasks: {}
    },
    penalty: {
      day: today,
      soloPlays: 0,
      matches: {}
    }
  };
}

export function ensureToday(session) {
  const today = dayKey();

  if (!session.earn || typeof session.earn !== "object") {
    session.earn = {
      taskCap: TASK_KICK_CAP,
      claimedKick: 0,
      claimedTasks: {}
    };
  }
  if (!session.earn.claimedTasks || typeof session.earn.claimedTasks !== "object") {
    session.earn.claimedTasks = {};
  }
  if (!Number.isFinite(Number(session.earn.taskCap)) || Number(session.earn.taskCap) <= 0) {
    session.earn.taskCap = TASK_KICK_CAP;
  }
  if (!Number.isFinite(Number(session.earn.claimedKick)) || Number(session.earn.claimedKick) < 0) {
    session.earn.claimedKick = 0;
  }

  if (session.economy.day !== today) {
    session.economy.day = today;
    session.economy.dailyEarned = 0;
  }

  if (session.quiz.lastQuizDay && dayDiff(session.quiz.lastQuizDay, today) > 1) {
    session.quiz.streak = 0;
  }

  if (session.quiz.boostDay !== today) {
    session.quiz.boostDay = "";
    session.quiz.boostMult = 1;
  }

  if (session.referral.boostDay !== today) {
    session.referral.boostDay = "";
    session.referral.boostMult = 1;
  }

  if (session.spin.day !== today) {
    session.spin.day = today;
    session.spin.used = 0;
    session.spin.invite = 0;
    session.spin.share = 0;
  }

  if (session.penalty.day !== today) {
    session.penalty.day = today;
    session.penalty.soloPlays = 0;
    session.penalty.matches = {};
  }

  if (session.quiz.day !== today) {
    session.quiz.day = today;
    session.quiz.questions = buildQuizDailySet(session);
    session.quiz.answers = {};
  }
}

export function getSession(sessionId) {
  const sid = String(sessionId || "").trim();
  if (!sid) return null;
  if (!sessions.has(sid)) {
    sessions.set(sid, createSession(sid));
  }
  const session = sessions.get(sid);
  ensureToday(session);
  return session;
}

export function getAllSessions() {
  return sessions.values();
}

export function applyKick(session, delta) {
  let applied = Number(delta || 0);
  if (!Number.isFinite(applied) || applied === 0) return 0;

  ensureToday(session);

  if (applied > 0) {
    const remain = Math.max(0, DAILY_KICK_CAP - session.economy.dailyEarned);
    if (remain <= 0) {
      applied = 0;
    } else {
      applied = Math.min(applied, remain);
      session.economy.dailyEarned += applied;
    }
  }

  if (applied < 0) {
    session.kick = Math.max(0, session.kick + applied);
  } else if (applied > 0) {
    session.kick += applied;
  }

  return applied;
}

export function spinCap(session) {
  const hardCap = Math.max(1, Math.floor(Number(session.spin.cap || DEFAULT_SPIN_DAILY_CAP)));
  const invite = Math.max(0, Math.floor(Number(session.spin.invite || 0)));
  const share = Math.max(0, Math.floor(Number(session.spin.share || 0)));
  return Math.min(hardCap, 1 + invite + share);
}

export function spinLeft(session) {
  return Math.max(0, spinCap(session) - Math.max(0, Number(session.spin.used || 0)));
}

export function pickSpinReward() {
  const random = Math.random() * 100;
  let acc = 0;
  for (let index = 0; index < SPIN_REWARDS.length; index += 1) {
    acc += SPIN_REWARDS[index].chance;
    if (random <= acc) return SPIN_REWARDS[index];
  }
  return SPIN_REWARDS[SPIN_REWARDS.length - 1];
}

function earnClaimedTaskIds(session) {
  return Object.keys(session.earn.claimedTasks || {});
}

export function earnApplyKick(session, points) {
  const safePoints = Math.max(0, Math.floor(Number(points) || 0));
  if (safePoints <= 0) return 0;

  const cap = Math.max(0, Math.floor(Number(session.earn.taskCap || TASK_KICK_CAP)));
  const claimedKick = Math.max(0, Math.floor(Number(session.earn.claimedKick || 0)));
  const remain = Math.max(0, cap - claimedKick);
  const applied = Math.min(remain, safePoints);
  if (applied <= 0) return 0;

  session.earn.claimedKick = claimedKick + applied;
  session.kick += applied;
  return applied;
}

export function getSoloShotRate(plays) {
  return Math.max(0.05, 0.75 - Math.max(0, Number(plays || 0)) * 0.1);
}

export function penaltyMaxShots(match) {
  return match.regShots + match.sdShots;
}

function penaltySyncScores(match) {
  match.meScore = 0;
  match.oppScore = 0;
  for (let index = 0; index < match.myIdx; index += 1) {
    if (match.mySeq[index]) match.meScore += 1;
  }
  for (let index = 0; index < match.oppIdx; index += 1) {
    if (match.oppSeq[index]) match.oppScore += 1;
  }
}

export function penaltyEvaluate(match) {
  penaltySyncScores(match);
  const regular = match.regShots;
  const suddenDeath = match.sdShots;
  const myRegular = Math.min(match.myIdx, regular);
  const oppRegular = Math.min(match.oppIdx, regular);

  if (myRegular < regular || oppRegular < regular) {
    match.done = false;
    return;
  }

  if (!match.suddenActive) {
    if (match.meScore === match.oppScore) {
      match.suddenActive = true;
      match.done = false;
      return;
    }
    match.done = true;
    return;
  }

  const mySudden = Math.max(0, match.myIdx - regular);
  const oppSudden = Math.max(0, match.oppIdx - regular);

  if (mySudden !== oppSudden) {
    match.done = false;
    return;
  }
  if (match.meScore !== match.oppScore) {
    match.done = true;
    return;
  }
  if (mySudden >= suddenDeath) {
    match.done = true;
    return;
  }
  match.done = false;
}

export function penaltyExpectedActor(match) {
  penaltyEvaluate(match);
  if (match.done) return null;

  const maxShots = penaltyMaxShots(match);
  if (match.myIdx >= maxShots && match.oppIdx >= maxShots) return null;
  if (match.myIdx >= maxShots) return "opp";
  if (match.oppIdx >= maxShots) return "me";

  if (match.suddenActive) {
    const mySudden = Math.max(0, match.myIdx - match.regShots);
    const oppSudden = Math.max(0, match.oppIdx - match.regShots);
    if (mySudden === oppSudden) return match.meFirst ? "me" : "opp";
    return mySudden < oppSudden ? "me" : "opp";
  }

  if (match.myIdx === match.oppIdx) return match.meFirst ? "me" : "opp";
  return match.myIdx < match.oppIdx ? "me" : "opp";
}

export function quizClientQuestion(question, index) {
  return {
    id: question.id,
    index,
    diff: question.diff,
    pts: question.pts,
    text: question.text,
    opts: question.opts
  };
}

export function sessionView(session) {
  const today = dayKey();
  return {
    sessionId: session.sessionId,
    dayKey: today,
    kick: session.kick,
    dailyEarned: session.economy.dailyEarned,
    quizBoostDay: session.quiz.boostDay,
    quizBoostMult: session.quiz.boostDay === today ? session.quiz.boostMult : 1,
    refBoostDay: session.referral.boostDay,
    refBoostMult: session.referral.boostDay === today ? session.referral.boostMult : 1,
    spin: {
      day: session.spin.day,
      used: session.spin.used,
      invite: session.spin.invite,
      share: session.spin.share,
      tickets: session.spin.tickets,
      cap: spinCap(session),
      left: spinLeft(session)
    },
    penalty: {
      day: session.penalty.day,
      soloPlays: session.penalty.soloPlays,
      soloFreeLeft: Math.max(0, 3 - session.penalty.soloPlays),
      soloShotRateNow: getSoloShotRate(session.penalty.soloPlays)
    },
    referral: {
      boostMult: session.referral.boostDay === today ? session.referral.boostMult : 1,
      f1Registered: session.referral.f1Registered,
      f1Active7: session.referral.f1Active7,
      f2Registered: session.referral.f2Registered,
      f2Active7: session.referral.f2Active7
    },
    earn: {
      taskCap: session.earn.taskCap,
      claimedKick: session.earn.claimedKick,
      claimedTaskIds: earnClaimedTaskIds(session)
    }
  };
}
