import {
  DAILY_KICK_CAP,
  DEFAULT_SPIN_DAILY_CAP,
  QUIZ_BANK,
  QUIZ_RULES,
  SPIN_REWARDS,
  TASK_KICK_CAP,
  type QuizBankQuestion,
  type SpinReward
} from "./constants.js";

export interface QuizQuestionState extends QuizBankQuestion {}

export interface QuizAnswerState {
  choice: number;
  correct: boolean;
  answeredAt: number;
}

export interface AppNationState {
  code: string;
  lastChangedAt: number;
  lockedUntil: number;
}

export interface PenaltyMatchState {
  id: string;
  mode: "solo" | "pvp";
  regShots: number;
  sdShots: number;
  suddenActive: boolean;
  meFirst: boolean;
  mySeq: boolean[];
  oppSeq: boolean[];
  myIdx: number;
  oppIdx: number;
  meScore: number;
  oppScore: number;
  soloShotRate: number;
  done: boolean;
  createdAt: number;
  opponentId: string;
  opponentName: string;
  opponentNationCode: string;
  opponentIsAi: boolean;
  opponentAiWinRate: number;
  opponentShouldWin: boolean;
}

export interface AppGameState {
  sessionId: string;
  kick: number;
  economy: {
    day: string;
    dailyEarned: number;
  };
  nation: AppNationState;
  quiz: {
    day: string;
    questions: QuizQuestionState[];
    answers: Record<string, QuizAnswerState>;
    streak: number;
    lastQuizDay: string;
    boostDay: string;
    boostMult: number;
  };
  spin: {
    day: string;
    used: number;
    invite: number;
    share: number;
    tickets: number;
    cap: number;
  };
  referral: {
    boostDay: string;
    boostMult: number;
    f1Registered: number;
    f1Active7: number;
    f2Registered: number;
    f2Active7: number;
  };
  earn: {
    taskCap: number;
    claimedKick: number;
    claimedTasks: Record<string, number>;
    verifiedTasks: Record<string, number>;
  };
  penalty: {
    day: string;
    soloPlays: number;
    matches: Record<string, PenaltyMatchState>;
  };
}

interface SessionViewSpin {
  day: string;
  used: number;
  invite: number;
  share: number;
  tickets: number;
  cap: number;
  left: number;
}

export interface SessionView {
  sessionId: string;
  dayKey: string;
  kick: number;
  dailyEarned: number;
  nation: {
    code: string;
    lastChangedAt: number;
    lockedUntil: number;
    canChange: boolean;
    lockRemainingSeconds: number;
  };
  quizBoostDay: string;
  quizBoostMult: number;
  refBoostDay: string;
  refBoostMult: number;
  spin: SessionViewSpin;
  penalty: {
    day: string;
    soloPlays: number;
    soloFreeLeft: number;
    soloShotRateNow: number;
  };
  referral: {
    boostMult: number;
    f1Registered: number;
    f1Active7: number;
    f2Registered: number;
    f2Active7: number;
  };
  earn: {
    taskCap: number;
    claimedKick: number;
    claimedTaskIds: string[];
    verifiedTaskIds: string[];
  };
}

function asFiniteInt(value: unknown, fallback = 0): number {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.floor(next);
}

function asBoundedInt(value: unknown, min: number, max: number, fallback: number): number {
  return Math.min(max, Math.max(min, asFiniteInt(value, fallback)));
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function normalizeNationCode(value: unknown, fallback = "VN"): string {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase();
  if (/^[A-Z]{2,3}$/.test(normalized)) return normalized;
  return fallback;
}

function normalizeNationState(raw: unknown, fallbackCode = "VN"): AppNationState {
  const source = asRecord(raw);
  return {
    code: normalizeNationCode(source.code, normalizeNationCode(fallbackCode, "VN")),
    lastChangedAt: Math.max(0, asFiniteInt(source.lastChangedAt, 0)),
    lockedUntil: Math.max(0, asFiniteInt(source.lockedUntil, 0))
  };
}

export function dayKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dayDiff(a: string, b: string): number {
  if (!a || !b) return 999;
  const left = new Date(`${a}T00:00:00`);
  const right = new Date(`${b}T00:00:00`);
  return Math.round((right.getTime() - left.getTime()) / 86400000);
}

function seededInt(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function rngFromSeed(seed: number): () => number {
  let current = seed || 123456789;
  return () => {
    current = (current + 0x6d2b79f5) | 0;
    let value = Math.imul(current ^ (current >>> 15), 1 | current);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: T[], rand: () => number): T[] {
  const out = items.slice();
  for (let index = out.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rand() * (index + 1));
    const temp = out[index];
    out[index] = out[swapIndex];
    out[swapIndex] = temp;
  }
  return out;
}

function pickNByDiff(diff: "easy" | "medium" | "hard", size: number, rand: () => number): QuizQuestionState[] {
  const pool = QUIZ_BANK.filter((item) => item.diff === diff);
  return shuffled(pool, rand).slice(0, size);
}

function buildQuizDailySet(sessionId: string, today: string): QuizQuestionState[] {
  const rand = rngFromSeed(seededInt(`quiz:${today}:${sessionId}`));
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

export function createDefaultState(sessionId: string, kick = 0, nationCode = "VN"): AppGameState {
  const today = dayKey();
  return {
    sessionId,
    kick: Math.max(0, asFiniteInt(kick, 0)),
    economy: {
      day: today,
      dailyEarned: 0
    },
    nation: {
      code: normalizeNationCode(nationCode, "VN"),
      lastChangedAt: 0,
      lockedUntil: 0
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
      f1Registered: 0,
      f1Active7: 0,
      f2Registered: 0,
      f2Active7: 0
    },
    earn: {
      taskCap: TASK_KICK_CAP,
      claimedKick: 0,
      claimedTasks: {},
      verifiedTasks: {}
    },
    penalty: {
      day: today,
      soloPlays: 0,
      matches: {}
    }
  };
}

function normalizePenaltyMatch(raw: unknown): PenaltyMatchState | null {
  const value = asRecord(raw);
  const id = String(value.id ?? "").trim();
  if (!id) return null;
  const mode = value.mode === "pvp" ? "pvp" : "solo";
  const opponentIsAi = Boolean(value.opponentIsAi);
  return {
    id,
    mode,
    regShots: asBoundedInt(value.regShots, 1, 10, 5),
    sdShots: asBoundedInt(value.sdShots, 1, 10, 5),
    suddenActive: Boolean(value.suddenActive),
    meFirst: Boolean(value.meFirst),
    mySeq: Array.isArray(value.mySeq) ? value.mySeq.map((v) => Boolean(v)) : [],
    oppSeq: Array.isArray(value.oppSeq) ? value.oppSeq.map((v) => Boolean(v)) : [],
    myIdx: asBoundedInt(value.myIdx, 0, 100, 0),
    oppIdx: asBoundedInt(value.oppIdx, 0, 100, 0),
    meScore: asBoundedInt(value.meScore, 0, 100, 0),
    oppScore: asBoundedInt(value.oppScore, 0, 100, 0),
    soloShotRate: Math.max(0.05, Math.min(0.95, Number(value.soloShotRate ?? 0.75))),
    done: Boolean(value.done),
    createdAt: asFiniteInt(value.createdAt, Date.now()),
    opponentId: String(value.opponentId ?? (mode === "pvp" ? "ai:default" : "solo:keeper")),
    opponentName: String(value.opponentName ?? (mode === "pvp" ? "Simulated Rival" : "Keeper")),
    opponentNationCode: normalizeNationCode(value.opponentNationCode, "VN"),
    opponentIsAi,
    opponentAiWinRate: Math.max(0, Math.min(1, Number(value.opponentAiWinRate ?? 0.95))),
    opponentShouldWin: opponentIsAi ? Boolean(value.opponentShouldWin ?? true) : false
  };
}

function normalizeQuestions(raw: unknown): QuizQuestionState[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => asRecord(item))
    .map((question) => {
      const diffRaw = question.diff;
      const diff: QuizQuestionState["diff"] =
        diffRaw === "hard" || diffRaw === "medium" || diffRaw === "easy" ? diffRaw : "easy";
      return {
        id: String(question.id ?? ""),
        diff,
        pts: asBoundedInt(question.pts, 0, 10000, 0),
        text: String(question.text ?? ""),
        opts: Array.isArray(question.opts) ? question.opts.map((opt) => String(opt)) : [],
        correct: asBoundedInt(question.correct, 0, 10, 0)
      };
    })
    .filter((question) => question.id.length > 0 && question.opts.length > 0);
}

function normalizeAnswers(raw: unknown): Record<string, QuizAnswerState> {
  const value = asRecord(raw);
  const out: Record<string, QuizAnswerState> = {};
  for (const [key, item] of Object.entries(value)) {
    const row = asRecord(item);
    out[key] = {
      choice: asFiniteInt(row.choice, 0),
      correct: Boolean(row.correct),
      answeredAt: asFiniteInt(row.answeredAt, Date.now())
    };
  }
  return out;
}

export function mergePersistedState(
  raw: unknown,
  sessionId: string,
  userKick: number,
  userNationCode = "VN"
): AppGameState {
  const normalizedUserNation = normalizeNationCode(userNationCode, "VN");
  const base = createDefaultState(sessionId, userKick, normalizedUserNation);
  const state = asRecord(raw);
  const today = dayKey();

  const nation = asRecord(state.nation);
  const quiz = asRecord(state.quiz);
  const spin = asRecord(state.spin);
  const referral = asRecord(state.referral);
  const earn = asRecord(state.earn);
  const penalty = asRecord(state.penalty);
  const penaltyMatchesRaw = asRecord(penalty.matches);
  const penaltyMatches: Record<string, PenaltyMatchState> = {};
  for (const [matchId, match] of Object.entries(penaltyMatchesRaw)) {
    const normalized = normalizePenaltyMatch({ ...(asRecord(match)), id: matchId });
    if (normalized) penaltyMatches[matchId] = normalized;
  }

  const merged: AppGameState = {
    sessionId,
    kick: Math.max(0, asFiniteInt(userKick, base.kick)),
    economy: {
      day: String(asRecord(state.economy).day ?? today),
      dailyEarned: Math.max(0, asFiniteInt(asRecord(state.economy).dailyEarned, 0))
    },
    nation: normalizeNationState(nation, normalizedUserNation),
    quiz: {
      day: String(quiz.day ?? ""),
      questions: normalizeQuestions(quiz.questions),
      answers: normalizeAnswers(quiz.answers),
      streak: Math.max(0, asFiniteInt(quiz.streak, 0)),
      lastQuizDay: String(quiz.lastQuizDay ?? ""),
      boostDay: String(quiz.boostDay ?? ""),
      boostMult: Math.max(1, asFiniteInt(quiz.boostMult, 1))
    },
    spin: {
      day: String(spin.day ?? today),
      used: Math.max(0, asFiniteInt(spin.used, 0)),
      invite: Math.max(0, asFiniteInt(spin.invite, 0)),
      share: Math.max(0, asFiniteInt(spin.share, 0)),
      tickets: Math.max(0, asFiniteInt(spin.tickets, 0)),
      cap: Math.max(1, asFiniteInt(spin.cap, DEFAULT_SPIN_DAILY_CAP))
    },
    referral: {
      boostDay: String(referral.boostDay ?? ""),
      boostMult: Math.max(1, asFiniteInt(referral.boostMult, 1)),
      f1Registered: Math.max(0, asFiniteInt(referral.f1Registered, 0)),
      f1Active7: Math.max(0, asFiniteInt(referral.f1Active7, 0)),
      f2Registered: Math.max(0, asFiniteInt(referral.f2Registered, 0)),
      f2Active7: Math.max(0, asFiniteInt(referral.f2Active7, 0))
    },
    earn: {
      taskCap: Math.max(0, asFiniteInt(earn.taskCap, TASK_KICK_CAP)),
      claimedKick: Math.max(0, asFiniteInt(earn.claimedKick, 0)),
      claimedTasks: Object.fromEntries(
        Object.entries(asRecord(earn.claimedTasks)).map(([taskId, claimedAt]) => [
          taskId,
          asFiniteInt(claimedAt, Date.now())
        ])
      ),
      verifiedTasks: Object.fromEntries(
        Object.entries(asRecord(earn.verifiedTasks)).map(([taskId, verifiedAt]) => [
          taskId,
          asFiniteInt(verifiedAt, Date.now())
        ])
      )
    },
    penalty: {
      day: String(penalty.day ?? today),
      soloPlays: Math.max(0, asFiniteInt(penalty.soloPlays, 0)),
      matches: penaltyMatches
    }
  };

  ensureToday(merged);
  return merged;
}

export function ensureToday(state: AppGameState): void {
  const today = dayKey();

  if (state.economy.day !== today) {
    state.economy.day = today;
    state.economy.dailyEarned = 0;
  }

  if (state.quiz.lastQuizDay && dayDiff(state.quiz.lastQuizDay, today) > 1) {
    state.quiz.streak = 0;
  }

  if (state.quiz.boostDay !== today) {
    state.quiz.boostDay = "";
    state.quiz.boostMult = 1;
  }

  if (state.referral.boostDay !== today) {
    state.referral.boostDay = "";
    state.referral.boostMult = 1;
  }

  if (state.spin.day !== today) {
    state.spin.day = today;
    state.spin.used = 0;
    state.spin.invite = 0;
    state.spin.share = 0;
  }

  if (state.penalty.day !== today) {
    state.penalty.day = today;
    state.penalty.soloPlays = 0;
    state.penalty.matches = {};
  }

  if (state.quiz.day !== today) {
    state.quiz.day = today;
    state.quiz.questions = buildQuizDailySet(state.sessionId, today);
    state.quiz.answers = {};
  }
}

export function applyKick(state: AppGameState, delta: number): number {
  let applied = Number(delta || 0);
  if (!Number.isFinite(applied) || applied === 0) return 0;

  ensureToday(state);
  if (applied > 0) {
    const remain = Math.max(0, DAILY_KICK_CAP - state.economy.dailyEarned);
    if (remain <= 0) {
      applied = 0;
    } else {
      applied = Math.min(applied, remain);
      state.economy.dailyEarned += applied;
    }
  }

  if (applied < 0) state.kick = Math.max(0, state.kick + applied);
  if (applied > 0) state.kick += applied;
  return applied;
}

export function earnApplyKick(state: AppGameState, points: number): number {
  const safePoints = Math.max(0, asFiniteInt(points, 0));
  if (safePoints <= 0) return 0;

  const cap = Math.max(0, asFiniteInt(state.earn.taskCap, TASK_KICK_CAP));
  const claimedKick = Math.max(0, asFiniteInt(state.earn.claimedKick, 0));
  const remain = Math.max(0, cap - claimedKick);
  const applied = Math.min(remain, safePoints);
  if (applied <= 0) return 0;

  state.earn.claimedKick = claimedKick + applied;
  state.kick += applied;
  return applied;
}

export function spinCap(state: AppGameState): number {
  const hardCap = Math.max(1, asFiniteInt(state.spin.cap, DEFAULT_SPIN_DAILY_CAP));
  const invite = Math.max(0, asFiniteInt(state.spin.invite, 0));
  const share = Math.max(0, asFiniteInt(state.spin.share, 0));
  return Math.min(hardCap, 1 + invite + share);
}

export function spinLeft(state: AppGameState): number {
  return Math.max(0, spinCap(state) - Math.max(0, asFiniteInt(state.spin.used, 0)));
}

export function pickSpinReward(): SpinReward {
  const random = Math.random() * 100;
  let acc = 0;
  for (let index = 0; index < SPIN_REWARDS.length; index += 1) {
    acc += SPIN_REWARDS[index].chance;
    if (random <= acc) return SPIN_REWARDS[index];
  }
  return SPIN_REWARDS[SPIN_REWARDS.length - 1];
}

export function getSoloShotRate(plays: number): number {
  return Math.max(0.05, 0.75 - Math.max(0, Number(plays || 0)) * 0.1);
}

export function penaltyMaxShots(match: PenaltyMatchState): number {
  return match.regShots + match.sdShots;
}

function penaltySyncScores(match: PenaltyMatchState): void {
  match.meScore = 0;
  match.oppScore = 0;
  for (let index = 0; index < match.myIdx; index += 1) {
    if (match.mySeq[index]) match.meScore += 1;
  }
  for (let index = 0; index < match.oppIdx; index += 1) {
    if (match.oppSeq[index]) match.oppScore += 1;
  }
}

export function penaltyEvaluate(match: PenaltyMatchState): void {
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

export function penaltyExpectedActor(match: PenaltyMatchState): "me" | "opp" | null {
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

export function quizClientQuestion(question: QuizQuestionState, index: number) {
  return {
    id: question.id,
    index,
    diff: question.diff,
    pts: question.pts,
    text: question.text,
    opts: question.opts
  };
}

export function sessionView(state: AppGameState): SessionView {
  const today = dayKey();
  const lockRemainingMs = Math.max(0, state.nation.lockedUntil - Date.now());
  return {
    sessionId: state.sessionId,
    dayKey: today,
    kick: state.kick,
    dailyEarned: state.economy.dailyEarned,
    nation: {
      code: normalizeNationCode(state.nation.code, "VN"),
      lastChangedAt: Math.max(0, Number(state.nation.lastChangedAt || 0)),
      lockedUntil: Math.max(0, Number(state.nation.lockedUntil || 0)),
      canChange: lockRemainingMs <= 0,
      lockRemainingSeconds: Math.ceil(lockRemainingMs / 1000)
    },
    quizBoostDay: state.quiz.boostDay,
    quizBoostMult: state.quiz.boostDay === today ? state.quiz.boostMult : 1,
    refBoostDay: state.referral.boostDay,
    refBoostMult: state.referral.boostDay === today ? state.referral.boostMult : 1,
    spin: {
      day: state.spin.day,
      used: state.spin.used,
      invite: state.spin.invite,
      share: state.spin.share,
      tickets: state.spin.tickets,
      cap: spinCap(state),
      left: spinLeft(state)
    },
    penalty: {
      day: state.penalty.day,
      soloPlays: state.penalty.soloPlays,
      soloFreeLeft: Math.max(0, 3 - state.penalty.soloPlays),
      soloShotRateNow: getSoloShotRate(state.penalty.soloPlays)
    },
    referral: {
      boostMult: state.referral.boostDay === today ? state.referral.boostMult : 1,
      f1Registered: state.referral.f1Registered,
      f1Active7: state.referral.f1Active7,
      f2Registered: state.referral.f2Registered,
      f2Active7: state.referral.f2Active7
    },
    earn: {
      taskCap: state.earn.taskCap,
      claimedKick: state.earn.claimedKick,
      claimedTaskIds: Object.keys(state.earn.claimedTasks || {}),
      verifiedTaskIds: Object.keys(state.earn.verifiedTasks || {})
    }
  };
}
