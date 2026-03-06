import { readJson, writeJson } from "../http.js";
import { applyKick, dayDiff, dayKey, getSession, quizClientQuestion } from "../state.js";

function economyView(session) {
  return {
    kick: session.kick,
    dailyEarned: session.economy.dailyEarned
  };
}

export function getQuizDaily(res, url) {
  const session = getSession(url.searchParams.get("sessionId"));
  if (!session) {
    writeJson(res, 400, { ok: false, error: "invalid_session" });
    return;
  }

  const today = dayKey();
  const doneToday = session.quiz.lastQuizDay === today;
  const answered = session.quiz.answers || {};
  const score = Object.values(answered).filter((answer) => answer.correct).length;

  writeJson(res, 200, {
    ok: true,
    quiz: {
      day: today,
      doneToday,
      streak: session.quiz.streak,
      quizBoostMult: session.quiz.boostDay === today ? session.quiz.boostMult : 1,
      score,
      answeredCount: Object.keys(answered).length,
      questions: session.quiz.questions.map((question, index) =>
        quizClientQuestion(question, index)
      )
    },
    economy: economyView(session)
  });
}

export async function postQuizAnswer(req, res) {
  const body = await readJson(req);
  const session = getSession(body.sessionId);
  if (!session) {
    writeJson(res, 400, { ok: false, error: "invalid_session" });
    return;
  }

  const index = Math.floor(Number(body.index));
  const choice = Math.floor(Number(body.choice));
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= session.quiz.questions.length
  ) {
    writeJson(res, 400, { ok: false, error: "invalid_index" });
    return;
  }

  const question = session.quiz.questions[index];
  const prevAnswer = session.quiz.answers[index];
  if (prevAnswer) {
    const previousScore = Object.values(session.quiz.answers).filter(
      (answer) => answer.correct
    ).length;
    writeJson(res, 200, {
      ok: true,
      result: {
        index,
        correct: !!prevAnswer.correct,
        correctIndex: question.correct,
        deltaApplied: 0,
        alreadyAnswered: true,
        score: previousScore,
        answeredCount: Object.keys(session.quiz.answers).length
      },
      economy: economyView(session)
    });
    return;
  }

  const isCorrect = choice === question.correct;
  const today = dayKey();
  const doneToday = session.quiz.lastQuizDay === today;
  const boost = session.quiz.boostDay === today ? Math.max(1, session.quiz.boostMult || 1) : 1;

  let deltaApplied = 0;
  if (isCorrect && !doneToday) {
    deltaApplied = applyKick(session, question.pts * boost);
  }

  session.quiz.answers[index] = {
    choice,
    correct: isCorrect,
    answeredAt: Date.now()
  };

  const score = Object.values(session.quiz.answers).filter((answer) => answer.correct).length;
  writeJson(res, 200, {
    ok: true,
    result: {
      index,
      correct: isCorrect,
      correctIndex: question.correct,
      deltaApplied,
      score,
      answeredCount: Object.keys(session.quiz.answers).length,
      doneToday
    },
    economy: economyView(session)
  });
}

export async function postQuizFinalize(req, res) {
  const body = await readJson(req);
  const session = getSession(body.sessionId);
  if (!session) {
    writeJson(res, 400, { ok: false, error: "invalid_session" });
    return;
  }

  const today = dayKey();
  const answeredCount = Object.keys(session.quiz.answers || {}).length;
  const requiredCount = session.quiz.questions.length;
  const completedToday = answeredCount >= requiredCount;
  let bonusApplied = 0;

  if (completedToday && session.quiz.lastQuizDay !== today) {
    const prev = session.quiz.lastQuizDay;
    if (prev && dayDiff(prev, today) === 1) {
      session.quiz.streak += 1;
    } else {
      session.quiz.streak = 1;
    }

    session.quiz.lastQuizDay = today;

    let bonus = 0;
    if (session.quiz.streak === 3) bonus = 50;
    else if (session.quiz.streak === 7) bonus = 150;
    else if (session.quiz.streak === 14) bonus = 300;

    if (bonus > 0) {
      bonusApplied = applyKick(session, bonus);
    }
  }

  writeJson(res, 200, {
    ok: true,
    quiz: {
      doneToday: completedToday && session.quiz.lastQuizDay === today,
      completedToday,
      answeredCount,
      requiredCount,
      streak: session.quiz.streak,
      bonusApplied
    },
    economy: economyView(session)
  });
}
