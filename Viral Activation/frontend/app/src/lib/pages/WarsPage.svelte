<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { get } from "svelte/store";
  import { NATION_STATS } from "../modules/wars/data";
  import { computeWarPoints, formatKickCompact, formatWarPoint } from "../modules/wars/utils";
  import { applyNationSelection, fetchNationState, fetchPvpOpponents } from "../modules/wars/api";
  import { penaltyStore } from "../stores/penalty.store";
  import { sessionStore } from "../stores/session.store";
  import type { PenaltyActor, PenaltyOpponent } from "../modules/penalty/types";
  import type { AppPage } from "../stores/ui.store";

  export let onNavigate: (page: AppPage) => void = () => {};
  export let view: "wars" | "penalty" = "wars";

  interface QueuePlayer {
    id: string;
    name: string;
    nationCode: string;
    flag: string;
    waitMin: number;
    isAi: boolean;
    aiWinRate: number;
  }

  const rankings = computeWarPoints();
  const maxPoint = rankings[0]?.warPoint ?? 1;

  let selectedNationCode = rankings[0]?.code ?? "BR";
  let currentNationCode = selectedNationCode;
  let lockMessage = "Nation lock: switch nation only after 7 days.";
  let nationCanChange = true;
  let isApplyingNation = false;

  let queuePlayers: QueuePlayer[] = [];
  let selectedQueueId = "";
  let queueSource: "realtime" | "ai_fallback" = "ai_fallback";
  let isQueueLoading = false;
  let queueErrorMessage = "";
  let lastNationSessionId = "";
  let lastQueueSessionId = "";

  let canvasEl: HTMLCanvasElement | null = null;
  let goalPhoto: HTMLImageElement | null = null;
  let goalPhotoReady = false;

  const GOAL_BG_ASSET = "/assets/penalty-goal.png";
  const GOAL_IMG_W = 1536;
  const GOAL_IMG_H = 1024;
  const GOAL_TOP_SRC = 319;
  const GOAL_LINE_SRC = 613;
  const GOAL_LEFT_SRC = 310;
  const GOAL_RIGHT_SRC = 1224;
  const SPOT_X_SRC = 776;
  const SPOT_Y_SRC = 804;

  $: sessionId = $sessionStore.sessionId;
  $: if (sessionId && $penaltyStore.status === "idle") {
    void penaltyStore.refresh(sessionId);
  }
  $: if (sessionId && sessionId !== lastNationSessionId) {
    lastNationSessionId = sessionId;
    void loadNation();
  }
  $: if (sessionId && sessionId !== lastQueueSessionId) {
    lastQueueSessionId = sessionId;
    void refreshQueue();
  }

  $: myNation = rankings.find((nation) => nation.code === selectedNationCode) ?? rankings[0];
  $: myRank = Math.max(1, rankings.findIndex((nation) => nation.code === selectedNationCode) + 1);
  $: podium = rankings.slice(0, 3);

  $: match = $penaltyStore.match;
  $: expectedActor = match?.expectedActor ?? null;
  $: isArena = $penaltyStore.stage === "arena" && Boolean(match);
  $: isPvp = match?.mode === "pvp";

  function resolveNationFlag(code: string): string {
    const normalized = code.trim().toUpperCase();
    return NATION_STATS.find((nation) => nation.code === normalized)?.flag ?? "🏳️";
  }

  function toQueuePlayer(opponent: PenaltyOpponent): QueuePlayer {
    return {
      id: opponent.id,
      name: opponent.name,
      nationCode: opponent.nationCode,
      flag: opponent.flag || resolveNationFlag(opponent.nationCode),
      waitMin: Math.max(0, Math.floor(Number(opponent.waitMin) || 0)),
      isAi: Boolean(opponent.isAi),
      aiWinRate: Math.max(0, Math.min(1, Number(opponent.aiWinRate ?? 0)))
    };
  }

  function updateNationLockMessage(canChange: boolean, remainingDays: number): void {
    if (canChange) {
      lockMessage = "Nation lock: switch nation only after 7 days.";
      return;
    }
    const safeDays = Math.max(1, Math.ceil(Number(remainingDays) || 0));
    lockMessage = `Nation is locked. You can switch again in ${safeDays} day(s).`;
  }

  async function loadNation(): Promise<void> {
    if (!sessionId) return;
    try {
      const payload = await fetchNationState(sessionId);
      selectedNationCode = payload.nation.code;
      currentNationCode = payload.nation.code;
      nationCanChange = payload.nation.canChange;
      updateNationLockMessage(payload.nation.canChange, payload.nation.remainingDays);
    } catch (error) {
      nationCanChange = true;
      lockMessage =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : "Failed to load nation state.";
    }
  }

  async function refreshQueue(): Promise<void> {
    if (!sessionId) return;
    isQueueLoading = true;
    queueErrorMessage = "";
    try {
      const payload = await fetchPvpOpponents(sessionId);
      queueSource = payload.source;
      queuePlayers = payload.opponents.map(toQueuePlayer);
      selectedQueueId =
        queuePlayers.find((player) => player.id === selectedQueueId)?.id ?? queuePlayers[0]?.id ?? "";
    } catch (error) {
      queueErrorMessage =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : "Failed to load PvP opponent list.";
      queuePlayers = [];
      selectedQueueId = "";
    } finally {
      isQueueLoading = false;
    }
  }

  async function applyNation(): Promise<void> {
    if (!sessionId || isApplyingNation) return;
    isApplyingNation = true;
    try {
      const payload = await applyNationSelection({
        sessionId,
        nationCode: selectedNationCode
      });
      selectedNationCode = payload.nation.code;
      currentNationCode = payload.nation.code;
      nationCanChange = payload.nation.canChange;
      updateNationLockMessage(payload.nation.canChange, payload.nation.remainingDays);
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim().length > 0 ? error.message : "Failed to apply nation.";
      if (message === "nation_locked") {
        nationCanChange = false;
        await loadNation();
      } else {
        lockMessage = message;
      }
    } finally {
      isApplyingNation = false;
    }
  }

  async function startSolo(): Promise<void> {
    if (!sessionId) return;
    await penaltyStore.start(sessionId, "solo");
  }

  async function startPvp(): Promise<void> {
    if (!sessionId) return;
    if (!selectedQueueId && queuePlayers.length === 0) return;
    await penaltyStore.start(sessionId, "pvp", selectedQueueId || undefined);
  }

  async function shoot(onTarget: boolean): Promise<void> {
    if (!sessionId) return;
    await penaltyStore.shoot(sessionId, onTarget);
  }

  async function defend(cover: boolean): Promise<void> {
    if (!sessionId) return;
    await penaltyStore.defend(sessionId, cover);
  }

  function backToLobby(): void {
    penaltyStore.backToLobby();
  }

  interface ArenaPoint {
    x: number;
    y: number;
  }

  interface ArenaParticle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    decay: number;
    r: number;
    color: string;
  }

  interface ArenaBall {
    x: number;
    y: number;
    vx: number;
    vy: number;
    spin: number;
    r: number;
    flying: boolean;
    trail: ArenaPoint[];
    baseY: number;
    netHold: number;
    netX: number;
    netY: number;
  }

  interface ArenaKeeper {
    x: number;
    y: number;
    tx: number;
    lean: number;
    glowColor: string | null;
    glowT: number;
    diveAnim: number;
    diveDir: number;
  }

  interface ArenaStriker {
    x: number;
    y: number;
    kickT: number;
    dir: number;
  }

  interface ArenaFlick {
    on: boolean;
    x0: number;
    y0: number;
    cx: number;
    cy: number;
    t0: number;
  }

  interface ArenaShotFx {
    text: string;
    color: string;
    t: number;
  }

  interface ArenaFlash {
    color: string;
    t: number;
  }

  interface ArenaShotTarget extends ArenaPoint {
    onTarget: boolean;
  }

  interface ArenaState {
    W: number;
    H: number;
    gx: number;
    gy: number;
    gw: number;
    gh: number;
    goalLineY: number;
    spotX: number;
    spotY: number;
    goalDepth: number;
    keeper: ArenaKeeper;
    striker: ArenaStriker;
    ball: ArenaBall;
    flick: ArenaFlick;
    ptcls: ArenaParticle[];
    shotFx: ArenaShotFx;
    flash: ArenaFlash | null;
    netShake: { t: number; amp: number };
    aiTarget: ArenaPoint | null;
    shotTarget: ArenaShotTarget | null;
    matchId: string;
  }

  const arena: ArenaState = {
    W: 0,
    H: 0,
    gx: 0,
    gy: 0,
    gw: 0,
    gh: 0,
    goalLineY: 0,
    spotX: 0,
    spotY: 0,
    goalDepth: 0,
    keeper: { x: 0, y: 0, tx: 0, lean: 0, glowColor: null, glowT: 0, diveAnim: 0, diveDir: 0 },
    striker: { x: 0, y: 0, kickT: 0, dir: 0 },
    ball: {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      spin: 0,
      r: 12,
      flying: false,
      trail: [],
      baseY: 0,
      netHold: 0,
      netX: 0,
      netY: 0
    },
    flick: { on: false, x0: 0, y0: 0, cx: 0, cy: 0, t0: 0 },
    ptcls: [],
    shotFx: { text: "", color: "#fff", t: 0 },
    flash: null,
    netShake: { t: 0, amp: 0 },
    aiTarget: null,
    shotTarget: null,
    matchId: ""
  };

  let arenaRaf = 0;
  let showTurnBanner = false;
  let turnBannerTitle = "YOUR TURN";
  let turnBannerSub = "Flick the ball to shoot";
  let hintVisible = false;
  let hintText = "";
  let hintBottom = ".8%";
  let canShoot = false;
  let actionLocked = false;
  let swipeOrigin: ArenaPoint | null = null;
  let pendingTurnSetup: number | null = null;
  let autoDiveTimer: number | null = null;
  let turnTimers: number[] = [];
  let lastTurnKey = "";
  let turnTransitionLock = false;
  let queuedTurnKey = "";

  const PEN_PACE = {
    startTurn: 850,
    banner: 1300,
    whistleToShoot: 520,
    whistleToAiShot: 700,
    myResolve: 900,
    oppResolve: 760,
    autoDive: 1300,
    betweenTurns: 1500
  } as const;

  function penaltyBgRect(width: number, height: number): { dx: number; dy: number; dw: number; dh: number } {
    const cover = Math.max(width / GOAL_IMG_W, height / GOAL_IMG_H);
    const scale = cover * 0.8;
    const dw = GOAL_IMG_W * scale;
    const dh = GOAL_IMG_H * scale;
    return { dx: (width - dw) * 0.5, dy: (height - dh) * 0.5, dw, dh };
  }

  function syncCanvasSize(): CanvasRenderingContext2D | null {
    if (!canvasEl) return null;
    const ctx = canvasEl.getContext("2d");
    if (!ctx) return null;

    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(280, Math.floor(canvasEl.clientWidth || 0));
    const height = Math.max(320, Math.round(width * 1.18));
    const pixelW = Math.floor(width * dpr);
    const pixelH = Math.floor(height * dpr);

    const changed = arena.W !== width || arena.H !== height || canvasEl.width !== pixelW || canvasEl.height !== pixelH;

    if (changed) {
      arena.W = width;
      arena.H = height;
      canvasEl.style.height = `${height}px`;
      canvasEl.width = pixelW;
      canvasEl.height = pixelH;
      initArenaEntities();
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }

  function initArenaEntities(): void {
    if (!arena.W || !arena.H) return;
    const bg = penaltyBgRect(arena.W, arena.H);
    const scale = bg.dh / GOAL_IMG_H;
    const goalLineY = bg.dy + GOAL_LINE_SRC * scale;
    const spotX = bg.dx + SPOT_X_SRC * scale;
    const spotY = bg.dy + SPOT_Y_SRC * scale;

    arena.gx = bg.dx + GOAL_LEFT_SRC * scale;
    arena.gw = (GOAL_RIGHT_SRC - GOAL_LEFT_SRC) * scale;
    arena.gy = bg.dy + GOAL_TOP_SRC * scale;
    arena.gh = goalLineY - arena.gy;
    arena.goalLineY = goalLineY;
    arena.spotX = spotX;
    arena.spotY = spotY;
    arena.goalDepth = arena.gw * 0.15;

    arena.keeper = {
      x: arena.W * 0.5,
      y: goalLineY - 37.2,
      tx: arena.W * 0.5,
      lean: 0,
      glowColor: null,
      glowT: 0,
      diveAnim: 0,
      diveDir: 0
    };

    arena.striker = { x: arena.W * 0.5, y: spotY + 14, kickT: 0, dir: 0 };
    arena.ball = {
      x: spotX,
      y: spotY,
      vx: 0,
      vy: 0,
      spin: 0,
      r: 12,
      flying: false,
      trail: [],
      baseY: spotY,
      netHold: 0,
      netX: 0,
      netY: 0
    };
    arena.flick = { on: false, x0: 0, y0: 0, cx: 0, cy: 0, t0: 0 };
    arena.ptcls = [];
    arena.shotTarget = null;
    arena.aiTarget = null;
    arena.flash = null;
    arena.netShake = { t: 0, amp: 0 };
    arena.shotFx = { text: "", color: "#fff", t: 0 };
  }

  function resetTurnEntities(): void {
    if (!arena.W || !arena.H) return;

    const bg = penaltyBgRect(arena.W, arena.H);
    const scale = bg.dh / GOAL_IMG_H;
    const goalLineY = bg.dy + GOAL_LINE_SRC * scale;
    const spotX = bg.dx + SPOT_X_SRC * scale;
    const spotY = bg.dy + SPOT_Y_SRC * scale;

    arena.gx = bg.dx + GOAL_LEFT_SRC * scale;
    arena.gw = (GOAL_RIGHT_SRC - GOAL_LEFT_SRC) * scale;
    arena.gy = bg.dy + GOAL_TOP_SRC * scale;
    arena.gh = goalLineY - arena.gy;
    arena.goalLineY = goalLineY;
    arena.spotX = spotX;
    arena.spotY = spotY;
    arena.goalDepth = arena.gw * 0.15;

    arena.striker.y = spotY + 14;
    arena.striker.x = arena.W * 0.5;
    arena.striker.kickT = 0;

    arena.ball.x = spotX;
    arena.ball.y = spotY;
    arena.ball.baseY = spotY;
    arena.ball.vx = 0;
    arena.ball.vy = 0;
    arena.ball.spin = 0;
    arena.ball.flying = false;
    arena.ball.trail = [];
    arena.ball.netHold = 0;
    arena.ball.netX = 0;
    arena.ball.netY = 0;

    arena.keeper.y = goalLineY - 37.2;
    arena.keeper.x = arena.W * 0.5;
    arena.keeper.tx = arena.W * 0.5;
    arena.keeper.lean = 0;
    arena.keeper.glowColor = null;
    arena.keeper.glowT = 0;
    arena.keeper.diveAnim = 0;
    arena.keeper.diveDir = 0;

    arena.aiTarget = null;
    arena.shotTarget = null;
    arena.flick.on = false;
    arena.shotFx.t = 0;
    arena.flash = null;
    arena.netShake.t = 0;
  }

  function clearTurnTimers(): void {
    turnTimers.forEach((timer) => window.clearTimeout(timer));
    turnTimers = [];
    if (pendingTurnSetup !== null) {
      window.clearTimeout(pendingTurnSetup);
      pendingTurnSetup = null;
    }
  }

  function scheduleTimer(callback: () => void, delayMs: number): void {
    const timer = window.setTimeout(() => {
      turnTimers = turnTimers.filter((entry) => entry !== timer);
      callback();
    }, delayMs);
    turnTimers.push(timer);
  }

  function scheduleTurnSetup(delayMs: number): void {
    if (pendingTurnSetup !== null) {
      window.clearTimeout(pendingTurnSetup);
      pendingTurnSetup = null;
    }
    pendingTurnSetup = window.setTimeout(() => {
      pendingTurnSetup = null;
      setupTurnUi();
    }, delayMs);
  }

  function consumeQueuedTurnSetup(delayMs: number): void {
    if (!isArena || turnTransitionLock) return;
    if (queuedTurnKey && queuedTurnKey === turnKey) {
      queuedTurnKey = "";
      scheduleTurnSetup(delayMs);
      return;
    }
    if (turnKey && turnKey !== lastTurnKey) {
      lastTurnKey = turnKey;
      scheduleTurnSetup(delayMs);
    }
  }

  function clearAutoDiveTimer(): void {
    if (autoDiveTimer !== null) {
      window.clearTimeout(autoDiveTimer);
      autoDiveTimer = null;
    }
  }

  function scheduleAutoDive(delayMs: number): void {
    clearAutoDiveTimer();
    autoDiveTimer = window.setTimeout(() => {
      if (!isArena || expectedActor !== "opp" || actionLocked) return;
      void performKeeperDive(0, 0, true);
    }, delayMs);
  }

  function shotResultFromMatch(
    actor: PenaltyActor,
    prevSeqLength: number,
    prevIdx: number
  ): boolean | null {
    const current = get(penaltyStore).match;
    if (!current) return null;

    if (actor === "me") {
      if (current.mySeq.length > prevSeqLength) {
        return current.mySeq[current.mySeq.length - 1] ?? null;
      }
      if (current.myIdx > prevIdx && current.mySeq.length > 0) {
        return current.mySeq[current.mySeq.length - 1];
      }
      return null;
    }

    if (current.oppSeq.length > prevSeqLength) {
      return current.oppSeq[current.oppSeq.length - 1] ?? null;
    }
    if (current.oppIdx > prevIdx && current.oppSeq.length > 0) {
      return current.oppSeq[current.oppSeq.length - 1];
    }
    return null;
  }

  function toCanvasPoint(clientX: number, clientY: number): ArenaPoint | null {
    if (!canvasEl || !arena.W || !arena.H) return null;
    const rect = canvasEl.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const scaleX = arena.W / rect.width;
    const scaleY = arena.H / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  }

  async function performPlayerShot(dx: number, dy: number, dt: number): Promise<void> {
    if (!sessionId || !isArena || !match || expectedActor !== "me" || actionLocked || !canShoot) return;

    actionLocked = true;
    turnTransitionLock = true;
    canShoot = false;
    hintVisible = false;
    clearAutoDiveTimer();

    let speed = Math.min((Math.hypot(dx, dy) / Math.max(dt, 1)) * 260, 1);
    speed = Math.max(speed, 0.3);

    const dragDist = Math.hypot(dx, dy) || 1;
    const nx = dx / dragDist;
    const upRaw = -dy / Math.max(Math.abs(dx) + Math.abs(dy), 1);
    const lift = Math.max(0, Math.min(1, upRaw));
    const intentOnFrame = upRaw > 0.22;

    let tx: number;
    let ty: number;

    if (intentOnFrame) {
      tx =
        arena.W * 0.5 +
        nx * arena.gw * (0.43 + Math.max(0, Math.abs(nx) - 0.55) * 0.22) +
        (Math.random() - 0.5) * arena.gw * 0.05;
      ty = arena.gy + arena.gh * (0.14 + (1 - lift) * 0.66);
    } else {
      tx = arena.W * 0.5 + nx * arena.gw * (0.56 + Math.random() * 0.22);
      ty = arena.gy + arena.gh * (0.82 + Math.random() * 0.35);
    }

    tx = Math.max(arena.gx - arena.gw * 0.2, Math.min(arena.gx + arena.gw * 1.2, tx));
    ty = Math.max(arena.gy - arena.gh * 0.1, Math.min(arena.gy + arena.gh * 1.45, ty));

    const inFrameX = tx >= arena.gx + arena.gw * 0.1 && tx <= arena.gx + arena.gw * 0.9;
    const inFrameY = ty >= arena.gy + arena.gh * 0.14 && ty <= arena.gy + arena.gh * 0.9;
    const shankWide = Math.abs(nx) > 0.9 && lift < 0.6;
    const weakShot = speed < 0.38 && lift < 0.44;
    const onTarget = inFrameX && inFrameY && !shankWide && !weakShot;

    const targetDist = Math.hypot(tx - arena.ball.x, ty - arena.ball.y) || 1;
    const ballSpeed = 14 + speed * 10;
    arena.ball.vx = ((tx - arena.ball.x) / targetDist) * ballSpeed;
    arena.ball.vy = ((ty - arena.ball.y) / targetDist) * ballSpeed;
    arena.ball.spin = nx * speed * 0.17;
    arena.ball.flying = true;
    arena.striker.kickT = 1;
    arena.striker.dir = dx > 0 ? 1 : -1;
    arena.shotTarget = { x: tx, y: ty, onTarget };

    const kdx =
      (Math.random() < 0.55
        ? Math.sign(nx)
        : [-1, -0.45, 0, 0.45, 1][Math.floor(Math.random() * 5)]) * 0.34;
    arena.keeper.tx = arena.W * 0.5 + kdx * arena.gw * 1.15;
    arena.keeper.lean = kdx * 1.1;
    arena.keeper.diveAnim = 1;
    arena.keeper.diveDir = Math.sign(kdx || nx) || 1;

    const prevSeqLength = match.mySeq.length;
    const prevIdx = match.myIdx;
    await penaltyStore.shoot(sessionId, onTarget);
    const scored = shotResultFromMatch("me", prevSeqLength, prevIdx);

    if (scored === null) {
      actionLocked = false;
      turnTransitionLock = false;
      canShoot = true;
      hintVisible = true;
      hintText = "👆 Touch & flick ball to shoot";
      consumeQueuedTurnSetup(0);
      return;
    }

    scheduleTimer(() => {
      resolvePlayerShot(scored);
      scheduleTimer(() => {
        actionLocked = false;
        turnTransitionLock = false;
        consumeQueuedTurnSetup(0);
      }, PEN_PACE.betweenTurns);
    }, PEN_PACE.myResolve);
  }

  async function performKeeperDive(dx: number, _dy: number, auto = false): Promise<void> {
    if (!sessionId || !isArena || !match || expectedActor !== "opp" || actionLocked) return;
    if (!isPvp && !auto) return;

    actionLocked = true;
    turnTransitionLock = true;
    hintVisible = false;
    clearAutoDiveTimer();

    let dir = 0;
    if (!auto && Math.abs(dx) > 12) {
      dir = dx < 0 ? -1 : 1;
    }

    const tx = arena.W * 0.5 + dir * arena.gw * 0.4;
    arena.keeper.tx = tx;
    arena.keeper.lean = dir * 0.7;
    arena.keeper.diveAnim = 1;
    arena.keeper.diveDir = dir;

    const ai = arena.aiTarget ?? { x: arena.W * 0.5, y: arena.gy + arena.gh * 0.42 };
    const keeperCovered = !auto && Math.abs(ai.x - tx) < arena.gw * 0.2;

    const prevSeqLength = match.oppSeq.length;
    const prevIdx = match.oppIdx;
    await penaltyStore.defend(sessionId, keeperCovered, auto);
    const oppScored = shotResultFromMatch("opp", prevSeqLength, prevIdx);

    if (oppScored === null) {
      actionLocked = false;
      turnTransitionLock = false;
      hintVisible = isPvp;
      hintText = "🧤 Swipe to dive & save!";
      if (isPvp) {
        scheduleAutoDive(PEN_PACE.autoDive);
      }
      consumeQueuedTurnSetup(0);
      return;
    }

    scheduleTimer(() => {
      resolveOpponentShot(!oppScored);
      scheduleTimer(() => {
        actionLocked = false;
        turnTransitionLock = false;
        consumeQueuedTurnSetup(0);
      }, PEN_PACE.betweenTurns);
    }, PEN_PACE.oppResolve);
  }

  function startOpponentShot(): void {
    if (!isArena || !match || expectedActor !== "opp" || arena.ball.flying) return;

    const zones: Array<[number, number]> = [
      [arena.gx + arena.gw * 0.12, arena.gy + arena.gh * 0.2],
      [arena.gx + arena.gw * 0.5, arena.gy + arena.gh * 0.15],
      [arena.gx + arena.gw * 0.88, arena.gy + arena.gh * 0.2],
      [arena.gx + arena.gw * 0.2, arena.gy + arena.gh * 0.65],
      [arena.gx + arena.gw * 0.8, arena.gy + arena.gh * 0.65]
    ];
    const target = zones[Math.floor(Math.random() * zones.length)];
    const dist = Math.hypot(target[0] - arena.ball.x, target[1] - arena.ball.y) || 1;
    const speed = 16 + Math.random() * 1.4;

    arena.ball.vx = ((target[0] - arena.ball.x) / dist) * speed;
    arena.ball.vy = ((target[1] - arena.ball.y) / dist) * speed;
    arena.ball.spin = target[0] > arena.ball.x ? 0.08 : -0.08;
    arena.ball.flying = true;
    arena.striker.kickT = 1;
    arena.striker.dir = target[0] > arena.ball.x ? 1 : -1;
    arena.aiTarget = { x: target[0], y: target[1] };
    scheduleAutoDive(PEN_PACE.autoDive);
  }

  function showShotFx(text: string, color: string, duration: number): void {
    arena.shotFx.text = text;
    arena.shotFx.color = color;
    arena.shotFx.t = duration;
  }

  function spawnPtcls(x: number, y: number, col: string): void {
    const cols = [col, "#fff", "#F5C542", "#1FBF6A", "#2979FF"];
    for (let i = 0; i < 45; i += 1) {
      arena.ptcls.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 13,
        vy: (Math.random() - 0.85) * 13,
        life: 1,
        decay: 0.022 + Math.random() * 0.018,
        r: 2 + Math.random() * 4,
        color: cols[Math.floor(Math.random() * cols.length)]
      });
    }
  }

  function goalFlash(kind: "goal-me" | "goal-opp" | "miss"): void {
    let color = "rgba(229,57,53,.2)";
    let isGoal = false;
    if (kind === "goal-me") {
      color = "rgba(31,191,106,.25)";
      isGoal = true;
    }
    if (kind === "goal-opp") {
      color = "rgba(229,57,53,.24)";
      isGoal = true;
    }
    if (kind === "miss") {
      color = "rgba(255,255,255,.08)";
    }
    arena.flash = { color, t: 1 };
    if (isGoal) {
      arena.netShake.t = 1;
      arena.netShake.amp = 1.6;
      spawnPtcls(arena.W * 0.5, arena.H * 0.12, "#F5C542");
    }
  }

  function stickBallInNet(target: ArenaPoint | null): void {
    const tx =
      target && Number.isFinite(target.x) ? target.x : arena.W * 0.5;
    const ty =
      target && Number.isFinite(target.y) ? target.y : arena.gy + arena.gh * 0.44;
    const clampedX = Math.max(arena.gx + arena.gw * 0.2, Math.min(arena.gx + arena.gw * 0.8, tx));
    const center = arena.gx + arena.gw * 0.5;
    const side = (clampedX - center) / (arena.gw * 0.5);
    const netX = clampedX - side * arena.goalDepth * 0.34;
    const netY = Math.max(arena.gy + arena.gh * 0.28, Math.min(arena.gy + arena.gh * 0.88, ty + arena.gh * 0.2));

    arena.ball.netX = netX;
    arena.ball.netY = netY;
    arena.ball.netHold = Date.now() + 1300;
    arena.ball.x = netX;
    arena.ball.y = netY;
    arena.ball.baseY = netY;
    arena.ball.vx = 0;
    arena.ball.vy = 0;
    arena.ball.spin = 0;
    arena.ball.flying = false;
    arena.ball.trail = [];
  }

  function resolvePlayerShot(scored: boolean): void {
    if (scored) {
      stickBallInNet(arena.shotTarget);
      goalFlash("goal-me");
      showShotFx(match?.mode === "pvp" ? "Your Goal!!!" : "Goal!!!", "#F5C542", 1.24);
      spawnPtcls(arena.ball.x, arena.ball.y, "#1FBF6A");
    } else {
      goalFlash("miss");
      showShotFx("Miss Goal!!!", "#FFD6D6", 1.2);
      arena.keeper.glowColor = "#1FBF6A";
      arena.keeper.glowT = 1;
    }
  }

  function resolveOpponentShot(iSaved: boolean): void {
    if (!iSaved) {
      stickBallInNet(arena.aiTarget);
      goalFlash("goal-opp");
      showShotFx(match?.mode === "pvp" ? "Opponent Goal!!!" : "Goal!!!", "#FFB74D", 1.24);
    } else {
      showShotFx("Great Save!!!", "#9FF4C9", 1.26);
      spawnPtcls(arena.keeper.x, arena.keeper.y, "#1FBF6A");
      arena.keeper.glowColor = "#1FBF6A";
      arena.keeper.glowT = 1;
    }
  }

  function onArenaPointerDown(event: PointerEvent): void {
    if (!isArena || !match || actionLocked) return;
    const point = toCanvasPoint(event.clientX, event.clientY);
    if (!point) return;

    if (expectedActor === "me") {
      if (!canShoot || arena.flick.on) return;
      if (Math.hypot(point.x - arena.ball.x, point.y - arena.ball.y) < 60) {
        arena.flick = { on: true, x0: point.x, y0: point.y, cx: point.x, cy: point.y, t0: Date.now() };
        hintVisible = false;
      }
      return;
    }

    if (expectedActor === "opp" && isPvp) {
      swipeOrigin = point;
    }
  }

  function onArenaPointerMove(event: PointerEvent): void {
    if (!arena.flick.on) return;
    const point = toCanvasPoint(event.clientX, event.clientY);
    if (!point) return;
    arena.flick.cx = point.x;
    arena.flick.cy = point.y;
  }

  function onArenaPointerUp(event: PointerEvent): void {
    const point = toCanvasPoint(event.clientX, event.clientY);
    if (arena.flick.on) {
      arena.flick.on = false;
      if (!point) return;
      const dx = point.x - arena.flick.x0;
      const dy = point.y - arena.flick.y0;
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      void performPlayerShot(dx, dy, Date.now() - arena.flick.t0);
      return;
    }

    if (swipeOrigin && point && expectedActor === "opp" && isPvp) {
      const dx = point.x - swipeOrigin.x;
      const dy = point.y - swipeOrigin.y;
      swipeOrigin = null;
      void performKeeperDive(dx, dy, false);
      return;
    }

    swipeOrigin = null;
  }

  function onArenaPointerCancel(): void {
    arena.flick.on = false;
    swipeOrigin = null;
  }

  function updateArena(): void {
    const holdInNet = arena.ball.netHold && Date.now() < arena.ball.netHold;
    if (holdInNet) {
      const jiggle = Math.max(0.12, arena.netShake.t);
      arena.ball.x = arena.ball.netX + Math.sin(Date.now() / 74) * jiggle * 1.6;
      arena.ball.y = arena.ball.netY + Math.cos(Date.now() / 92) * jiggle * 1.1;
    } else if (arena.ball.flying) {
      arena.ball.trail.push({ x: arena.ball.x, y: arena.ball.y });
      if (arena.ball.trail.length > 16) arena.ball.trail.shift();
      arena.ball.x += arena.ball.vx;
      arena.ball.y += arena.ball.vy;
      arena.ball.vy += 0.26;
      arena.ball.vx += arena.ball.spin;
      arena.ball.spin *= 0.97;
      arena.ball.vx *= 0.995;
    } else {
      if (arena.ball.netHold) arena.ball.netHold = 0;
      arena.ball.y = arena.ball.baseY + Math.sin(Date.now() / 380) * 1.2;
    }

    const glide = arena.keeper.diveAnim > 0 ? 0.24 : 0.13;
    arena.keeper.x += (arena.keeper.tx - arena.keeper.x) * glide;
    arena.keeper.lean *= 0.91;
    if (arena.keeper.glowT > 0) arena.keeper.glowT = Math.max(0, arena.keeper.glowT - 0.04);
    if (arena.keeper.diveAnim > 0) arena.keeper.diveAnim = Math.max(0, arena.keeper.diveAnim - 0.03);
    if (arena.striker.kickT > 0) arena.striker.kickT = Math.max(0, arena.striker.kickT - 0.055);
    if (arena.shotFx.t > 0) arena.shotFx.t = Math.max(0, arena.shotFx.t - 0.03);
    if (arena.flash) arena.flash.t = Math.max(0, arena.flash.t - 0.05);
    if (arena.netShake.t > 0) arena.netShake.t = Math.max(0, arena.netShake.t - 0.028);

    arena.ptcls = arena.ptcls.filter((particle) => {
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.vy += 0.3;
      particle.vx *= 0.97;
      particle.life -= particle.decay;
      return particle.life > 0;
    });
  }

  function drawArenaBall(ctx: CanvasRenderingContext2D): void {
    arena.ball.trail.forEach((tail, index) => {
      const alpha = (index / arena.ball.trail.length) * 0.2;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(tail.x, tail.y, arena.ball.r * (index / arena.ball.trail.length) * 0.7, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.fill();
      ctx.restore();
    });

    ctx.save();
    const sy = Math.min(arena.ball.y + arena.ball.r + 4, arena.H * 0.95);
    ctx.globalAlpha = 0.2;
    ctx.beginPath();
    ctx.ellipse(arena.ball.x, sy, arena.ball.r * 1.1, 0.3 * arena.ball.r, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#000";
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.translate(arena.ball.x, arena.ball.y);
    const spinA = arena.ball.flying ? (Date.now() / 100) * Math.sign(arena.ball.vx || 1) : 0;
    ctx.rotate(spinA * 0.06);
    drawBall(ctx, 0, 0, arena.ball.r);
    ctx.restore();
  }

  function drawArena(): void {
    if (!isArena || !match) return;
    const ctx = syncCanvasSize();
    if (!ctx) return;

    ctx.clearRect(0, 0, arena.W, arena.H);
    const bgRect = penaltyBgRect(arena.W, arena.H);
    if (goalPhotoReady && goalPhoto?.complete) {
      ctx.drawImage(goalPhoto, bgRect.dx, bgRect.dy, bgRect.dw, bgRect.dh);
    } else {
      const bg = ctx.createLinearGradient(0, 0, 0, arena.H);
      bg.addColorStop(0, "#081018");
      bg.addColorStop(0.35, "#0f3c1f");
      bg.addColorStop(1, "#0a2e18");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, arena.W, arena.H);
      for (let stripe = 0; stripe < 8; stripe += 1) {
        const sx = stripe * (arena.W / 8);
        ctx.fillStyle = stripe % 2 === 0 ? "rgba(85,150,70,.2)" : "rgba(45,108,42,.2)";
        ctx.fillRect(sx, arena.H * 0.52, arena.W / 8 + 1, arena.H * 0.48);
      }
    }

    ctx.save();
    ctx.lineWidth = Math.max(1.8, arena.W * 0.0045);
    ctx.strokeStyle = "rgba(247,250,255,.92)";
    ctx.beginPath();
    const goalLineY = Number.isFinite(arena.goalLineY) ? arena.goalLineY : arena.keeper.y + 37.2;
    ctx.moveTo(arena.gx, goalLineY);
    ctx.lineTo(arena.gx + arena.gw, goalLineY);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.ellipse(arena.spotX, arena.spotY, 12, 6, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,.18)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(arena.spotX, arena.spotY - 1.5, 8.2, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(245,246,242,.98)";
    ctx.fill();
    ctx.restore();

    if (arena.flash && arena.flash.t > 0) {
      ctx.save();
      ctx.globalAlpha = arena.flash.t;
      ctx.fillStyle = arena.flash.color;
      ctx.fillRect(0, 0, arena.W, arena.H);
      ctx.restore();
    }

    if (arena.shotFx.t > 0) {
      const blink = Math.abs(Math.sin(Date.now() / 95));
      const fade = Math.min(1, arena.shotFx.t / 0.24);
      const alpha = (0.25 + 0.75 * blink) * fade;
      const fontSize = Math.round(Math.max(18, Math.min(33, arena.W * 0.082)));
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `900 ${fontSize}px Montserrat,sans-serif`;
      ctx.lineWidth = Math.max(2, fontSize * 0.11);
      ctx.strokeStyle = "rgba(0,0,0,.58)";
      ctx.strokeText(arena.shotFx.text, arena.W * 0.5, arena.H * 0.21);
      ctx.fillStyle = arena.shotFx.color;
      ctx.fillText(arena.shotFx.text, arena.W * 0.5, arena.H * 0.21);
      ctx.restore();
    }

    const ballInNet = Boolean(arena.ball.netHold && Date.now() < arena.ball.netHold);
    if (arena.flick.on) {
      const adx = arena.flick.x0 - arena.flick.cx;
      const ady = arena.flick.y0 - arena.flick.cy;
      const length = Math.hypot(adx, ady) || 1;
      ctx.save();
      ctx.strokeStyle = "rgba(245,197,66,.5)";
      ctx.lineWidth = 2.5;
      ctx.setLineDash([7, 5]);
      ctx.beginPath();
      ctx.moveTo(arena.ball.x, arena.ball.y);
      ctx.lineTo(
        arena.ball.x + (adx / length) * Math.min(length, 90),
        arena.ball.y + (ady / length) * Math.min(length, 90)
      );
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(245,197,66,.7)";
      ctx.beginPath();
      ctx.arc(arena.flick.cx, arena.flick.cy, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    const diveProgress = 1 - arena.keeper.diveAnim;
    const diveSwing = Math.sin(diveProgress * Math.PI);
    const diveX = arena.keeper.diveDir * arena.W * 0.05 * diveSwing;
    const diveY = arena.H * 0.03 * diveSwing * (arena.keeper.diveAnim > 0 ? 1 : 0);
    const idleShiftX = arena.keeper.diveAnim > 0 ? 0 : Math.sin(Date.now() / 260) * 1.25;
    const idleSway = arena.keeper.diveAnim > 0 ? 0 : Math.sin(Date.now() / 420) * 0.08;
    const trackBall =
      arena.ball.flying && arena.gw > 0
        ? Math.max(-0.08, Math.min(0.08, ((arena.ball.x - arena.W * 0.5) / arena.gw) * 0.22))
        : 0;
    ctx.translate(arena.keeper.x + diveX + idleShiftX, arena.keeper.y - diveY);
    ctx.rotate(arena.keeper.lean + arena.keeper.diveDir * 0.28 * diveSwing + idleSway + trackBall);
    if (arena.keeper.glowT > 0) {
      ctx.shadowColor = arena.keeper.glowColor || "#1FBF6A";
      ctx.shadowBlur = 24 * arena.keeper.glowT;
    }
    drawKeeper(ctx, 0, 0, 1 + arena.keeper.diveAnim * 0.16);
    ctx.restore();

    const ballBehindStriker = !ballInNet && !arena.ball.flying && !arena.ball.netHold;
    if (ballBehindStriker) drawArenaBall(ctx);

    ctx.save();
    ctx.translate(arena.striker.x, arena.striker.y);
    if (arena.striker.kickT > 0) {
      ctx.rotate(-arena.striker.dir * 0.45 * arena.striker.kickT);
    }
    drawStriker(ctx, 0, 0, false);
    ctx.restore();

    if (!ballInNet && !ballBehindStriker) {
      drawArenaBall(ctx);
    }

    if (ballInNet) {
      ctx.save();
      const netShadowY = Math.min(arena.ball.y + arena.ball.r + 2, arena.H * 0.92);
      ctx.globalAlpha = 0.16;
      ctx.beginPath();
      ctx.ellipse(arena.ball.x, netShadowY, arena.ball.r * 1.02, 0.28 * arena.ball.r, 0, 0, Math.PI * 2);
      ctx.fillStyle = "#000";
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.translate(arena.ball.x, arena.ball.y);
      ctx.rotate(Math.sin(Date.now() / 140) * 0.07);
      drawBall(ctx, 0, 0, arena.ball.r);
      ctx.restore();
    }

    arena.ptcls.forEach((particle) => {
      ctx.save();
      ctx.globalAlpha = particle.life;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.r, 0, Math.PI * 2);
      ctx.fillStyle = particle.color;
      ctx.fill();
      ctx.restore();
    });
  }

  function drawStriker(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    small: boolean
  ): void {
    const scale = small ? 0.75 : 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(0, 38, 14, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.ellipse(12, 32, 10, 5, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#333";
    [8, 12, 16].forEach((bx) => ctx.fillRect(bx, 34, 2, 4));
    ctx.fillStyle = "#eee";
    ctx.beginPath();
    ctx.roundRect(7, 24, 8, 10, 3);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(-13, 27, 8, 10, 3);
    ctx.fill();
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.ellipse(-9, 36, 9, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#0d3d22";
    ctx.beginPath();
    ctx.roundRect(-14, 8, 28, 14, 2);
    ctx.fill();
    ctx.fillStyle = "#f0c090";
    ctx.beginPath();
    ctx.roundRect(5, 12, 8, 14, 3);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(-13, 14, 8, 14, 3);
    ctx.fill();

    ctx.fillStyle = "#1FBF6A";
    ctx.beginPath();
    ctx.roundRect(-13, -16, 26, 26, 4);
    ctx.fill();
    ctx.fillStyle = "#17a35a";
    ctx.beginPath();
    ctx.roundRect(-5, -18, 10, 6, 2);
    ctx.fill();
    ctx.fillStyle = "white";
    ctx.font = "bold 9px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("10", 0, -3);

    ctx.fillStyle = "#1FBF6A";
    ctx.save();
    ctx.translate(-13, -8);
    ctx.rotate(0.3);
    ctx.beginPath();
    ctx.roundRect(-3, 0, 7, 14, 3);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = "#1FBF6A";
    ctx.save();
    ctx.translate(13, -8);
    ctx.rotate(-0.5);
    ctx.beginPath();
    ctx.roundRect(-3, 0, 7, 14, 3);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = "#1a0f0b";
    ctx.beginPath();
    ctx.moveTo(-10.4, -22.8);
    ctx.quadraticCurveTo(-9.5, -31.5, 0, -32.3);
    ctx.quadraticCurveTo(9.5, -31.5, 10.4, -22.8);
    ctx.quadraticCurveTo(9.2, -17.2, 4.0, -15.6);
    ctx.quadraticCurveTo(1.5, -14.9, 0, -13.0);
    ctx.quadraticCurveTo(-1.5, -14.9, -4.0, -15.6);
    ctx.quadraticCurveTo(-9.2, -17.2, -10.4, -22.8);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(95,60,42,.26)";
    ctx.beginPath();
    ctx.ellipse(0, -27.4, 6.6, 3.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,.30)";
    ctx.beginPath();
    ctx.ellipse(0, -15.7, 3.0, 1.7, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#e6b786";
    ctx.beginPath();
    ctx.roundRect(-3.2, -15.1, 6.4, 4.9, 1.8);
    ctx.fill();
    ctx.restore();
  }

  function drawKeeper(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    scale: number
  ): void {
    const sc = scale || 1;
    const t = Date.now() / 180;
    const breathe = Math.sin(t) * 0.7;
    const dive = arena.keeper ? arena.keeper.diveAnim : 0;
    const dir = arena.keeper ? arena.keeper.diveDir : 0;
    const swing = Math.sin((1 - dive) * Math.PI);
    const stretch = swing * 0.95;
    const lift = stretch * 2.6;
    const legSpread = 10 + stretch * 7;

    ctx.save();
    ctx.translate(x, y - lift + breathe * 0.2);
    ctx.scale(sc, sc);

    ctx.globalAlpha = 0.23;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(dir * stretch * 2.6, 42, 15 + stretch * 6, 4.2 + stretch * 1.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.fillStyle = "#1d2b57";
    ctx.beginPath();
    ctx.roundRect(-16, 5, 32, 12, 3);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.16)";
    ctx.beginPath();
    ctx.roundRect(-16, 5, 32, 4, 2);
    ctx.fill();

    const leftKneeX = -8 - legSpread * 0.22 - dir * stretch * 1.2;
    const rightKneeX = 8 + legSpread * 0.22 - dir * stretch * 1.2;
    ctx.strokeStyle = "#e8c090";
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-8, 15);
    ctx.lineTo(leftKneeX, 24);
    ctx.lineTo(-12 - legSpread * 0.22, 33);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(8, 15);
    ctx.lineTo(rightKneeX, 24);
    ctx.lineTo(12 + legSpread * 0.22, 33);
    ctx.stroke();

    ctx.strokeStyle = "#f7f8fb";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-12 - legSpread * 0.22, 31.4);
    ctx.lineTo(-12 - legSpread * 0.22, 36.2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(12 + legSpread * 0.22, 31.4);
    ctx.lineTo(12 + legSpread * 0.22, 36.2);
    ctx.stroke();

    ctx.fillStyle = "#141414";
    ctx.beginPath();
    ctx.ellipse(-12 - legSpread * 0.22, 37.2, 8.8, 4.2, 0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(12 + legSpread * 0.22, 37.2, 8.8, 4.2, -0.08, 0, Math.PI * 2);
    ctx.fill();

    const jerseyGradient = ctx.createLinearGradient(0, -19, 0, 15);
    jerseyGradient.addColorStop(0, "#ff9a53");
    jerseyGradient.addColorStop(1, "#ea5a23");
    ctx.fillStyle = jerseyGradient;
    ctx.beginPath();
    ctx.roundRect(-18, -19, 36, 34, 7);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.2)";
    ctx.beginPath();
    ctx.roundRect(-15, -16, 30, 6, 4);
    ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,.16)";
    ctx.beginPath();
    ctx.roundRect(-2, -19, 4, 34, 2);
    ctx.fill();

    ctx.fillStyle = "#fff";
    ctx.font = "900 10px Montserrat,sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("1", 0, -2);

    const divePull = Math.abs(dir) * stretch;
    const baseReach = 8 + stretch * 15;
    const rightReach = baseReach + (dir > 0 ? 10 * divePull : 4 * divePull);
    const leftReach = baseReach + (dir < 0 ? 10 * divePull : 4 * divePull);
    const rightAng = 0.88 + dir * (0.56 * divePull + 0.08) + Math.sin(t * 1.7) * 0.02;
    const leftAng = -0.88 + dir * (0.56 * divePull + 0.08) - Math.sin(t * 1.6) * 0.02;

    const drawArm = (side: -1 | 1, reach: number, angle: number): void => {
      const sx = side < 0 ? -18 : 18;
      const sideSign = side < 0 ? -1 : 1;
      const lead = dir !== 0 && sideSign === dir ? 1 : 0;
      const armShiftX = dir * divePull * (lead ? 10 : 5);
      const armLift = -divePull * (lead ? 2.6 : 1.8);

      ctx.save();
      ctx.translate(sx + armShiftX, -9 + dir * stretch * 1.6 + armLift);
      ctx.rotate(angle);
      ctx.fillStyle = "#f07a32";
      ctx.beginPath();
      ctx.roundRect(-3.4, 0, 7.2, 14 + reach * 0.14, 3.2);
      ctx.fill();
      ctx.fillStyle = "#e8c090";
      ctx.beginPath();
      ctx.roundRect(-2.8, 11 + reach * 0.12, 5.6, 8.6, 2.8);
      ctx.fill();
      ctx.fillStyle = "#ffd54a";
      ctx.beginPath();
      ctx.ellipse(0, 20 + reach * 0.2, 8.3, 6.2, side * 0.18 + dir * 0.24 * divePull, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,.18)";
      ctx.fillRect(-4.6, 18 + reach * 0.2, 9.2, 1.4);
      ctx.restore();
    };

    drawArm(-1, leftReach, leftAng);
    drawArm(1, rightReach, rightAng);

    ctx.fillStyle = "#e8c090";
    ctx.beginPath();
    ctx.roundRect(-4, -24, 8, 6, 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, -30, 10.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#1f150f";
    ctx.beginPath();
    ctx.arc(0, -33.5, 10.2, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.75)";
    ctx.beginPath();
    ctx.arc(-3, -31, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(3, -31, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(70,25,20,.7)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-2, -27.2);
    ctx.quadraticCurveTo(0, -26.1, 2, -27.2);
    ctx.stroke();
    ctx.restore();
  }

  function drawBall(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number
  ): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    const ballGradient = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 0, 0, 0, r);
    ballGradient.addColorStop(0, "#fff");
    ballGradient.addColorStop(1, "#ddd");
    ctx.fillStyle = ballGradient;
    ctx.fill();

    ctx.fillStyle = "#222";
    const points = [
      [0, -r * 0.55],
      [r * 0.52, -r * 0.17],
      [r * 0.32, r * 0.45],
      [-r * 0.32, r * 0.45],
      [-r * 0.52, -r * 0.17]
    ];
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    points.forEach((point) => ctx.lineTo(point[0], point[1]));
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    const shine = ctx.createRadialGradient(-r * 0.25, -r * 0.3, 0, -r * 0.1, -r * 0.2, r * 0.7);
    shine.addColorStop(0, "rgba(255,255,255,.4)");
    shine.addColorStop(1, "transparent");
    ctx.fillStyle = shine;
    ctx.fill();
    ctx.restore();
  }

  function startArenaLoop(): void {
    if (arenaRaf) return;
    const loop = (): void => {
      arenaRaf = window.requestAnimationFrame(loop);
      updateArena();
      drawArena();
    };
    loop();
  }

  function stopArenaLoop(): void {
    if (arenaRaf) {
      window.cancelAnimationFrame(arenaRaf);
      arenaRaf = 0;
    }
  }

  function setupTurnUi(): void {
    if (!isArena || !match) return;
    resetTurnEntities();
    clearTurnTimers();
    clearAutoDiveTimer();
    actionLocked = false;
    canShoot = false;
    hintVisible = true;
    hintBottom = ".8%";

    if (expectedActor === "me") {
      turnBannerTitle = "YOUR TURN";
      turnBannerSub = "Flick the ball to shoot";
      showTurnBanner = true;
      hintText = "⏳ Wait for referee whistle...";
      scheduleTimer(() => {
        showTurnBanner = false;
      }, PEN_PACE.banner);
      scheduleTimer(() => {
        canShoot = true;
        hintText = "👆 Touch & flick ball to shoot";
      }, PEN_PACE.banner + PEN_PACE.whistleToShoot);
      return;
    }

    if (expectedActor === "opp") {
      turnBannerTitle = "OPPONENT SHOOTS";
      turnBannerSub = "Watch the keeper!";
      showTurnBanner = true;
      hintText = isPvp ? "🧤 Swipe to dive & save!" : "🤖 AI is taking the shot...";
      scheduleTimer(() => {
        showTurnBanner = false;
      }, PEN_PACE.banner);
      scheduleTimer(() => {
        startOpponentShot();
      }, PEN_PACE.banner + PEN_PACE.whistleToAiShot);
      return;
    }

    showTurnBanner = false;
    hintVisible = false;
  }

  function buildDotSlots(
    seq: boolean[],
    idx: number,
    start: number,
    slots: number
  ): Array<"goal" | "miss" | ""> {
    return Array.from({ length: slots }, (_, offset) => {
      const targetIndex = start + offset;
      if (targetIndex < idx) {
        return seq[targetIndex] ? "goal" : "miss";
      }
      return "";
    });
  }

  $: inSudden = Boolean(match && (match.suddenActive || match.myIdx > 5 || match.oppIdx > 5));
  $: dotsStart = inSudden ? 5 : 0;
  $: dotsSlots = inSudden ? 5 : 5;
  $: myDotSlots = match ? buildDotSlots(match.mySeq, match.myIdx, dotsStart, dotsSlots) : [];
  $: oppDotSlots = match ? buildDotSlots(match.oppSeq, match.oppIdx, dotsStart, dotsSlots) : [];
  $: roundLabel = (() => {
    if (!match) return "Round 1/5";
    if (!inSudden) {
      return `Round ${Math.min(Math.max(match.myIdx, match.oppIdx) + 1, 5)}/5`;
    }
    const sdDone = Math.max(0, Math.max(match.myIdx - 5, match.oppIdx - 5));
    return `SD ${Math.min(sdDone + 1, 5)}/5`;
  })();

  $: if (isArena) {
    startArenaLoop();
  } else {
    stopArenaLoop();
    clearTurnTimers();
    clearAutoDiveTimer();
    showTurnBanner = false;
    hintVisible = false;
    canShoot = false;
    actionLocked = false;
    turnTransitionLock = false;
    queuedTurnKey = "";
    swipeOrigin = null;
    arena.flick.on = false;
    lastTurnKey = "";
  }

  $: turnKey = match ? `${match.matchId}:${match.myIdx}:${match.oppIdx}:${expectedActor ?? "end"}` : "";
  $: if (isArena && turnKey && turnKey !== lastTurnKey) {
    lastTurnKey = turnKey;
    if (turnTransitionLock) {
      queuedTurnKey = turnKey;
    } else {
      scheduleTurnSetup(0);
    }
  }

  $: if (isArena && match && arena.matchId !== match.matchId) {
    arena.matchId = match.matchId;
    queuedTurnKey = "";
    turnTransitionLock = false;
    if (turnKey) {
      lastTurnKey = turnKey;
    }
    scheduleTurnSetup(PEN_PACE.startTurn);
  }

  onMount(() => {
    const img = new Image();
    img.src = GOAL_BG_ASSET;
    img.onload = () => {
      goalPhoto = img;
      goalPhotoReady = true;
    };
    img.onerror = () => {
      goalPhoto = null;
      goalPhotoReady = false;
    };

    const onResize = (): void => {
      if (!isArena) return;
      const ctx = syncCanvasSize();
      if (!ctx) return;
      drawArena();
    };

    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
    };
  });

  onDestroy(() => {
    stopArenaLoop();
    clearTurnTimers();
    clearAutoDiveTimer();
  });
</script>

<div id={view === "penalty" ? "page-penalty" : "page-wars"} class="pg on">
  {#if view === "wars"}
    <div class="nw-top">
      <div class="nw-title">NATION WARS</div>
      <div class="nw-sub">WAR POINT = Total Nation KICK / Eligible Nation Users.</div>
      <div class="nw-badge">🎮 Nation lock 7 days · only users with ≥5,000 KICK + active ≥7 days are counted</div>
    </div>

    <div class="mn-card">
      <div class="mn-flag">{myNation.flag}</div>
      <div class="mn-info">
        <div class="mn-name">{myNation.name} — Your Nation</div>
        <div class="mn-rank">#{myRank} · Eligible {myNation.eligibleUsers.toLocaleString("en-US")} / {myNation.users.toLocaleString("en-US")} users</div>
      </div>
      <div class="mn-pts">{formatWarPoint(myNation.warPoint)}</div>
    </div>

    <div class="card acc-b">
      <div class="info-head">NATIONAL WAR POLICY</div>
      <div style="font-size:9.3px;color:var(--gr);line-height:1.55">
        <div style="margin-bottom:4px">🎮 Join nation in app. Nation can be changed only after <strong style="color:var(--pw)">7 days</strong>.</div>
        <div style="margin-bottom:4px">🏆 <strong style="color:var(--y)">WAR POINT = Total KICK of nation / Number of eligible users in nation</strong>.</div>
        <div style="margin-bottom:4px">Eligible user = <strong style="color:var(--pw)">KICK ≥ 5,000</strong> and <strong style="color:var(--pw)">active ≥ 7 days</strong>.</div>
        <div>🎁 Weekly Top 5 nations: <strong style="color:var(--g)">+5% KICK bonus</strong> + Rising Boxes for top contributors.</div>
      </div>
    </div>

    <div class="podium">
      {#if podium[1]}
        <div class="pi">
          <div class="pflag">{podium[1].flag}</div>
          <div class="pname">{podium[1].name}</div>
          <div class="ppts">{formatKickCompact(podium[1].totalKick)}</div>
          <div class="pblk">2</div>
        </div>
      {/if}
      {#if podium[0]}
        <div class="pi">
          <div class="pflag">{podium[0].flag}</div>
          <div class="pname">{podium[0].name}</div>
          <div class="ppts">{formatKickCompact(podium[0].totalKick)}</div>
          <div class="pblk">1</div>
        </div>
      {/if}
      {#if podium[2]}
        <div class="pi">
          <div class="pflag">{podium[2].flag}</div>
          <div class="pname">{podium[2].name}</div>
          <div class="ppts">{formatKickCompact(podium[2].totalKick)}</div>
          <div class="pblk">3</div>
        </div>
      {/if}
    </div>

    <div class="rlist">
      {#each rankings as nation, index (nation.code)}
        <div class={`ri ${nation.code === selectedNationCode ? "me" : ""}`}>
          <div class="rfill" style={`width:${Math.max(8, (nation.warPoint / maxPoint) * 100)}%`} />
          <div class="rpos">{index + 1}</div>
          <div class="rflag">{nation.flag}</div>
          <div class="rinfo">
            <div class="rnation">{nation.name}</div>
            <div class="rfans">Eligible {nation.eligibleUsers.toLocaleString("en-US")} / {nation.users.toLocaleString("en-US")}</div>
          </div>
          <div class="rright">
            <div class="rpts">{formatWarPoint(nation.warPoint)}</div>
            <div class={`rdelta ${nation.changePct >= 0 ? "dup" : "ddn"}`}>{nation.changePct >= 0 ? "+" : ""}{nation.changePct.toFixed(1)}%</div>
          </div>
        </div>
      {/each}
    </div>

    <div style="margin-top:10px;display:grid;grid-template-columns:1fr 1fr;gap:6px">
      <select
        bind:value={selectedNationCode}
        style="width:100%;padding:10px;border-radius:8px;background:var(--bg3);color:var(--pw);border:1px solid var(--br2);font-size:11px"
      >
        {#each NATION_STATS as nation}
          <option value={nation.code}>{nation.flag} {nation.name}</option>
        {/each}
      </select>
      <button
        class="btn b-y"
        type="button"
        on:click={applyNation}
        disabled={isApplyingNation || !sessionId || (!nationCanChange && selectedNationCode !== currentNationCode)}
      >
        {isApplyingNation ? "APPLYING..." : "Apply Nation"}
      </button>
    </div>
    <div style="margin-top:5px;font-size:9.3px;color:var(--gr)">{lockMessage}</div>

    <div class="card acc-g" style="margin-top:10px">
      <div class="info-head">⚽ Penalty Challenge</div>
      <div class="info-list">
        <div class="info-item">Solo free left today: <strong style="color:var(--pw)">{$penaltyStore.daily.soloFreeLeft}</strong></div>
        <div class="info-item">Current solo shot success: <strong style="color:var(--pw)">{Math.round($penaltyStore.daily.soloShotRateNow * 100)}%</strong></div>
      </div>
      <button class="btn b-g" type="button" style="margin-top:8px" on:click={() => onNavigate("penalty")}>OPEN PENALTY →</button>
    </div>
  {:else}
    {#if !isArena}
      <div class="nw-top">
        <div class="nw-title">PENALTY CHALLENGE</div>
        <div class="nw-sub">Referee whistle → shoot · Swipe to save.</div>
      </div>

      <div class="card acc-g" style="margin-top:10px">
        <div class="info-head">⚽ Penalty Challenge Lobby</div>
        <div class="info-list">
          <div class="info-item">Solo free left today: <strong style="color:var(--pw)">{$penaltyStore.daily.soloFreeLeft}</strong></div>
          <div class="info-item">Current solo shot success: <strong style="color:var(--pw)">{Math.round($penaltyStore.daily.soloShotRateNow * 100)}%</strong></div>
          {#if $penaltyStore.playMessage}
            <div class="info-item">{$penaltyStore.playMessage}</div>
          {/if}
        </div>
        <div class="info-actions-grid">
          <button class="btn b-g" type="button" on:click={startSolo} disabled={$penaltyStore.isBusy || !sessionId}>
            {$penaltyStore.isBusy ? "PREPARING..." : "START SOLO"}
          </button>
          <button class="btn b-r" type="button" on:click={startPvp} disabled={$penaltyStore.isBusy || !sessionId || queuePlayers.length === 0}>
            START PVP
          </button>
        </div>

        <div class="pen-standby-box">
          <div class="pen-standby-head">
            <div>
              <div class="pen-standby-title">👥 PvP Standby List</div>
              <div class="pen-standby-sub">Select opponent. If no real players are online, AI rivals will appear.</div>
            </div>
            <div class={`pill ${queueSource === "realtime" ? "p-g" : "p-y"}`}>
              {queueSource === "realtime" ? "Live players" : "AI fallback"}
            </div>
          </div>

          {#if queuePlayers.length > 0}
            <select bind:value={selectedQueueId} class="pen-standby-select" disabled={isQueueLoading}>
              {#each queuePlayers as player}
                <option value={player.id}>
                  {player.flag} {player.name}
                  {#if player.isAi}
                    {" · AI"}
                  {/if}
                  {" · waiting "}{player.waitMin}m
                </option>
              {/each}
            </select>
          {:else}
            <div class="pen-standby-empty">{isQueueLoading ? "Loading opponents..." : "No opponents available right now."}</div>
          {/if}

          <div class="pen-standby-actions">
            <button class="btn b-gh" type="button" on:click={refreshQueue} disabled={!sessionId || isQueueLoading}>
              {isQueueLoading ? "LOADING..." : "↻ REFRESH LIST"}
            </button>
          </div>
          {#if queueErrorMessage}
            <div class="pen-standby-error">{queueErrorMessage}</div>
          {/if}
        </div>
      </div>

      <div class="pen-actions-grid" style="margin-top:8px">
        <button class="btn b-gh" type="button" on:click={() => onNavigate("wars")}>← NATION WARS</button>
        <button class="btn b-y" type="button" on:click={() => onNavigate("home")}>HOME</button>
      </div>
    {:else if match}
      <div class="pen-arena-wrap">
      <div class="pen-scorebar">
        <div class="pen-pi">
          <span class="pen-pflag">{myNation.flag}</span>
          <div>
            <div class="pen-pname">YOU</div>
            <div class="pen-kicks">
              {#each myDotSlots as dot}
                <span class={`psk ${dot}`}>{dot === "goal" ? "✓" : dot === "miss" ? "✕" : ""}</span>
              {/each}
            </div>
          </div>
        </div>

        <div class="pen-score-mid">
          <div class="pen-score-nums">{match.meScore} : {match.oppScore}</div>
          <div class="pen-score-lbl">{roundLabel}</div>
        </div>

        <div class="pen-pi" style="flex-direction:row-reverse;text-align:right">
          <span class="pen-pflag">{match.mode === "pvp" ? (match.opponent?.flag || (match.opponent?.isAi ? "🤖" : "🧍")) : "🤖"}</span>
          <div>
            <div class="pen-pname">
              {match.mode === "pvp" ? (match.opponent?.name || "OPPONENT") : "AI"}
            </div>
            <div class="pen-kicks pen-kicks-opp">
              {#each oppDotSlots as dot}
                <span class={`psk ${dot}`}>{dot === "goal" ? "✓" : dot === "miss" ? "✕" : ""}</span>
              {/each}
            </div>
          </div>
        </div>
      </div>

      <div class="pen-canvas-stage">
        <canvas
          bind:this={canvasEl}
          class="pen-canvas"
          on:pointerdown={onArenaPointerDown}
          on:pointermove={onArenaPointerMove}
          on:pointerup={onArenaPointerUp}
          on:pointercancel={onArenaPointerCancel}
          on:pointerleave={onArenaPointerCancel}
        />
        {#if hintVisible}
          <div class="pen-hint" style={`bottom:${hintBottom}`}>{hintText}</div>
        {/if}
        {#if showTurnBanner}
          <div class="pen-turn on">
            <div class="pt-title">{turnBannerTitle}</div>
            <div class="pt-sub">{turnBannerSub}</div>
          </div>
        {/if}
      </div>

        <div class="pen-actions-grid" style="margin-top:8px">
          <button class="btn b-gh" type="button" on:click={backToLobby} disabled={$penaltyStore.isBusy}>← BACK LOBBY</button>
          <button class="btn b-y" type="button" on:click={() => onNavigate("home")} disabled={$penaltyStore.isBusy}>HOME</button>
        </div>
        {#if $penaltyStore.playMessage}
          <div class="pen-wait-note">{$penaltyStore.playMessage}</div>
        {/if}
      </div>
    {/if}

    {#if $penaltyStore.errorMessage}
      <div class="wars-error">{$penaltyStore.errorMessage}</div>
    {/if}
  {/if}
</div>
