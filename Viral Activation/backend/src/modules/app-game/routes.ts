import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { DEFAULT_SPIN_DAILY_CAP } from "./constants.js";
import { getOrCreateGameSession, persistGameSession } from "./store.js";
import {
  applyKick,
  dayDiff,
  dayKey,
  earnApplyKick,
  ensureToday,
  getSoloShotRate,
  penaltyEvaluate,
  penaltyExpectedActor,
  penaltyMaxShots,
  pickSpinReward,
  quizClientQuestion,
  sessionView,
  spinCap,
  spinLeft,
  type PenaltyMatchState
} from "./state.js";

const sessionIdSchema = z.string().trim().min(8).max(128);

const initSessionBodySchema = z.object({
  sessionId: z.string().trim().optional()
});

const syncSessionBodySchema = z.object({
  sessionId: sessionIdSchema,
  kick: z.number().optional(),
  dailyEarned: z.number().optional()
});

const querySessionSchema = z.object({
  sessionId: sessionIdSchema
});

const earnClaimSchema = z.object({
  sessionId: sessionIdSchema,
  taskId: z.string().trim().min(1).max(120),
  points: z.coerce.number().int().min(1).max(50000).optional()
});

const referralBoostSchema = z.object({
  sessionId: sessionIdSchema,
  mult: z.coerce.number().int().min(1).max(10).default(3)
});

const spinUnlockSchema = z.object({
  sessionId: sessionIdSchema,
  type: z.enum(["invite", "share"])
});

const spinRollSchema = z.object({
  sessionId: sessionIdSchema
});

const penaltyStartSchema = z.object({
  sessionId: sessionIdSchema,
  mode: z.enum(["solo", "pvp"]).default("solo")
});

const penaltyShotSchema = z.object({
  sessionId: sessionIdSchema,
  matchId: z.string().trim().min(1),
  actor: z.enum(["me", "opp"]),
  onTarget: z.boolean().optional(),
  keeperCovered: z.boolean().optional(),
  auto: z.boolean().optional()
});

const penaltyFinalizeSchema = z.object({
  sessionId: sessionIdSchema,
  matchId: z.string().trim().min(1)
});

const quizAnswerSchema = z.object({
  sessionId: sessionIdSchema,
  index: z.coerce.number().int().min(0).max(200),
  choice: z.coerce.number().int().min(0).max(30)
});

const quizFinalizeSchema = z.object({
  sessionId: sessionIdSchema
});

function economyView(kick: number, dailyEarned: number) {
  return {
    kick,
    dailyEarned
  };
}

function boostsView(view: ReturnType<typeof sessionView>) {
  return {
    quizBoostMult: view.quizBoostMult,
    refBoostMult: view.refBoostMult
  };
}

type EarnCatalogTone = "g" | "y" | "b" | "r";

interface EarnCatalogCategory {
  id: string;
  icon: string;
  title: string;
  totalLabel: string;
  tone: EarnCatalogTone;
}

interface EarnCatalogTask {
  id: string;
  categoryId: string;
  icon: string;
  name: string;
  description: string;
  points: number;
  actionLabel: string;
  tone: EarnCatalogTone;
  phase: string;
  capPerDay: number | null;
}

const categoryMetaMap: Record<string, { icon: string; title: string; tone: EarnCatalogTone }> = {
  telegram: { icon: "📣", title: "Telegram", tone: "g" },
  x: { icon: "🐦", title: "Twitter / X", tone: "y" },
  meta: { icon: "📸", title: "Facebook / Instagram", tone: "b" },
  youtube: { icon: "▶️", title: "YouTube", tone: "r" },
  tiktok: { icon: "🎬", title: "TikTok", tone: "y" },
  growth: { icon: "🚀", title: "Growth Actions", tone: "g" },
  amplification: { icon: "📢", title: "Amplification", tone: "b" },
  daily: { icon: "✅", title: "Daily Tasks", tone: "g" }
};

const categoryOrder = ["telegram", "x", "meta", "youtube", "tiktok", "growth", "amplification", "daily"] as const;

function safeSlug(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "daily";
}

function normalizeCategoryId(rawCategory: string, code: string): string {
  const category = rawCategory.toLowerCase();
  const taskCode = code.toLowerCase();
  const merged = `${category} ${taskCode}`;

  if (merged.includes("telegram") || merged.includes("tg-") || merged.includes(" tg")) return "telegram";
  if (merged.includes("twitter") || merged.includes(" x") || merged.startsWith("x-")) return "x";
  if (merged.includes("facebook") || merged.includes("instagram") || merged.includes("meta")) return "meta";
  if (merged.includes("youtube") || merged.includes("yt-")) return "youtube";
  if (merged.includes("tiktok") || merged.includes("tt-")) return "tiktok";
  if (merged.includes("invite") || merged.includes("referral") || merged.includes("growth")) return "growth";
  if (merged.includes("amplification") || merged.includes("share")) return "amplification";
  if (merged.includes("daily")) return "daily";

  return safeSlug(rawCategory);
}

function categoryMeta(categoryId: string): { icon: string; title: string; tone: EarnCatalogTone } {
  const known = categoryMetaMap[categoryId];
  if (known) return known;

  const title = categoryId
    .split("-")
    .filter((chunk) => chunk.length > 0)
    .map((chunk) => chunk[0].toUpperCase() + chunk.slice(1))
    .join(" ");
  return {
    icon: "🎯",
    title: title || "Tasks",
    tone: "g"
  };
}

function inferActionLabel(code: string, name: string): string {
  const text = `${code} ${name}`.toLowerCase();
  if (text.includes("retweet")) return "RT";
  if (text.includes("follow")) return "FOLLOW";
  if (text.includes("join")) return "JOIN";
  if (text.includes("invite")) return "INVITE";
  if (text.includes("comment")) return "COMMENT";
  if (text.includes("watch")) return "WATCH";
  if (text.includes("share")) return "SHARE";
  if (text.includes("vote")) return "VOTE";
  if (text.includes("create")) return "CREATE";
  if (text.includes("post")) return "POST";
  return "CLAIM";
}

function inferTaskIcon(code: string, name: string, fallbackIcon: string): string {
  const text = `${code} ${name}`.toLowerCase();
  if (text.includes("retweet")) return "🔁";
  if (text.includes("follow")) return "👤";
  if (text.includes("join") && text.includes("group")) return "💬";
  if (text.includes("join") && text.includes("channel")) return "🌐";
  if (text.includes("join")) return "📣";
  if (text.includes("invite")) return "👥";
  if (text.includes("comment")) return "🗨️";
  if (text.includes("watch")) return "⏱️";
  if (text.includes("share")) return "📤";
  if (text.includes("vote")) return "🗳️";
  if (text.includes("create")) return "🎥";
  if (text.includes("post")) return "📝";
  return fallbackIcon;
}

export const appGameRoutes: FastifyPluginAsync = async (app) => {
  app.get("/health", async () => ({ ok: true, service: "wc26-app-game" }));

  app.post("/api/session/init", async (request) => {
    const body = initSessionBodySchema.parse(request.body ?? {});
    const session = await getOrCreateGameSession(app.prisma, body.sessionId ?? null);
    ensureToday(session.state);
    await persistGameSession(app.prisma, session);
    return {
      ok: true,
      state: sessionView(session.state)
    };
  });

  app.post("/api/session/sync", async (request) => {
    const body = syncSessionBodySchema.parse(request.body ?? {});
    const session = await getOrCreateGameSession(app.prisma, body.sessionId);
    ensureToday(session.state);
    await persistGameSession(app.prisma, session);
    return {
      ok: true,
      state: sessionView(session.state)
    };
  });

  app.get("/api/referral/state", async (request, reply) => {
    const query = querySessionSchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({ ok: false, error: "invalid_session" });
    }
    const session = await getOrCreateGameSession(app.prisma, query.data.sessionId);
    ensureToday(session.state);
    await persistGameSession(app.prisma, session);
    return {
      ok: true,
      referral: sessionView(session.state).referral
    };
  });

  app.post("/api/referral/boost", async (request) => {
    const body = referralBoostSchema.parse(request.body ?? {});
    const session = await getOrCreateGameSession(app.prisma, body.sessionId);
    ensureToday(session.state);

    const today = dayKey();
    session.state.referral.boostDay = today;
    session.state.referral.boostMult = Math.max(session.state.referral.boostMult || 1, body.mult);

    await persistGameSession(app.prisma, session);
    return {
      ok: true,
      referral: sessionView(session.state).referral
    };
  });

  app.get("/api/earn/tasks/state", async (request, reply) => {
    const query = querySessionSchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({ ok: false, error: "invalid_session" });
    }
    const session = await getOrCreateGameSession(app.prisma, query.data.sessionId);
    ensureToday(session.state);
    await persistGameSession(app.prisma, session);
    const view = sessionView(session.state);
    return {
      ok: true,
      earn: view.earn,
      economy: economyView(session.state.kick, session.state.economy.dailyEarned)
    };
  });

  app.get("/api/earn/tasks/catalog", async () => {
    const [missions, channels] = await Promise.all([
      app.prisma.mission.findMany({
        where: { isActive: true },
        orderBy: [{ category: "asc" }, { rewardKick: "desc" }, { createdAt: "asc" }]
      }),
      app.prisma.socialChannel.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
      })
    ]);

    const tasks: EarnCatalogTask[] = missions.map((mission) => {
      const categoryId = normalizeCategoryId(mission.category, mission.code);
      const meta = categoryMeta(categoryId);
      const descriptionParts = [mission.phase];
      if (mission.capPerDay !== null) {
        descriptionParts.push(`CAP/day ${mission.capPerDay}`);
      }
      return {
        id: mission.code,
        categoryId,
        icon: inferTaskIcon(mission.code, mission.name, meta.icon),
        name: mission.name,
        description: descriptionParts.join(" · "),
        points: mission.rewardKick,
        actionLabel: inferActionLabel(mission.code, mission.name),
        tone: meta.tone,
        phase: mission.phase,
        capPerDay: mission.capPerDay
      };
    });

    const totalByCategory = new Map<string, number>();
    for (const task of tasks) {
      totalByCategory.set(task.categoryId, (totalByCategory.get(task.categoryId) ?? 0) + task.points);
    }

    const categoryIds = [...new Set(tasks.map((task) => task.categoryId))];
    categoryIds.sort((left, right) => {
      const leftIndex = categoryOrder.indexOf(left as (typeof categoryOrder)[number]);
      const rightIndex = categoryOrder.indexOf(right as (typeof categoryOrder)[number]);
      const leftRank = leftIndex === -1 ? 999 : leftIndex;
      const rightRank = rightIndex === -1 ? 999 : rightIndex;
      if (leftRank !== rightRank) return leftRank - rightRank;
      return left.localeCompare(right);
    });

    const categories: EarnCatalogCategory[] = categoryIds.map((categoryId) => {
      const meta = categoryMeta(categoryId);
      const total = totalByCategory.get(categoryId) ?? 0;
      return {
        id: categoryId,
        icon: meta.icon,
        title: meta.title,
        totalLabel: `+${total.toLocaleString("en-US")} KICK`,
        tone: meta.tone
      };
    });

    return {
      ok: true,
      categories,
      tasks,
      channels: channels.map((channel) => ({
        id: channel.id,
        platform: channel.platform,
        name: channel.name,
        url: channel.url,
        icon: channel.icon ?? "🔗",
        tasks: channel.tasks,
        kick: channel.kick
      }))
    };
  });

  app.post("/api/earn/tasks/claim", async (request, reply) => {
    const body = earnClaimSchema.parse(request.body ?? {});
    const session = await getOrCreateGameSession(app.prisma, body.sessionId);
    ensureToday(session.state);

    const mission = await app.prisma.mission.findFirst({
      where: {
        code: body.taskId,
        isActive: true
      }
    });
    const taskPoints = mission?.rewardKick ?? body.points ?? 0;
    if (taskPoints <= 0) {
      return reply.status(400).send({ ok: false, error: "task_not_found" });
    }

    const alreadyClaimed = Boolean(session.state.earn.claimedTasks[body.taskId]);
    let appliedKick = 0;
    if (!alreadyClaimed) {
      session.state.earn.claimedTasks[body.taskId] = Date.now();
      appliedKick = earnApplyKick(session.state, taskPoints);
    }

    await persistGameSession(
      app.prisma,
      session,
      appliedKick !== 0
        ? {
            delta: appliedKick,
            reason: `earn:${body.taskId}`,
            source: "earn_task"
          }
        : undefined
    );

    if (!alreadyClaimed && appliedKick > 0 && mission) {
      await app.prisma.missionProgress.create({
        data: {
          missionId: mission.id,
          userId: session.user.id,
          status: "completed",
          progress: 100,
          awardedKick: appliedKick
        }
      });
    }

    const view = sessionView(session.state);
    return {
      ok: true,
      taskId: body.taskId,
      alreadyClaimed,
      appliedKick,
      earn: view.earn,
      economy: economyView(session.state.kick, session.state.economy.dailyEarned)
    };
  });

  app.get("/api/quiz/daily", async (request, reply) => {
    const query = querySessionSchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({ ok: false, error: "invalid_session" });
    }
    const session = await getOrCreateGameSession(app.prisma, query.data.sessionId);
    ensureToday(session.state);
    await persistGameSession(app.prisma, session);

    const today = dayKey();
    const doneToday = session.state.quiz.lastQuizDay === today;
    const answered = session.state.quiz.answers || {};
    const score = Object.values(answered).filter((answer) => answer.correct).length;

    return {
      ok: true,
      quiz: {
        day: today,
        doneToday,
        streak: session.state.quiz.streak,
        quizBoostMult: session.state.quiz.boostDay === today ? session.state.quiz.boostMult : 1,
        score,
        answeredCount: Object.keys(answered).length,
        questions: session.state.quiz.questions.map((question, index) => quizClientQuestion(question, index))
      },
      economy: economyView(session.state.kick, session.state.economy.dailyEarned)
    };
  });

  app.post("/api/quiz/answer", async (request, reply) => {
    const body = quizAnswerSchema.parse(request.body ?? {});
    const session = await getOrCreateGameSession(app.prisma, body.sessionId);
    ensureToday(session.state);

    if (body.index < 0 || body.index >= session.state.quiz.questions.length) {
      return reply.status(400).send({ ok: false, error: "invalid_index" });
    }

    const question = session.state.quiz.questions[body.index];
    const prevAnswer = session.state.quiz.answers[body.index];
    if (prevAnswer) {
      const previousScore = Object.values(session.state.quiz.answers).filter((answer) => answer.correct).length;
      return {
        ok: true,
        result: {
          index: body.index,
          correct: Boolean(prevAnswer.correct),
          correctIndex: question.correct,
          deltaApplied: 0,
          alreadyAnswered: true,
          score: previousScore,
          answeredCount: Object.keys(session.state.quiz.answers).length
        },
        economy: economyView(session.state.kick, session.state.economy.dailyEarned)
      };
    }

    const isCorrect = body.choice === question.correct;
    const today = dayKey();
    const doneToday = session.state.quiz.lastQuizDay === today;
    const boost =
      session.state.quiz.boostDay === today ? Math.max(1, session.state.quiz.boostMult || 1) : 1;

    let deltaApplied = 0;
    if (isCorrect && !doneToday) {
      deltaApplied = applyKick(session.state, question.pts * boost);
    }

    session.state.quiz.answers[body.index] = {
      choice: body.choice,
      correct: isCorrect,
      answeredAt: Date.now()
    };

    await persistGameSession(
      app.prisma,
      session,
      deltaApplied !== 0
        ? {
            delta: deltaApplied,
            reason: `quiz:${question.id}`,
            source: "quiz"
          }
        : undefined
    );

    const score = Object.values(session.state.quiz.answers).filter((answer) => answer.correct).length;
    return {
      ok: true,
      result: {
        index: body.index,
        correct: isCorrect,
        correctIndex: question.correct,
        deltaApplied,
        score,
        answeredCount: Object.keys(session.state.quiz.answers).length,
        doneToday
      },
      economy: economyView(session.state.kick, session.state.economy.dailyEarned)
    };
  });

  app.post("/api/quiz/finalize", async (request, reply) => {
    const body = quizFinalizeSchema.parse(request.body ?? {});
    const session = await getOrCreateGameSession(app.prisma, body.sessionId);
    ensureToday(session.state);

    const today = dayKey();
    const answeredCount = Object.keys(session.state.quiz.answers || {}).length;
    const requiredCount = session.state.quiz.questions.length;
    const completedToday = answeredCount >= requiredCount;
    let bonusApplied = 0;

    if (completedToday && session.state.quiz.lastQuizDay !== today) {
      const prev = session.state.quiz.lastQuizDay;
      if (prev && dayDiff(prev, today) === 1) session.state.quiz.streak += 1;
      else session.state.quiz.streak = 1;

      session.state.quiz.lastQuizDay = today;
      let bonus = 0;
      if (session.state.quiz.streak === 3) bonus = 50;
      else if (session.state.quiz.streak === 7) bonus = 150;
      else if (session.state.quiz.streak === 14) bonus = 300;
      if (bonus > 0) bonusApplied = applyKick(session.state, bonus);
    }

    await persistGameSession(
      app.prisma,
      session,
      bonusApplied !== 0
        ? {
            delta: bonusApplied,
            reason: "quiz:streak_bonus",
            source: "quiz"
          }
        : undefined
    );

    return {
      ok: true,
      quiz: {
        doneToday: completedToday && session.state.quiz.lastQuizDay === today,
        completedToday,
        answeredCount,
        requiredCount,
        streak: session.state.quiz.streak,
        bonusApplied
      },
      economy: economyView(session.state.kick, session.state.economy.dailyEarned)
    };
  });

  app.get("/api/spin/state", async (request, reply) => {
    const query = querySessionSchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({ ok: false, error: "invalid_session" });
    }
    const session = await getOrCreateGameSession(app.prisma, query.data.sessionId);
    ensureToday(session.state);
    await persistGameSession(app.prisma, session);

    const view = sessionView(session.state);
    return {
      ok: true,
      spin: view.spin,
      boosts: boostsView(view),
      economy: economyView(session.state.kick, session.state.economy.dailyEarned)
    };
  });

  app.post("/api/spin/unlock", async (request, reply) => {
    const body = spinUnlockSchema.parse(request.body ?? {});
    const session = await getOrCreateGameSession(app.prisma, body.sessionId);
    ensureToday(session.state);

    const hardCap = Math.max(1, Math.floor(Number(session.state.spin.cap || DEFAULT_SPIN_DAILY_CAP)));
    if (spinCap(session.state) >= hardCap) {
      return reply.status(409).send({ ok: false, error: "spin_cap_reached" });
    }

    if (body.type === "invite") session.state.spin.invite += 1;
    if (body.type === "share") session.state.spin.share += 1;

    await persistGameSession(app.prisma, session);
    return {
      ok: true,
      spin: sessionView(session.state).spin
    };
  });

  app.post("/api/spin/roll", async (request, reply) => {
    const body = spinRollSchema.parse(request.body ?? {});
    const session = await getOrCreateGameSession(app.prisma, body.sessionId);
    ensureToday(session.state);

    if (spinLeft(session.state) <= 0) {
      return reply.status(409).send({ ok: false, error: "no_spins_left" });
    }

    session.state.spin.used += 1;
    const reward = pickSpinReward();
    const today = dayKey();
    let deltaApplied = 0;

    if (reward.type === "kick") {
      deltaApplied = applyKick(session.state, reward.value);
    } else if (reward.type === "quiz_boost") {
      session.state.quiz.boostDay = today;
      session.state.quiz.boostMult = Math.max(2, session.state.quiz.boostMult || 1);
    } else if (reward.type === "ref_boost") {
      session.state.referral.boostDay = today;
      session.state.referral.boostMult = Math.max(3, session.state.referral.boostMult || 1);
    } else if (reward.type === "ticket") {
      session.state.spin.tickets += 1;
    }

    await persistGameSession(
      app.prisma,
      session,
      deltaApplied !== 0
        ? {
            delta: deltaApplied,
            reason: `spin:${reward.id}`,
            source: "spin"
          }
        : undefined
    );

    const view = sessionView(session.state);
    return {
      ok: true,
      reward,
      deltaApplied,
      spin: view.spin,
      boosts: boostsView(view),
      economy: economyView(session.state.kick, session.state.economy.dailyEarned)
    };
  });

  app.get("/api/penalty/daily", async (request, reply) => {
    const query = querySessionSchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({ ok: false, error: "invalid_session" });
    }
    const session = await getOrCreateGameSession(app.prisma, query.data.sessionId);
    ensureToday(session.state);
    await persistGameSession(app.prisma, session);

    return {
      ok: true,
      penalty: sessionView(session.state).penalty,
      economy: economyView(session.state.kick, session.state.economy.dailyEarned)
    };
  });

  app.post("/api/penalty/start", async (request, reply) => {
    const body = penaltyStartSchema.parse(request.body ?? {});
    const session = await getOrCreateGameSession(app.prisma, body.sessionId);
    ensureToday(session.state);

    const mode = body.mode;
    let entryFeeApplied = 0;
    const soloShotRateNow = getSoloShotRate(session.state.penalty.soloPlays);

    if (mode === "solo") {
      const freeLeft = Math.max(0, 3 - session.state.penalty.soloPlays);
      if (freeLeft <= 0) {
        if (session.state.kick < 500) {
          return reply.status(409).send({ ok: false, error: "insufficient_kick_for_solo_entry" });
        }
        entryFeeApplied = applyKick(session.state, -500);
      }
      session.state.penalty.soloPlays += 1;
    }

    const matchId = randomUUID();
    const match: PenaltyMatchState = {
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
    session.state.penalty.matches[matchId] = match;

    await persistGameSession(
      app.prisma,
      session,
      entryFeeApplied !== 0
        ? {
            delta: entryFeeApplied,
            reason: "penalty:solo_entry",
            source: "penalty"
          }
        : undefined
    );

    return {
      ok: true,
      match: {
        matchId,
        mode,
        meFirst: match.meFirst,
        suddenActive: false,
        meScore: 0,
        oppScore: 0,
        myIdx: 0,
        oppIdx: 0,
        soloShotRateNow
      },
      entryFeeApplied,
      penalty: sessionView(session.state).penalty,
      economy: economyView(session.state.kick, session.state.economy.dailyEarned)
    };
  });

  app.post("/api/penalty/shot", async (request, reply) => {
    const body = penaltyShotSchema.parse(request.body ?? {});
    const session = await getOrCreateGameSession(app.prisma, body.sessionId);
    ensureToday(session.state);

    const match = session.state.penalty.matches[body.matchId];
    if (!match) {
      return reply.status(404).send({ ok: false, error: "match_not_found" });
    }

    penaltyEvaluate(match);
    if (match.done) {
      return reply.status(409).send({ ok: false, error: "match_already_done" });
    }

    const expected = penaltyExpectedActor(match);
    if (expected && expected !== body.actor) {
      return reply.status(409).send({
        ok: false,
        error: "wrong_turn",
        expectedActor: expected
      });
    }

    const maxShots = penaltyMaxShots(match);
    if (body.actor === "me" && match.myIdx >= maxShots) {
      return reply.status(409).send({ ok: false, error: "my_shots_exhausted" });
    }
    if (body.actor === "opp" && match.oppIdx >= maxShots) {
      return reply.status(409).send({ ok: false, error: "opp_shots_exhausted" });
    }

    const onTarget = Boolean(body.onTarget);
    const keeperCovered = Boolean(body.keeperCovered);
    const auto = Boolean(body.auto);
    let scored = false;

    if (body.actor === "me") {
      if (match.mode === "solo") scored = onTarget && Math.random() < match.soloShotRate;
      else scored = onTarget;
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
    await persistGameSession(app.prisma, session);

    return {
      ok: true,
      shot: {
        actor: body.actor,
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
    };
  });

  app.post("/api/penalty/finalize", async (request, reply) => {
    const body = penaltyFinalizeSchema.parse(request.body ?? {});
    const session = await getOrCreateGameSession(app.prisma, body.sessionId);
    ensureToday(session.state);

    const match = session.state.penalty.matches[body.matchId];
    if (!match) {
      return reply.status(404).send({ ok: false, error: "match_not_found" });
    }

    penaltyEvaluate(match);
    let result: "win" | "loss" | "draw" = "draw";
    if (match.meScore > match.oppScore) result = "win";
    else if (match.meScore < match.oppScore) result = "loss";

    let delta = 0;
    if (result === "win") delta = 2000;
    else if (result === "loss" && match.mode === "pvp") delta = -2500;
    const deltaApplied = delta === 0 ? 0 : applyKick(session.state, delta);
    delete session.state.penalty.matches[body.matchId];

    await persistGameSession(
      app.prisma,
      session,
      deltaApplied !== 0
        ? {
            delta: deltaApplied,
            reason: `penalty:${result}`,
            source: "penalty"
          }
        : undefined
    );

    return {
      ok: true,
      result,
      deltaApplied,
      final: {
        meScore: match.meScore,
        oppScore: match.oppScore,
        mode: match.mode
      },
      penalty: sessionView(session.state).penalty,
      economy: economyView(session.state.kick, session.state.economy.dailyEarned)
    };
  });
};
