export const DAILY_KICK_CAP = 2500;
export const TASK_KICK_CAP = 15000;
export const DEFAULT_SPIN_DAILY_CAP = 10;

export const QUIZ_RULES = { easy: 2, medium: 2, hard: 1 };

export const SPIN_REWARDS = [
  { id: "k50", label: "50 KICK", chance: 30, type: "kick", value: 50 },
  { id: "k100", label: "100 KICK", chance: 25, type: "kick", value: 100 },
  { id: "k200", label: "200 KICK", chance: 10, type: "kick", value: 200 },
  { id: "q2x", label: "2x Quiz today", chance: 10, type: "quiz_boost", value: 2 },
  { id: "r3x", label: "3x Referral today", chance: 5, type: "ref_boost", value: 3 },
  { id: "ticket", label: "Rising Box Ticket", chance: 5, type: "ticket", value: 1 },
  { id: "nothing", label: "Nothing", chance: 15, type: "none", value: 0 }
];

export const QUIZ_BANK = [
  {
    id: "q-e-1",
    diff: "easy",
    pts: 50,
    text: "Who won the FIFA World Cup in 2018?",
    opts: ["France", "Croatia", "Brazil", "Germany"],
    correct: 0
  },
  {
    id: "q-e-2",
    diff: "easy",
    pts: 50,
    text: "Which country hosted the FIFA World Cup in 2022?",
    opts: ["Qatar", "Russia", "Brazil", "South Africa"],
    correct: 0
  },
  {
    id: "q-e-3",
    diff: "easy",
    pts: 50,
    text: "Lionel Messi represents which country?",
    opts: ["Argentina", "Spain", "Portugal", "Uruguay"],
    correct: 0
  },
  {
    id: "q-e-4",
    diff: "easy",
    pts: 50,
    text: "Kylian Mbappe represents which country?",
    opts: ["France", "Belgium", "England", "Germany"],
    correct: 0
  },
  {
    id: "q-e-5",
    diff: "easy",
    pts: 50,
    text: "Which nation has won the most FIFA World Cup titles?",
    opts: ["Brazil", "Germany", "Italy", "Argentina"],
    correct: 0
  },

  {
    id: "q-m-1",
    diff: "medium",
    pts: 100,
    text: "Which team won UEFA Euro 2024?",
    opts: ["Spain", "England", "France", "Italy"],
    correct: 0
  },
  {
    id: "q-m-2",
    diff: "medium",
    pts: 100,
    text: "Which team won Copa America 2021?",
    opts: ["Argentina", "Brazil", "Uruguay", "Chile"],
    correct: 0
  },
  {
    id: "q-m-3",
    diff: "medium",
    pts: 100,
    text: "Who won the UEFA Champions League in 2023-24?",
    opts: ["Real Madrid", "Manchester City", "Inter", "Bayern Munich"],
    correct: 0
  },
  {
    id: "q-m-4",
    diff: "medium",
    pts: 100,
    text: "What is the listed position of Kevin De Bruyne?",
    opts: ["Midfielder", "Forward", "Defender", "Goalkeeper"],
    correct: 0
  },
  {
    id: "q-m-5",
    diff: "medium",
    pts: 100,
    text: "Which nation won FIFA World Cup 2014?",
    opts: ["Germany", "Argentina", "Brazil", "Spain"],
    correct: 0
  },

  {
    id: "q-h-1",
    diff: "hard",
    pts: 200,
    text: "Who holds the record for most FIFA World Cup goals?",
    opts: ["Miroslav Klose", "Ronaldo Nazario", "Lionel Messi", "Kylian Mbappe"],
    correct: 0
  },
  {
    id: "q-h-2",
    diff: "hard",
    pts: 200,
    text: "How many FIFA World Cup titles does Brazil have?",
    opts: ["5", "4", "6", "3"],
    correct: 0
  },
  {
    id: "q-h-3",
    diff: "hard",
    pts: 200,
    text: "Which one is a club competition (not national teams)?",
    opts: ["UEFA Champions League", "FIFA World Cup", "UEFA Euro", "Copa America"],
    correct: 0
  },
  {
    id: "q-h-4",
    diff: "hard",
    pts: 200,
    text: "How many World Cup titles does Argentina have?",
    opts: ["3", "2", "4", "1"],
    correct: 0
  },
  {
    id: "q-h-5",
    diff: "hard",
    pts: 200,
    text: "How many World Cup titles does France have?",
    opts: ["2", "1", "3", "4"],
    correct: 0
  }
];
