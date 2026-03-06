<script lang="ts">
  import { get } from "svelte/store";
  import { onDestroy, onMount } from "svelte";
  import {
    adjustKick,
    createAnnouncement,
    downloadAuditLogsCsv,
    downloadKickLedgerCsv,
    getConfig,
    getDashboard,
    getReferralsConfig,
    getReferralsMetrics,
    getSystemHealth,
    getSystemQueue,
    listAuditLogs,
    listAnnouncements,
    listBoardMembers,
    listKickLedger,
    listMatches,
    listMissions,
    listPiqueConversations,
    listReferralChains,
    listReferralFlagged,
    listUsers,
    loginWithTelegram,
    logoutSession,
    openSseStream,
    refreshSession,
    updateConfig,
    updateReferralsConfig,
    updateUserStatus,
    upsertBoardMember,
    verifyTotp,
    type AdminRole,
    type AuditLogItem,
    type Announcement,
    type AppUser,
    type BoardMember,
    type FeedSnapshotPayload,
    type KickLedgerItem,
    type MatchFixture,
    type MissionItem,
    type PiqueConversation,
    type ReferralChain,
    type ReferralConfig,
    type ReferralFlaggedItem,
    type ReferralsMetrics,
    type SystemHealthSnapshot,
    type SystemQueueSnapshot,
    type UserStatus
  } from "./lib/api/client";
  import { clearSession, session, setActive, setPending } from "./lib/stores/session";

  type PageId =
    | "dashboard"
    | "users"
    | "leaderboard"
    | "referrals"
    | "matches"
    | "missions"
    | "announce"
    | "rewards"
    | "mysterybox"
    | "wc26token"
    | "nationpass"
    | "social"
    | "spin"
    | "penalty"
    | "settings"
    | "api"
    | "pique"
    | "workflows"
    | "board"
    | "adminme";

  const TITLES: Record<PageId, string> = {
    dashboard: "DASHBOARD",
    users: "USER MANAGEMENT",
    leaderboard: "LEADERBOARD",
    referrals: "REFERRALS",
    matches: "MATCH MANAGER",
    missions: "MISSION CONTROL",
    announce: "ANNOUNCEMENTS",
    rewards: "REWARD TRANSACTIONS",
    mysterybox: "MYSTERY BOX",
    wc26token: "WC26 TOKEN",
    nationpass: "NATION PASS",
    social: "SOCIAL MEDIA",
    spin: "LUCKY SPIN",
    penalty: "PENALTY CHALLENGE",
    settings: "SETTINGS",
    api: "API CONNECTIONS",
    pique: "PIQUE · OPENCLAW AI",
    workflows: "WORKFLOWS",
    board: "MANAGEMENT BOARD",
    adminme: "ADMIN ACCOUNT"
  };

  const SUBS: Record<PageId, string> = {
    dashboard: "WC26 NFT FANTASY · CONTROL CENTER",
    users: "WC26 NFT FANTASY · MANAGEMENT",
    leaderboard: "WC26 NFT FANTASY · RANKINGS",
    referrals: "WC26 NFT FANTASY · REFERRAL CHAINS",
    matches: "WC26 NFT FANTASY · MATCH OPS",
    missions: "WC26 NFT FANTASY · MISSION OPS",
    announce: "WC26 NFT FANTASY · ANNOUNCEMENTS",
    rewards: "WC26 NFT FANTASY · REWARD LEDGER",
    mysterybox: "WC26 NFT FANTASY · TICKET SYSTEM",
    wc26token: "WC26 NFT FANTASY · TOKEN ECONOMY",
    nationpass: "WC26 NFT FANTASY · NATION PASS",
    social: "WC26 NFT FANTASY · SOCIAL TASKS",
    spin: "WC26 NFT FANTASY · SPIN CONFIG",
    penalty: "WC26 NFT FANTASY · PENALTY CONFIG",
    settings: "WC26 NFT FANTASY · SYSTEM SETTINGS",
    api: "WC26 NFT FANTASY · API STATUS",
    pique: "WC26 NFT FANTASY · AI ASSISTANT",
    workflows: "WC26 NFT FANTASY · AUTOMATION",
    board: "WC26 NFT FANTASY · PERMISSIONS",
    adminme: "WC26 NFT FANTASY · SECURITY"
  };

  const navSections: Array<{
    label: string;
    items: Array<{ id: PageId; icon: string; label: string }>;
  }> = [
    {
      label: "📋 Management",
      items: [
        { id: "dashboard", icon: "⊞", label: "Dashboard" },
        { id: "users", icon: "👥", label: "Users" },
        { id: "leaderboard", icon: "🏆", label: "Leaderboard" },
        { id: "referrals", icon: "🔗", label: "Referrals" },
        { id: "matches", icon: "⚽", label: "Matches" },
        { id: "missions", icon: "🎯", label: "Missions" },
        { id: "announce", icon: "📣", label: "Announcements" }
      ]
    },
    {
      label: "💰 Economy",
      items: [
        { id: "rewards", icon: "💎", label: "Rewards Dist." },
        { id: "mysterybox", icon: "🎁", label: "Mystery Box" },
        { id: "wc26token", icon: "🪙", label: "WC26 Token" },
        { id: "nationpass", icon: "🏴", label: "Nation Pass" }
      ]
    },
    {
      label: "⚙️ Comm & Config",
      items: [
        { id: "social", icon: "📡", label: "Social Media" },
        { id: "spin", icon: "🎡", label: "Lucky Spin" },
        { id: "penalty", icon: "🥅", label: "Penalty Challenge" },
        { id: "settings", icon: "⚙", label: "Settings" }
      ]
    },
    {
      label: "🤖 AI & Integrations",
      items: [
        { id: "api", icon: "🔌", label: "API Connections" },
        { id: "pique", icon: "✦", label: "PIQUE · OpenClaw" },
        { id: "workflows", icon: "⚡", label: "Workflows" }
      ]
    },
    {
      label: "👑 Management Board",
      items: [
        { id: "board", icon: "🛡", label: "Member List" },
        { id: "adminme", icon: "🔐", label: "Admin Account" }
      ]
    }
  ];

  const rolePerms: Record<AdminRole, Set<string>> = {
    owner: new Set([
      "users.manage",
      "kick.adjust",
      "config.spin",
      "config.penalty",
      "missions.manage",
      "announcements.manage",
      "economy.manage",
      "board.manage",
      "settings.manage",
      "api.manage",
      "dashboard.read",
      "reports.read",
      "pique.logs.read"
    ]),
    admin: new Set([
      "users.manage",
      "kick.adjust",
      "config.spin",
      "config.penalty",
      "missions.manage",
      "announcements.manage",
      "economy.manage",
      "settings.manage",
      "dashboard.read",
      "reports.read",
      "pique.logs.read"
    ]),
    moderator: new Set(["users.manage", "missions.manage", "announcements.manage", "dashboard.read"]),
    support: new Set(["users.manage", "announcements.manage", "dashboard.read"]),
    analyst: new Set(["dashboard.read", "reports.read"])
  };

  function requiredPermission(p: PageId): string | null {
    if (p === "dashboard" || p === "leaderboard" || p === "matches") return "dashboard.read";
    if (p === "users") return "users.manage";
    if (p === "announce") return "announcements.manage";
    if (p === "spin") return "config.spin";
    if (p === "penalty") return "config.penalty";
    if (p === "settings") return "settings.manage";
    if (p === "api") return "api.manage";
    if (p === "pique") return "pique.logs.read";
    if (p === "board") return "board.manage";
    if (p === "rewards") return "reports.read";
    if (p === "mysterybox" || p === "wc26token" || p === "nationpass") return "economy.manage";
    if (p === "missions" || p === "social" || p === "referrals" || p === "workflows" || p === "adminme") {
      return "dashboard.read";
    }
    return null;
  }

  function can(perm: string): boolean {
    const role = get(session).role;
    if (!role) return false;
    return rolePerms[role].has(perm);
  }

  let page: PageId = "dashboard";
  let sidebarCollapsed = false;
  let loading = false;
  let error = "";
  let toast = "";

  let tgId = "";
  let username = "";
  let hash = "";
  let authDate = Math.floor(Date.now() / 1000);
  let totpCode = "";

  let dashboard: { totalUsers: number; onlineUsers: number; totalKick: number; pendingReviews: number } | null =
    null;

  let users: AppUser[] = [];
  let usersTotal = 0;
  let userQ = "";
  let userStatus: "all" | UserStatus = "all";

  let ledger: KickLedgerItem[] = [];
  let selectedUserId = "";
  let kickDelta = 2000;
  let kickReason = "Manual adjustment";

  let spinConfigText = "{}";
  let penaltyConfigText = "{}";

  let announcements: Announcement[] = [];
  let annTitle = "";
  let annMessage = "";
  let annTarget = "all";

  let piqueLogs: PiqueConversation[] = [];
  let piqueTotal = 0;
  let piqueKeyword = "";
  let piqueUsername = "";
  let piqueSentiment = "";

  let boardMembers: BoardMember[] = [];
  let boardForm: {
    telegramId: string;
    username: string;
    displayName: string;
    role: AdminRole;
    requiresTotp: boolean;
    totpSecret: string;
    isActive: boolean;
  } = {
    telegramId: "",
    username: "",
    displayName: "",
    role: "moderator",
    requiresTotp: false,
    totpSecret: "",
    isActive: true
  };

  let leaderboardTab: "kick" | "ref" | "nation" = "kick";
  let referralsTab: "chains" | "abuse" | "config" = "chains";
  let socialTab: "channels" | "tasks" | "rewards" | "templates" = "channels";
  let penaltyTab: "solo" | "pvp" | "physics" | "skins" = "solo";

  let liveFeed: Array<{ icon: string; main: string; time: string; bg: string }> = [];
  let feedTicker: ReturnType<typeof setInterval> | null = null;
  let feedStream: EventSource | null = null;
  let healthStream: EventSource | null = null;
  let queueStream: EventSource | null = null;
  let systemHealth: SystemHealthSnapshot | null = null;
  let queueSnapshot: SystemQueueSnapshot | null = null;
  let auditLogs: AuditLogItem[] = [];
  let auditTotal = 0;
  let referralsMetrics: ReferralsMetrics = {
    totalRefs: 0,
    activeChains: 0,
    avgBoost: 0,
    flagged: 0
  };
  let referralChains: ReferralChain[] = [];
  let referralFlagged: ReferralFlaggedItem[] = [];
  let referralConfig: ReferralConfig = {
    f1Register: 200,
    f1Active7d: 500,
    f2Register: 50,
    f2Active7d: 100,
    maxF1PerSeason: 50
  };
  let matchesData: MatchFixture[] = [];
  let missionsData: MissionItem[] = [];

  const topNations = [
    { flag: "🇧🇷", name: "Brazil", pts: "2.4M", rank: 1 },
    { flag: "🇦🇷", name: "Argentina", pts: "2.1M", rank: 2 },
    { flag: "🇫🇷", name: "France", pts: "1.9M", rank: 3 },
    { flag: "🇩🇪", name: "Germany", pts: "1.7M", rank: 4 },
    { flag: "🇻🇳", name: "Vietnam", pts: "1.2M", rank: 5 }
  ];

  const workflowStats = [
    { name: "Auto KICK on Register", desc: "Grant 100 KICK to new users", runs: 2847, ok: 2841, cat: "User Lifecycle" },
    { name: "Jackpot Announcement", desc: "Broadcast jackpot winners", runs: 14, ok: 14, cat: "Economy" },
    { name: "Spin Streak Reward", desc: "3-day streak -> 500 KICK", runs: 431, ok: 428, cat: "Economy" }
  ];

  const socialChannels = [
    { platform: "Telegram", name: "WC26 Journey Official", url: "t.me/wc26journey", tasks: 3, kick: 300, icon: "📱" },
    { platform: "Twitter/X", name: "@WC26Journey", url: "twitter.com/wc26journey", tasks: 4, kick: 400, icon: "🐦" },
    { platform: "YouTube", name: "WC26 Journey", url: "youtube.com/@wc26journey", tasks: 2, kick: 250, icon: "▶️" }
  ];

  const systemPrompt =
    "You are PIQUE, the official AI assistant for WC26 NFT FANTASY. Focus on football gameplay, KICK strategy, and app guidance.";

  function statusTag(status: UserStatus): string {
    if (status === "vip") return "tag-y";
    if (status === "banned") return "tag-r";
    return "tag-g";
  }

  function showToast(message: string) {
    toast = message;
    setTimeout(() => {
      if (toast === message) toast = "";
    }, 2600);
  }

  function pushFeed(item: { icon: string; main: string; time: string; bg: string }) {
    liveFeed = [item, ...liveFeed].slice(0, 8);
  }

  function generateFeedItem(): { icon: string; main: string; time: string; bg: string } {
    const usernamePool = users.length > 0 ? users.map((u) => `@${u.username ?? "player"}`) : ["@user_1024", "@new_player"];
    const pickName = usernamePool[Math.floor(Math.random() * usernamePool.length)];
    const options = [
      { icon: "🎡", main: `<b>${pickName}</b> won <span style="color:var(--yellow)">1000 KICK</span> on Spin`, bg: "var(--bg4)" },
      { icon: "✅", main: `<b>${pickName}</b> completed Social Task`, bg: "var(--green-dim)" },
      { icon: "🔗", main: `<b>${pickName}</b> referred a new user`, bg: "var(--blue-dim)" },
      { icon: "⚽", main: `<b>${pickName}</b> completed Penalty Challenge`, bg: "var(--purple-dim)" }
    ];
    const picked = options[Math.floor(Math.random() * options.length)];
    return { ...picked, time: "just now" };
  }

  function relativeTime(iso: string): string {
    const diffSec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
    if (diffSec < 60) return "just now";
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return `${Math.floor(diffSec / 86400)}d ago`;
  }

  function feedItemFromAudit(activity: FeedSnapshotPayload["activities"][number]) {
    const iconMap: Record<string, string> = {
      auth: "🔐",
      users: "👤",
      economy: "💰",
      config: "⚙️",
      announcements: "📣",
      board: "🛡️",
      compliance: "🧪"
    };
    const bgMap: Record<string, string> = {
      auth: "var(--purple-dim)",
      users: "var(--green-dim)",
      economy: "var(--yellow-dim)",
      config: "var(--bg4)",
      announcements: "var(--blue-dim)",
      board: "var(--bg4)",
      compliance: "var(--red-dim)"
    };
    const icon = iconMap[activity.module] ?? "📍";
    const bg = bgMap[activity.module] ?? "var(--bg4)";
    return {
      icon,
      bg,
      main: `<b>@${activity.actor}</b> ${activity.action.replaceAll(".", " · ")}`,
      time: relativeTime(activity.at)
    };
  }

  function closeRealtimeStreams() {
    if (feedStream) {
      feedStream.close();
      feedStream = null;
    }
    if (healthStream) {
      healthStream.close();
      healthStream = null;
    }
    if (queueStream) {
      queueStream.close();
      queueStream = null;
    }
  }

  function startRealtimeStreams() {
    const accessToken = get(session).accessToken;
    if (!accessToken) return;
    closeRealtimeStreams();

    feedStream = openSseStream("/api/v1/realtime/feed", accessToken);
    feedStream.onerror = () => {
      if (feedStream) {
        feedStream.close();
        feedStream = null;
      }
    };
    feedStream.addEventListener("feed.snapshot", (event) => {
      try {
        const data = JSON.parse((event as MessageEvent<string>).data) as FeedSnapshotPayload;
        dashboard = data.metrics;
        if (data.activities.length > 0) {
          pushFeed(feedItemFromAudit(data.activities[0]));
        }
      } catch {
        // ignore broken frame
      }
    });

    healthStream = openSseStream("/api/v1/realtime/health", accessToken);
    healthStream.onerror = () => {
      if (healthStream) {
        healthStream.close();
        healthStream = null;
      }
    };
    healthStream.addEventListener("health.snapshot", (event) => {
      try {
        systemHealth = JSON.parse((event as MessageEvent<string>).data) as SystemHealthSnapshot;
      } catch {
        // ignore broken frame
      }
    });

    queueStream = openSseStream("/api/v1/realtime/queue", accessToken);
    queueStream.onerror = () => {
      if (queueStream) {
        queueStream.close();
        queueStream = null;
      }
    };
    queueStream.addEventListener("queue.snapshot", (event) => {
      try {
        queueSnapshot = JSON.parse((event as MessageEvent<string>).data) as SystemQueueSnapshot;
      } catch {
        // ignore broken frame
      }
    });
  }

  async function withAccess<T>(run: (token: string) => Promise<T>): Promise<T> {
    const current = get(session);
    if (!current.accessToken) {
      throw new Error("Session expired");
    }
    try {
      return await run(current.accessToken);
    } catch (err) {
      if (!current.refreshToken) throw err;
      const refreshed = await refreshSession({ refreshToken: current.refreshToken });
      setActive({
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        role: refreshed.profile.role,
        username: refreshed.profile.username
      });
      return run(refreshed.accessToken);
    }
  }

  async function handleTelegramLogin() {
    error = "";
    loading = true;
    try {
      const res = await loginWithTelegram({ id: tgId, username, hash, authDate });
      if (res.requiresTotp && res.pendingToken) {
        setPending(res.pendingToken);
        return;
      }
      if (res.accessToken && res.refreshToken && res.profile) {
        setActive({
          accessToken: res.accessToken,
          refreshToken: res.refreshToken,
          role: res.profile.role,
          username: res.profile.username
        });
        await bootstrap();
      }
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  async function handleTotp() {
    error = "";
    loading = true;
    try {
      const pendingToken = get(session).pendingToken;
      if (!pendingToken) throw new Error("Pending token missing");
      const code = totpCode.replace(/\D/g, "").slice(0, 6);
      totpCode = code;
      if (!/^\d{6}$/.test(code)) {
        throw new Error("TOTP code must be 6 digits");
      }
      const res = await verifyTotp({ pendingToken, code });
      if (!res.accessToken || !res.refreshToken || !res.profile) {
        throw new Error("Invalid TOTP response");
      }
      setActive({
        accessToken: res.accessToken,
        refreshToken: res.refreshToken,
        role: res.profile.role,
        username: res.profile.username
      });
      await bootstrap();
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  async function bootstrap() {
    const tasks: Array<Promise<unknown>> = [loadDashboard()];

    if (can("users.manage")) tasks.push(loadUsersAndLedger());
    if (can("config.spin") || can("config.penalty")) tasks.push(loadConfigs());
    if (can("announcements.manage")) tasks.push(loadAnnouncements());
    if (can("pique.logs.read")) tasks.push(loadPique());
    if (can("board.manage")) tasks.push(loadBoard());
    if (can("reports.read")) tasks.push(loadAuditLogs());
    if (can("dashboard.read")) {
      tasks.push(loadOperationalData(), loadReferrals(), loadMatches(), loadMissions());
    }

    await Promise.all(tasks);
    liveFeed = [
      {
        icon: "🎡",
        bg: "var(--bg4)",
        main: `<b>@zkhalid</b> won <span style="color:var(--yellow)">10,000 KICK</span> JACKPOT!`,
        time: "just now"
      },
      { icon: "👤", bg: "var(--green-dim)", main: "<b>@new_player_42</b> joined WC26 Journey", time: "1m ago" },
      { icon: "✅", bg: "var(--blue-dim)", main: "<b>@amir_88</b> completed Twitter task", time: "2m ago" }
    ];
    startRealtimeStreams();
  }

  async function ensurePageData(next: PageId) {
    if (next === "dashboard") await loadDashboard();
    if (next === "users" || next === "rewards") await loadUsersAndLedger();
    if (next === "dashboard" || next === "rewards" || next === "api") await loadOperationalData();
    if (next === "rewards") await loadAuditLogs();
    if (next === "spin" || next === "penalty") await loadConfigs();
    if (next === "announce") await loadAnnouncements();
    if (next === "pique") await loadPique();
    if (next === "board") await loadBoard();
    if (next === "referrals") await loadReferrals();
    if (next === "matches") await loadMatches();
    if (next === "missions") await loadMissions();
  }

  async function loadDashboard() {
    dashboard = await withAccess((token) => getDashboard(token));
  }

  async function loadOperationalData() {
    const [health, queue] = await Promise.all([
      withAccess((token) => getSystemHealth(token)),
      withAccess((token) => getSystemQueue(token))
    ]);
    systemHealth = health;
    queueSnapshot = queue;
  }

  async function loadAuditLogs() {
    const logs = await withAccess((token) => listAuditLogs(token, { limit: 60 }));
    auditLogs = logs.items;
    auditTotal = logs.total;
  }

  async function loadUsersAndLedger() {
    const userRes = await withAccess((token) =>
      listUsers(token, {
        q: userQ || undefined,
        status: userStatus === "all" ? undefined : userStatus,
        limit: 100
      })
    );
    users = userRes.items;
    usersTotal = userRes.total;
    if (!selectedUserId && users[0]) selectedUserId = users[0].id;
    const ledgerRes = await withAccess((token) => listKickLedger(token, { limit: 80 }));
    ledger = ledgerRes.items;
  }

  async function loadConfigs() {
    const [spin, penalty] = await Promise.all([
      withAccess((token) => getConfig(token, "spin")),
      withAccess((token) => getConfig(token, "penalty"))
    ]);
    spinConfigText = JSON.stringify(spin.value, null, 2);
    penaltyConfigText = JSON.stringify(penalty.value, null, 2);
  }

  async function loadAnnouncements() {
    announcements = await withAccess((token) => listAnnouncements(token));
  }

  async function loadPique() {
    const res = await withAccess((token) =>
      listPiqueConversations(token, {
        keyword: piqueKeyword || undefined,
        username: piqueUsername || undefined,
        sentiment: piqueSentiment || undefined,
        limit: 100
      })
    );
    piqueLogs = res.items;
    piqueTotal = res.total;
  }

  async function loadBoard() {
    const res = await withAccess((token) => listBoardMembers(token));
    boardMembers = res.items;
  }

  async function loadReferrals() {
    const [metrics, chains, flagged, config] = await Promise.all([
      withAccess((token) => getReferralsMetrics(token)),
      withAccess((token) => listReferralChains(token, { limit: 100 })),
      withAccess((token) => listReferralFlagged(token, { limit: 100 })),
      withAccess((token) => getReferralsConfig(token))
    ]);
    referralsMetrics = metrics;
    referralChains = chains.items;
    referralFlagged = flagged.items;
    referralConfig = config.value;
  }

  async function loadMatches() {
    const res = await withAccess((token) => listMatches(token, { limit: 100 }));
    matchesData = res.items;
  }

  async function loadMissions() {
    const res = await withAccess((token) => listMissions(token, { limit: 100 }));
    missionsData = res.items;
  }

  async function saveReferralsConfig() {
    loading = true;
    error = "";
    try {
      await withAccess((token) => updateReferralsConfig(token, referralConfig));
      showToast("Referral config saved");
      await loadReferrals();
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  async function changeUserStatus(id: string, status: UserStatus) {
    loading = true;
    error = "";
    try {
      await withAccess((token) => updateUserStatus(token, { id, status }));
      await loadUsersAndLedger();
      showToast("User status updated");
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  async function submitKickAdjust() {
    if (!selectedUserId) {
      error = "Select a user first";
      return;
    }
    loading = true;
    error = "";
    try {
      await withAccess((token) =>
        adjustKick(token, {
          userId: selectedUserId,
          delta: Number(kickDelta),
          reason: kickReason,
          source: "admin_panel"
        })
      );
      await Promise.all([loadUsersAndLedger(), loadDashboard()]);
      showToast("KICK adjusted successfully");
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  async function saveConfig(key: "spin" | "penalty") {
    loading = true;
    error = "";
    try {
      const raw = key === "spin" ? spinConfigText : penaltyConfigText;
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      await withAccess((token) => updateConfig(token, key, parsed));
      showToast(`${key.toUpperCase()} config saved`);
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  async function submitAnnouncement() {
    if (!annTitle.trim() || !annMessage.trim()) {
      error = "Title and message are required";
      return;
    }
    loading = true;
    error = "";
    try {
      await withAccess((token) =>
        createAnnouncement(token, {
          title: annTitle,
          message: annMessage,
          target: annTarget,
          publishNow: true
        })
      );
      annTitle = "";
      annMessage = "";
      annTarget = "all";
      await loadAnnouncements();
      showToast("Announcement broadcasted");
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  async function submitBoardMember() {
    if (!boardForm.telegramId || !boardForm.username || !boardForm.displayName) {
      error = "Please fill all board member fields";
      return;
    }
    loading = true;
    error = "";
    try {
      await withAccess((token) =>
        upsertBoardMember(token, {
          telegramId: boardForm.telegramId,
          username: boardForm.username,
          displayName: boardForm.displayName,
          role: boardForm.role,
          requiresTotp: boardForm.requiresTotp,
          totpSecret: boardForm.totpSecret || undefined,
          isActive: boardForm.isActive
        })
      );
      boardForm = {
        telegramId: "",
        username: "",
        displayName: "",
        role: "moderator",
        requiresTotp: false,
        totpSecret: "",
        isActive: true
      };
      await loadBoard();
      showToast("Board member saved");
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  function saveBlob(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function downloadLedgerCsv() {
    loading = true;
    error = "";
    try {
      const blob = await withAccess((token) => downloadKickLedgerCsv(token, { limit: 5000 }));
      saveBlob(blob, `kick-ledger-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  async function downloadAuditCsv() {
    loading = true;
    error = "";
    try {
      const blob = await withAccess((token) => downloadAuditLogsCsv(token, { limit: 5000 }));
      saveBlob(blob, `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  async function doLogout() {
    const refreshToken = get(session).refreshToken;
    if (refreshToken) {
      try {
        await logoutSession({ refreshToken });
      } catch {
        // ignore
      }
    }
    clearSession();
    closeRealtimeStreams();
    page = "dashboard";
    dashboard = null;
    systemHealth = null;
    queueSnapshot = null;
    users = [];
    ledger = [];
    auditLogs = [];
    announcements = [];
    piqueLogs = [];
    boardMembers = [];
    referralChains = [];
    referralFlagged = [];
    matchesData = [];
    missionsData = [];
    liveFeed = [];
  }

  async function navigate(next: PageId) {
    const perm = requiredPermission(next);
    if (perm && !can(perm)) {
      showToast("Permission denied for this module");
      return;
    }

    page = next;
    loading = true;
    try {
      await ensurePageData(next);
      if (next === "dashboard" && !feedStream) {
        startRealtimeStreams();
      }
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  function toggleSidebar() {
    sidebarCollapsed = !sidebarCollapsed;
  }

  function placeholderMessage(moduleName: string) {
    return `${moduleName} is scaffolded with WC26 admin design. Backend endpoints will be attached in next sprint.`;
  }

  $: currentTitle = TITLES[page];
  $: currentSub = SUBS[page];
  $: recentUsers = users.slice(0, 5);
  $: topKickUsers = [...users].sort((a, b) => b.kick - a.kick).slice(0, 10);
  $: eligibleTokenUsers = users.filter((u) => u.kick >= 5000);
  $: spinRewards = (() => {
    try {
      const parsed = JSON.parse(spinConfigText) as { rewards?: Array<{ id: string; chance: number; value: number }> };
      return Array.isArray(parsed.rewards) ? parsed.rewards : [];
    } catch {
      return [];
    }
  })();

  onMount(async () => {
    if (get(session).accessToken) {
      try {
        await bootstrap();
      } catch (e) {
        error = (e as Error).message;
      }
    }

    feedTicker = setInterval(() => {
      if (get(session).accessToken && page === "dashboard" && !feedStream) {
        pushFeed(generateFeedItem());
      }
    }, 4000);
  });

  onDestroy(() => {
    if (feedTicker) clearInterval(feedTicker);
    closeRealtimeStreams();
  });
</script>

{#if !$session.accessToken && !$session.pendingToken}
  <main class="auth-wrap">
    <section class="auth-card">
      <h1>WC26 NFT FANTASY</h1>
      <p>National Journey Airdrop - Viral Activation</p>
      <h2>Telegram Login</h2>
      <p class="auth-help">Production flow: Telegram Widget payload -> whitelist TG ID -> TOTP (owner/admin).</p>
      <div class="auth-grid">
        <label>Telegram ID <input bind:value={tgId} /></label>
        <label>Username <input bind:value={username} /></label>
        <label>Auth Date (unix) <input type="number" bind:value={authDate} /></label>
        <label>Hash <input bind:value={hash} /></label>
      </div>
      <button class="btn btn-g" disabled={loading} on:click={handleTelegramLogin}>Sign in with Telegram</button>
    </section>
  </main>
{:else if $session.pendingToken}
  <main class="auth-wrap">
    <section class="auth-card">
      <h1>TOTP Verification</h1>
      <p class="auth-help">Role {$session.role ?? "owner/admin"} requires TOTP.</p>
      <label
        >6-digit code
        <input
          bind:value={totpCode}
          maxlength="6"
          inputmode="numeric"
          pattern="[0-9]*"
          autocomplete="one-time-code"
          on:input={() => (totpCode = totpCode.replace(/\D/g, "").slice(0, 6))}
        />
      </label>
      <button class="btn btn-g" disabled={loading} on:click={handleTotp}>Verify</button>
    </section>
  </main>
{:else}
  <nav id="sidebar" class:collapsed={sidebarCollapsed}>
    <button class="sb-logo" type="button" on:click={toggleSidebar}>
      <div class="sb-logo-icon">W</div>
      <div class="sb-logo-text">
        <span>WC26 JOURNEY</span>
        <span>AIRDROP ADMIN</span>
      </div>
    </button>

    <div class="sb-scroll">
      {#each navSections as sec, i}
        <div class="nav-cat"><span class="nav-cat-label">{sec.label}</span></div>
        {#each sec.items as item}
          <button type="button" class="nav-item" class:active={page === item.id} on:click={() => navigate(item.id)}>
            <span class="nav-icon">{item.icon}</span><span class="nav-label">{item.label}</span>
            {#if item.id === "dashboard"}
              <span class="nav-badge g" id="actBadge">●</span>
            {/if}
          </button>
        {/each}
        {#if i < navSections.length - 1}
          <div class="nav-divider"></div>
        {/if}
      {/each}
    </div>

    <div class="sb-footer">
      <div class="sb-avatar" title="Admin profile">{($session.username ?? "A").slice(0, 1).toUpperCase()}</div>
      <div class="sb-user">
        <span>{$session.username ?? "Admin"}</span>
        <span>● {($session.role ?? "analyst").toUpperCase()}</span>
      </div>
    </div>
  </nav>

  <div id="main">
    <div id="topbar">
      <button id="menuToggle" on:click={toggleSidebar}>
        <span></span><span></span><span></span>
      </button>
      <div class="pg-title-wrap">
        <div id="pgTitle">{currentTitle}</div>
        <div id="pgSub">{currentSub}</div>
      </div>
      <div class="topbar-actions">
        <div class="tb-chip live"><span class="tb-dot"></span>{dashboard?.onlineUsers ?? 0} ONLINE</div>
        <button type="button" class="tb-chip" on:click={() => navigate("announce")}>📣 QUICK ANN</button>
        <button type="button" class="tb-chip" on:click={() => navigate("users")}>⚡ KICK GRANT</button>
        <button type="button" class="tb-chip" on:click={doLogout}>🔐 LOGOUT</button>
      </div>
    </div>

    <div id="content">
      {#if page === "dashboard"}
        <div class="pg active" id="pg-dashboard">
          <div class="qa-grid">
            <button type="button" class="qa-card" on:click={() => navigate("users")}>
              <div class="qa-icon">👥</div><div class="qa-label">Manage Users</div>
            </button>
            <button type="button" class="qa-card" on:click={() => navigate("users")}>
              <div class="qa-icon">⚡</div><div class="qa-label">Grant KICK</div>
            </button>
            <button type="button" class="qa-card" on:click={() => navigate("announce")}>
              <div class="qa-icon">📣</div><div class="qa-label">Announce</div>
            </button>
            <button type="button" class="qa-card" on:click={() => navigate("spin")}>
              <div class="qa-icon">🎡</div><div class="qa-label">Spin Config</div>
            </button>
          </div>

          <div class="grid-5" style="margin-bottom:16px">
            <div class="stat-card" style="--accent:var(--green)">
              <div class="stat-val">{dashboard?.totalUsers?.toLocaleString() ?? "0"}</div>
              <div class="stat-lbl">Total Users</div>
              <div class="stat-delta up">▲ live data</div>
            </div>
            <div class="stat-card" style="--accent:var(--yellow)">
              <div class="stat-val">{dashboard?.totalKick?.toLocaleString() ?? "0"}</div>
              <div class="stat-lbl">KICK in Circ.</div>
              <div class="stat-delta up">▲ synced</div>
            </div>
            <div class="stat-card" style="--accent:var(--blue)">
              <div class="stat-val">{spinRewards.length}</div>
              <div class="stat-lbl">Spin Segments</div>
              <div class="stat-delta dn">▼ config mode</div>
            </div>
            <div class="stat-card" style="--accent:var(--purple)">
              <div class="stat-val">{announcements.length}</div>
              <div class="stat-lbl">Announcements</div>
              <div class="stat-delta up">▲ total</div>
            </div>
            <div class="stat-card" style="--accent:var(--red)">
              <div class="stat-val">{dashboard?.onlineUsers?.toLocaleString() ?? "0"}</div>
              <div class="stat-lbl">Online Now</div>
              <div class="stat-delta up">▲ realtime</div>
            </div>
          </div>

          <div class="col-layout">
            <div class="col-main">
              <div class="section">
                <div class="sec-hdr">
                  <div class="sec-title"><div class="sec-dot"></div>Recent Users</div>
                  <button class="btn btn-ghost btn-sm" on:click={() => navigate("users")}>VIEW ALL</button>
                </div>
                <div class="sec-body" style="padding:0">
                  <table class="tbl"><thead><tr>
                    <th>User</th><th>Nation</th><th>KICK</th><th>Joined</th><th>Status</th>
                  </tr></thead><tbody>
                    {#each recentUsers as u}
                      <tr>
                        <td><span style="font-weight:600">@{u.username ?? "unknown"}</span></td>
                        <td>{u.nationCode}</td>
                        <td style="font-family:var(--mono);color:var(--yellow)">{u.kick.toLocaleString()}</td>
                        <td style="font-family:var(--mono);font-size:10px;color:var(--text3)">{new Date(u.createdAt).toLocaleDateString()}</td>
                        <td><span class={`tag ${statusTag(u.status)}`}>{u.status.toUpperCase()}</span></td>
                      </tr>
                    {/each}
                  </tbody></table>
                </div>
              </div>

              <div class="section">
                <div class="sec-hdr">
                  <div class="sec-title"><div class="sec-dot b"></div>Spin Breakdown</div>
                </div>
                <div class="sec-body">
                  {#if spinRewards.length === 0}
                    <div class="empty"><div class="empty-text">No SPIN rewards config found</div></div>
                  {:else}
                    {#each spinRewards as s}
                      <div style="display:flex;align-items:center;gap:8px;margin-bottom:7px">
                        <div style="font-size:11px;width:110px;color:var(--text1)">{s.id}</div>
                        <div class="prog" style="flex:1"><div class="prog-fill" style={`width:${s.chance}%;background:var(--blue)`}></div></div>
                        <div style="font-family:var(--mono);font-size:10px;color:var(--text2);width:35px;text-align:right">{s.chance}%</div>
                      </div>
                    {/each}
                  {/if}
                </div>
              </div>
            </div>

            <div style="width:280px;flex-shrink:0">
              <div class="section">
                <div class="sec-hdr">
                  <div class="sec-title"><div class="sec-dot"></div>Live Feed</div>
                  <span class="nav-badge g" style="font-size:9px">LIVE</span>
                </div>
                <div class="sec-body" style="padding:8px 14px;max-height:220px;overflow-y:auto">
                  {#each liveFeed as f}
                    <div class="feed-item">
                      <div class="feed-icon" style={`background:${f.bg}`}>{f.icon}</div>
                      <div class="feed-text"><div class="ft-main">{@html f.main}</div><div class="ft-time">{f.time}</div></div>
                    </div>
                  {/each}
                </div>
              </div>

              <div class="section">
                <div class="sec-hdr">
                  <div class="sec-title"><div class="sec-dot y"></div>Top Nations</div>
                </div>
                <div class="sec-body">
                  {#each topNations as n}
                    <div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border)">
                      <span style="font-family:var(--mono);font-size:10px;color:var(--text3);width:16px">#{n.rank}</span>
                      <span style="font-size:16px">{n.flag}</span>
                      <span style="flex:1;font-size:12px">{n.name}</span>
                      <span style="font-family:var(--mono);font-size:10px;color:var(--yellow)">{n.pts}</span>
                    </div>
                  {/each}
                </div>
              </div>

              <div class="section">
                <div class="sec-hdr">
                  <div class="sec-title"><div class="sec-dot r"></div>System Health</div>
                </div>
                <div class="sec-body">
                  <div class="health-row">
                    <div class={`h-dot ${systemHealth?.services.api.status === "ok" ? "h-ok" : "h-err"}`}></div>
                    <div class="h-label">API</div>
                    <div class="h-val">{systemHealth?.services.api.status?.toUpperCase() ?? "-"}</div>
                  </div>
                  <div class="health-row">
                    <div class={`h-dot ${systemHealth?.services.database.status === "ok" ? "h-ok" : "h-err"}`}></div>
                    <div class="h-label">Database</div>
                    <div class="h-val">{systemHealth ? `${systemHealth.services.database.latencyMs}ms` : "-"}</div>
                  </div>
                  <div class="health-row">
                    <div class={`h-dot ${systemHealth?.services.sessionStore.status === "ok" ? "h-ok" : "h-err"}`}></div>
                    <div class="h-label">Session Store ({systemHealth?.services.sessionStore.mode ?? "-"})</div>
                    <div class="h-val">{systemHealth ? `${systemHealth.services.sessionStore.latencyMs}ms` : "-"}</div>
                  </div>
                  <div class="health-row">
                    <div class={`h-dot ${(queueSnapshot?.pendingCompliance ?? 0) > 0 ? "h-warn" : "h-ok"}`}></div>
                    <div class="h-label">Compliance Queue</div>
                    <div class="h-val">{queueSnapshot?.pendingCompliance ?? 0}</div>
                  </div>
                  <div class="health-row">
                    <div class={`h-dot ${(queueSnapshot?.highRiskPique ?? 0) > 0 ? "h-warn" : "h-ok"}`}></div>
                    <div class="h-label">PIQUE High Risk</div>
                    <div class="h-val">{queueSnapshot?.highRiskPique ?? 0}</div>
                  </div>
                  <div class="health-row">
                    <div class={`h-dot ${(queueSnapshot?.pendingAnnouncements ?? 0) > 0 ? "h-warn" : "h-ok"}`}></div>
                    <div class="h-label">Draft Announcements</div>
                    <div class="h-val">{queueSnapshot?.pendingAnnouncements ?? 0}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      {/if}

      {#if page === "users"}
        <div class="pg active" id="pg-users">
          <div class="section">
            <div class="sec-hdr">
              <div class="sec-title"><div class="sec-dot"></div>User Management</div>
              <div style="display:flex;gap:8px">
                <input class="inp" style="width:200px" placeholder="Search user / TG ID..." bind:value={userQ} />
                <button class="btn btn-g btn-sm" on:click={loadUsersAndLedger}>FILTER</button>
              </div>
            </div>
            <div class="sec-body" style="padding:8px 16px">
              <div class="filter-row">
                <button class="filter-btn" class:active={userStatus === "all"} on:click={() => (userStatus = "all")}>All</button>
                <button class="filter-btn" class:active={userStatus === "active"} on:click={() => (userStatus = "active")}>Active</button>
                <button class="filter-btn y" class:active={userStatus === "vip"} on:click={() => (userStatus = "vip")}>VIP</button>
                <button class="filter-btn r" class:active={userStatus === "banned"} on:click={() => (userStatus = "banned")}>Banned</button>
                <button class="btn btn-ghost btn-sm" on:click={loadUsersAndLedger}>APPLY</button>
              </div>
            </div>
            <div style="padding:0">
              <table class="tbl"><thead><tr>
                <th>#</th><th>User</th><th>TG ID</th><th>Nation</th><th>KICK</th><th>Status</th><th>Actions</th>
              </tr></thead><tbody>
                {#each users as u, i}
                  <tr>
                    <td>{i + 1}</td>
                    <td>@{u.username ?? "unknown"}</td>
                    <td>{u.telegramId ?? "-"}</td>
                    <td>{u.nationCode}</td>
                    <td style="font-family:var(--mono);color:var(--yellow)">{u.kick.toLocaleString()}</td>
                    <td><span class={`tag ${statusTag(u.status)}`}>{u.status.toUpperCase()}</span></td>
                    <td style="display:flex;gap:6px;flex-wrap:wrap">
                      <button class="act-btn act-g" on:click={() => changeUserStatus(u.id, "active")}>ACTIVE</button>
                      <button class="act-btn act-y" on:click={() => changeUserStatus(u.id, "vip")}>VIP</button>
                      <button class="act-btn act-r" on:click={() => changeUserStatus(u.id, "banned")}>BAN</button>
                    </td>
                  </tr>
                {/each}
              </tbody></table>
            </div>
          </div>

          <div class="section">
            <div class="sec-hdr">
              <div class="sec-title"><div class="sec-dot y"></div>KICK Grant / Adjust</div>
            </div>
            <div class="sec-body">
              <div style="display:grid;grid-template-columns:1fr 120px 1fr auto;gap:8px;align-items:center">
                <select class="inp" bind:value={selectedUserId}>
                  {#each users as u}
                    <option value={u.id}>@{u.username ?? u.id} ({u.kick.toLocaleString()} KICK)</option>
                  {/each}
                </select>
                <input class="inp" type="number" bind:value={kickDelta} />
                <input class="inp" bind:value={kickReason} />
                <button class="btn btn-g" on:click={submitKickAdjust}>SUBMIT</button>
              </div>
            </div>
          </div>
        </div>
      {/if}

      {#if page === "leaderboard"}
        <div class="pg active" id="pg-leaderboard">
          <div class="tab-row">
            <button class="tab" class:active={leaderboardTab === "kick"} on:click={() => (leaderboardTab = "kick")}>🏅 Top KICK</button>
            <button class="tab" class:active={leaderboardTab === "ref"} on:click={() => (leaderboardTab = "ref")}>🔗 Top Referrers</button>
            <button class="tab" class:active={leaderboardTab === "nation"} on:click={() => (leaderboardTab = "nation")}>🌍 Nations War</button>
          </div>

          {#if leaderboardTab === "kick"}
            <div class="section">
              <div class="sec-hdr"><div class="sec-title"><div class="sec-dot"></div>Top KICK Holders</div></div>
              <div class="sec-body" style="padding:0">
                <table class="tbl"><thead><tr><th>#</th><th>User</th><th>Nation</th><th>KICK</th></tr></thead><tbody>
                  {#each topKickUsers as u, i}
                    <tr>
                      <td>#{i + 1}</td>
                      <td>@{u.username ?? "unknown"}</td>
                      <td>{u.nationCode}</td>
                      <td style="font-family:var(--mono);color:var(--yellow)">{u.kick.toLocaleString()}</td>
                    </tr>
                  {/each}
                </tbody></table>
              </div>
            </div>
          {/if}

          {#if leaderboardTab === "ref"}
            <div class="section"><div class="sec-hdr"><div class="sec-title"><div class="sec-dot b"></div>Top Referrers</div></div>
              <div class="sec-body">
                <div class="health-row"><div class="h-dot h-ok"></div><div class="h-label">@footballking</div><div class="h-val">312 refs</div></div>
                <div class="health-row"><div class="h-dot h-ok"></div><div class="h-label">@amir_88</div><div class="h-val">227 refs</div></div>
                <div class="health-row"><div class="h-dot h-ok"></div><div class="h-label">@samba_fc</div><div class="h-val">198 refs</div></div>
              </div>
            </div>
          {/if}

          {#if leaderboardTab === "nation"}
            <div class="section"><div class="sec-hdr"><div class="sec-title"><div class="sec-dot y"></div>Nation War Rankings</div></div>
              <div class="sec-body">
                {#each topNations as n}
                  <div class="health-row"><div class="h-dot h-ok"></div><div class="h-label">{n.flag} {n.name}</div><div class="h-val">{n.pts}</div></div>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      {/if}

      {#if page === "referrals"}
        <div class="pg active" id="pg-referrals">
          <div class="grid-4" style="margin-bottom:16px">
            <div class="stat-card" style="--accent:var(--blue)"><div class="stat-val">{referralsMetrics.totalRefs.toLocaleString()}</div><div class="stat-lbl">Total Refs</div></div>
            <div class="stat-card" style="--accent:var(--green)"><div class="stat-val">{referralsMetrics.activeChains.toLocaleString()}</div><div class="stat-lbl">Active Chains</div></div>
            <div class="stat-card" style="--accent:var(--yellow)"><div class="stat-val">{referralsMetrics.avgBoost.toFixed(2)}x</div><div class="stat-lbl">Avg Boost</div></div>
            <div class="stat-card" style="--accent:var(--red)"><div class="stat-val">{referralsMetrics.flagged.toLocaleString()}</div><div class="stat-lbl">Flagged</div></div>
          </div>
          <div class="tab-row">
            <button class="tab" class:active={referralsTab === "chains"} on:click={() => (referralsTab = "chains")}>🔗 Chain Viewer</button>
            <button class="tab" class:active={referralsTab === "abuse"} on:click={() => (referralsTab = "abuse")}>🚨 Abuse Detection</button>
            <button class="tab" class:active={referralsTab === "config"} on:click={() => (referralsTab = "config")}>⚙ Boost Config</button>
          </div>

          {#if referralsTab === "chains"}
            <div class="section">
              <div class="sec-hdr"><div class="sec-title"><div class="sec-dot b"></div>Referral Chains</div></div>
              <div class="sec-body" style="padding:0">
                <table class="tbl"><thead><tr><th>Chain Root</th><th>F1</th><th>F2</th><th>Active 7d</th><th>KICK Awarded</th><th>Flagged</th></tr></thead><tbody>
                  {#each referralChains as c}
                    <tr>
                      <td>@{c.inviterUsername}</td>
                      <td>{c.f1Count}</td>
                      <td>{c.f2Count}</td>
                      <td>{c.active7dCount}</td>
                      <td>{c.totalKickAwarded.toLocaleString()}</td>
                      <td style={`color:${c.flaggedCount > 0 ? "var(--red)" : "var(--text2)"}`}>{c.flaggedCount}</td>
                    </tr>
                  {/each}
                </tbody></table>
              </div>
            </div>
          {/if}

          {#if referralsTab === "abuse"}
            <div class="section">
              <div class="sec-hdr"><div class="sec-title"><div class="sec-dot r"></div>Flagged Chains</div></div>
              <div class="sec-body" style="padding:0">
                <table class="tbl"><thead><tr><th>Chain Root</th><th>Level</th><th>Status</th><th>Risk</th><th>Award</th></tr></thead><tbody>
                  {#each referralFlagged as f}
                    <tr>
                      <td>@{f.inviter.username ?? "unknown"}</td>
                      <td>F{f.level}</td>
                      <td>{f.status}</td>
                      <td style="color:var(--red)">{f.riskScore}</td>
                      <td>{f.kickAward.toLocaleString()} KICK</td>
                    </tr>
                  {/each}
                </tbody></table>
              </div>
            </div>
          {/if}

          {#if referralsTab === "config"}
            <div class="section">
              <div class="sec-hdr">
                <div class="sec-title"><div class="sec-dot y"></div>Referral Multipliers</div>
                {#if can("missions.manage")}
                  <button class="btn btn-g btn-sm" on:click={saveReferralsConfig}>SAVE CONFIG</button>
                {/if}
              </div>
              <div class="sec-body" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                <div class="form-g"><label for="f1-register">F1 Register</label><input id="f1-register" class="inp" type="number" bind:value={referralConfig.f1Register} /></div>
                <div class="form-g"><label for="f1-active">F1 Active 7d</label><input id="f1-active" class="inp" type="number" bind:value={referralConfig.f1Active7d} /></div>
                <div class="form-g"><label for="f2-register">F2 Register</label><input id="f2-register" class="inp" type="number" bind:value={referralConfig.f2Register} /></div>
                <div class="form-g"><label for="f2-active">F2 Active 7d</label><input id="f2-active" class="inp" type="number" bind:value={referralConfig.f2Active7d} /></div>
                <div class="form-g"><label for="f1-max">Max F1 / Season</label><input id="f1-max" class="inp" type="number" bind:value={referralConfig.maxF1PerSeason} /></div>
              </div>
            </div>
          {/if}
        </div>
      {/if}

      {#if page === "matches"}
        <div class="pg active" id="pg-matches">
          <div class="section">
            <div class="sec-hdr"><div class="sec-title"><div class="sec-dot"></div>World Cup 2026 Schedule</div></div>
            <div class="sec-body" style="padding:0">
              <table class="tbl"><thead><tr><th>Group</th><th>Fixture</th><th>Stadium</th><th>Status</th><th>Date</th></tr></thead><tbody>
                {#each matchesData as m}
                  <tr>
                    <td>{m.groupCode}</td>
                    <td>{m.homeNation} vs {m.awayNation}</td>
                    <td>{m.stadium}</td>
                    <td>{m.status}</td>
                    <td>{new Date(m.kickoffAt).toLocaleString()}</td>
                  </tr>
                {/each}
              </tbody></table>
            </div>
          </div>
        </div>
      {/if}

      {#if page === "missions"}
        <div class="pg active" id="pg-missions">
          <div class="section">
            <div class="sec-hdr"><div class="sec-title"><div class="sec-dot"></div>Mission Control</div></div>
            <div class="sec-body" style="padding:0">
              <table class="tbl"><thead><tr><th>Code</th><th>Mission</th><th>Phase</th><th>Reward</th><th>Completions</th><th>Status</th></tr></thead><tbody>
                {#each missionsData as m}
                  <tr>
                    <td>{m.code}</td><td>{m.name}</td><td>{m.phase}</td><td>{m.rewardKick} KICK</td>
                    <td>{m.stats.completions}</td>
                    <td><span class={`tag ${m.isActive ? "tag-g" : "tag-r"}`}>{m.isActive ? "ACTIVE" : "OFF"}</span></td>
                  </tr>
                {/each}
              </tbody></table>
            </div>
          </div>
        </div>
      {/if}

      {#if page === "announce"}
        <div class="pg active" id="pg-announce">
          <div class="section">
            <div class="sec-hdr"><div class="sec-title"><div class="sec-dot"></div>Broadcast Announcement</div></div>
            <div class="sec-body" style="display:grid;gap:10px">
              <div style="display:grid;grid-template-columns:1fr 180px;gap:8px">
                <input class="inp" placeholder="Title" bind:value={annTitle} />
                <input class="inp" placeholder="Target" bind:value={annTarget} />
              </div>
              <textarea class="inp" rows="4" placeholder="Message" bind:value={annMessage}></textarea>
              <div><button class="btn btn-g" on:click={submitAnnouncement}>BROADCAST</button></div>
            </div>
          </div>

          <div class="section">
            <div class="sec-hdr"><div class="sec-title"><div class="sec-dot b"></div>History</div></div>
            <div class="sec-body" style="padding:0">
              <table class="tbl"><thead><tr><th>Time</th><th>Title</th><th>Target</th><th>Status</th></tr></thead><tbody>
                {#each announcements as ann}
                  <tr>
                    <td>{new Date(ann.createdAt).toLocaleString()}</td>
                    <td>{ann.title}</td>
                    <td>{ann.target}</td>
                    <td><span class={`tag ${ann.publishedAt ? "tag-g" : "tag-y"}`}>{ann.publishedAt ? "PUBLISHED" : "DRAFT"}</span></td>
                  </tr>
                {/each}
              </tbody></table>
            </div>
          </div>
        </div>
      {/if}

      {#if page === "rewards"}
        <div class="pg active" id="pg-rewards">
          <div class="section">
            <div class="sec-hdr">
              <div class="sec-title"><div class="sec-dot y"></div>KICK Ledger (Live)</div>
              <button class="btn btn-ghost btn-sm" on:click={downloadLedgerCsv}>EXPORT CSV</button>
            </div>
            <div class="sec-body" style="padding:0">
              <table class="tbl"><thead><tr><th>Time</th><th>User</th><th>Delta</th><th>Reason</th><th>Source</th></tr></thead><tbody>
                {#each ledger as item}
                  <tr>
                    <td>{new Date(item.createdAt).toLocaleString()}</td>
                    <td>@{item.user.username ?? "unknown"}</td>
                    <td style={`font-family:var(--mono);color:${item.delta >= 0 ? "var(--green)" : "var(--red)"}`}>{item.delta}</td>
                    <td>{item.reason}</td>
                    <td>{item.source}</td>
                  </tr>
                {/each}
              </tbody></table>
            </div>
          </div>

          <div class="section">
            <div class="sec-hdr">
              <div class="sec-title"><div class="sec-dot b"></div>Audit Trail ({auditTotal})</div>
              <div style="display:flex;gap:8px">
                <button class="btn btn-ghost btn-sm" on:click={loadAuditLogs}>REFRESH</button>
                <button class="btn btn-ghost btn-sm" on:click={downloadAuditCsv}>EXPORT CSV</button>
              </div>
            </div>
            <div class="sec-body" style="padding:0">
              <table class="tbl"><thead><tr><th>Time</th><th>Actor</th><th>Module</th><th>Action</th><th>Target</th></tr></thead><tbody>
                {#each auditLogs as row}
                  <tr>
                    <td>{new Date(row.createdAt).toLocaleString()}</td>
                    <td>@{row.actor?.username ?? "system"} <span style="color:var(--text3)">({row.actorRole ?? "-"})</span></td>
                    <td>{row.module}</td>
                    <td><code>{row.action}</code></td>
                    <td>{row.targetType ?? "-"}:{row.targetId ?? "-"}</td>
                  </tr>
                {/each}
              </tbody></table>
            </div>
          </div>
        </div>
      {/if}

      {#if page === "mysterybox"}
        <div class="pg active" id="pg-mysterybox">
          <div class="grid-4">
            <div class="mb-tier"><div class="mb-tier-icon">🎁</div><div class="mb-tier-name">Rising</div><div class="muted-line">25,000 KICK</div></div>
            <div class="mb-tier"><div class="mb-tier-icon">🎁</div><div class="mb-tier-name">Elite</div><div class="muted-line">100,000 KICK</div></div>
            <div class="mb-tier"><div class="mb-tier-icon">🎁</div><div class="mb-tier-name">Legacy</div><div class="muted-line">250,000 KICK</div></div>
            <div class="mb-tier"><div class="mb-tier-icon">🎁</div><div class="mb-tier-name">Vanguard</div><div class="muted-line">1,000,000 KICK</div></div>
          </div>
        </div>
      {/if}

      {#if page === "wc26token"}
        <div class="pg active" id="pg-wc26token">
          <div class="section">
            <div class="sec-hdr"><div class="sec-title"><div class="sec-dot y"></div>Eligible Holders (>= 5,000 KICK)</div></div>
            <div class="sec-body" style="padding:0">
              <table class="tbl"><thead><tr><th>User</th><th>Nation</th><th>KICK</th><th>Status</th></tr></thead><tbody>
                {#each eligibleTokenUsers as u}
                  <tr><td>@{u.username ?? "unknown"}</td><td>{u.nationCode}</td><td>{u.kick.toLocaleString()}</td><td>{u.status}</td></tr>
                {/each}
              </tbody></table>
            </div>
          </div>
        </div>
      {/if}

      {#if page === "nationpass"}
        <div class="pg active" id="pg-nationpass">
          <div class="section">
            <div class="sec-hdr"><div class="sec-title"><div class="sec-dot b"></div>Nation Pass Status</div></div>
            <div class="sec-body">
              <div class="empty"><div class="empty-icon">🏴</div><div class="empty-text">{placeholderMessage("Nation Pass")}</div></div>
            </div>
          </div>
        </div>
      {/if}

      {#if page === "social"}
        <div class="pg active" id="pg-social">
          <div class="tab-row">
            <button class="tab" class:active={socialTab === "channels"} on:click={() => (socialTab = "channels")}>Channels</button>
            <button class="tab" class:active={socialTab === "tasks"} on:click={() => (socialTab = "tasks")}>Tasks</button>
            <button class="tab" class:active={socialTab === "rewards"} on:click={() => (socialTab = "rewards")}>Rewards</button>
            <button class="tab" class:active={socialTab === "templates"} on:click={() => (socialTab = "templates")}>Templates</button>
          </div>

          {#if socialTab === "channels"}
            <div class="section"><div class="sec-hdr"><div class="sec-title"><div class="sec-dot"></div>Social Channels</div></div>
              <div class="sec-body">
                {#each socialChannels as ch}
                  <div class="sc-row">
                    <div class="sc-icon">{ch.icon}</div>
                    <div class="sc-info"><div class="sc-name">{ch.platform} · {ch.name}</div><div class="sc-url">{ch.url}</div></div>
                    <div class="sc-tasks">{ch.tasks} tasks · {ch.kick} KICK</div>
                  </div>
                {/each}
              </div>
            </div>
          {/if}

          {#if socialTab !== "channels"}
            <div class="section"><div class="sec-body"><div class="empty"><div class="empty-text">{placeholderMessage("Social " + socialTab)}</div></div></div></div>
          {/if}
        </div>
      {/if}

      {#if page === "spin"}
        <div class="pg active" id="pg-spin">
          <div class="section">
            <div class="sec-hdr"><div class="sec-title"><div class="sec-dot"></div>Lucky Spin Config (Live)</div></div>
            <div class="sec-body" style="display:grid;grid-template-columns:1.3fr .7fr;gap:12px">
              <div>
                <textarea class="inp" rows="16" bind:value={spinConfigText}></textarea>
                <div style="margin-top:8px"><button class="btn btn-g" on:click={() => saveConfig("spin")}>SAVE SPIN CONFIG</button></div>
              </div>
              <div>
                <div class="sec-title" style="font-size:14px;margin-bottom:10px"><div class="sec-dot b"></div>Probability Preview</div>
                {#if spinRewards.length === 0}
                  <div class="muted-line">No rewards array in config.</div>
                {:else}
                  {#each spinRewards as s}
                    <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
                      <div style="flex:1;font-size:11px">{s.id}</div>
                      <div class="prog" style="width:72px"><div class="prog-fill" style={`width:${s.chance}%;background:var(--green)`}></div></div>
                      <div style="font-family:var(--mono);font-size:9px;width:28px;text-align:right">{s.chance}%</div>
                    </div>
                  {/each}
                {/if}
              </div>
            </div>
          </div>
        </div>
      {/if}

      {#if page === "penalty"}
        <div class="pg active" id="pg-penalty">
          <div class="tab-row">
            <button class="tab" class:active={penaltyTab === "solo"} on:click={() => (penaltyTab = "solo")}>Solo</button>
            <button class="tab" class:active={penaltyTab === "pvp"} on:click={() => (penaltyTab = "pvp")}>PvP</button>
            <button class="tab" class:active={penaltyTab === "physics"} on:click={() => (penaltyTab = "physics")}>Physics</button>
            <button class="tab" class:active={penaltyTab === "skins"} on:click={() => (penaltyTab = "skins")}>Skins</button>
          </div>

          <div class="section">
            <div class="sec-hdr"><div class="sec-title"><div class="sec-dot"></div>Penalty Config (Live)</div></div>
            <div class="sec-body">
              <textarea class="inp" rows="16" bind:value={penaltyConfigText}></textarea>
              <div style="margin-top:8px"><button class="btn btn-g" on:click={() => saveConfig("penalty")}>SAVE PENALTY CONFIG</button></div>
            </div>
          </div>
        </div>
      {/if}

      {#if page === "settings"}
        <div class="pg active" id="pg-settings">
          <div class="section">
            <div class="sec-hdr"><div class="sec-title"><div class="sec-dot"></div>Feature Toggles</div></div>
            <div class="sec-body" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
              {#each ["Daily Quiz", "Lucky Spin", "Nation Wars", "Penalty Challenge", "PIQUE AI", "PvP Matchmaking"] as f}
                <div class="right-item"><span class="right-name">{f.toUpperCase()}</span><label class="toggle"><input type="checkbox" checked /><span class="toggle-slider"></span></label></div>
              {/each}
            </div>
          </div>
        </div>
      {/if}

      {#if page === "api"}
        <div class="pg active" id="pg-api">
          <div class="grid-4" style="margin-bottom:16px">
            <div class="stat-card" style="--accent:var(--green)">
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px"><div class={`h-dot ${systemHealth?.services.api.status === "ok" ? "h-ok" : "h-err"}`}></div><div style="font-family:var(--mono);font-size:10px;color:var(--text2)">API Server</div></div>
              <div style="font-family:var(--display);font-size:22px;font-weight:800;color:var(--green)">{systemHealth?.services.api.status?.toUpperCase() ?? "-"}</div>
              <div style="display:flex;gap:8px;margin-top:4px;font-family:var(--mono);font-size:9px;color:var(--text3)"><span>uptime {systemHealth?.uptimeSec ?? 0}s</span></div>
            </div>
            <div class="stat-card" style="--accent:var(--blue)">
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px"><div class={`h-dot ${systemHealth?.services.database.status === "ok" ? "h-ok" : "h-err"}`}></div><div style="font-family:var(--mono);font-size:10px;color:var(--text2)">Database</div></div>
              <div style="font-family:var(--display);font-size:22px;font-weight:800;color:var(--blue)">{systemHealth?.services.database.latencyMs ?? 0}ms</div>
              <div style="display:flex;gap:8px;margin-top:4px;font-family:var(--mono);font-size:9px;color:var(--text3)"><span>{systemHealth?.services.database.status ?? "-"}</span></div>
            </div>
            <div class="stat-card" style="--accent:var(--yellow)">
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px"><div class={`h-dot ${systemHealth?.services.sessionStore.status === "ok" ? "h-ok" : "h-err"}`}></div><div style="font-family:var(--mono);font-size:10px;color:var(--text2)">Session Store</div></div>
              <div style="font-family:var(--display);font-size:22px;font-weight:800;color:var(--yellow)">{systemHealth?.services.sessionStore.mode ?? "-"}</div>
              <div style="display:flex;gap:8px;margin-top:4px;font-family:var(--mono);font-size:9px;color:var(--text3)"><span>{systemHealth?.services.sessionStore.latencyMs ?? 0}ms</span></div>
            </div>
            <div class="stat-card" style="--accent:var(--red)">
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px"><div class={`h-dot ${(queueSnapshot?.highRiskPique ?? 0) > 0 ? "h-warn" : "h-ok"}`}></div><div style="font-family:var(--mono);font-size:10px;color:var(--text2)">Moderation Queue</div></div>
              <div style="font-family:var(--display);font-size:22px;font-weight:800;color:var(--red)">{(queueSnapshot?.pendingCompliance ?? 0) + (queueSnapshot?.highRiskPique ?? 0)}</div>
              <div style="display:flex;gap:8px;margin-top:4px;font-family:var(--mono);font-size:9px;color:var(--text3)"><span>compliance {queueSnapshot?.pendingCompliance ?? 0}</span><span>pique {queueSnapshot?.highRiskPique ?? 0}</span></div>
            </div>
          </div>
          <div class="section"><div class="sec-hdr"><div class="sec-title"><div class="sec-dot b"></div>API Notes</div></div>
            <div class="sec-body"><div class="api-log"><span class="log-info">/api/*</span> should be no-cache behind Cloudflare.<br /><span class="log-ok">WAF:</span> strict rules enabled for admin subdomain.<br /><span class="log-ok">Rate limit:</span> 100 req/min per IP.</div></div></div>
        </div>
      {/if}

      {#if page === "pique"}
        <div class="pg active" id="pg-pique">
          <div class="grid-2">
            <div class="section">
              <div class="sec-hdr"><div class="sec-title"><div class="sec-dot p"></div>Prompt & Rules</div></div>
              <div class="sec-body">
                <textarea class="inp" rows="9" value={systemPrompt}></textarea>
                <div style="margin-top:8px"><button class="btn btn-ghost btn-sm">SAVE PROMPT</button></div>
              </div>
            </div>

            <div class="section">
              <div class="sec-hdr"><div class="sec-title"><div class="sec-dot b"></div>Conversation Logs ({piqueTotal})</div></div>
              <div class="sec-body" style="display:grid;gap:8px">
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:8px">
                  <input class="inp" placeholder="Username" bind:value={piqueUsername} />
                  <input class="inp" placeholder="Keyword" bind:value={piqueKeyword} />
                  <input class="inp" placeholder="Sentiment" bind:value={piqueSentiment} />
                  <button class="btn btn-g" on:click={loadPique}>FILTER</button>
                </div>
                <div style="max-height:280px;overflow:auto;border:1px solid var(--border);border-radius:8px">
                  <table class="tbl"><thead><tr><th>Time</th><th>User</th><th>Prompt</th><th>Sent.</th></tr></thead><tbody>
                    {#each piqueLogs as row}
                      <tr>
                        <td>{new Date(row.createdAt).toLocaleString()}</td>
                        <td>@{row.username ?? row.telegramId ?? "unknown"}</td>
                        <td>{row.prompt}</td>
                        <td>{row.sentimentFlag ?? "neutral"}</td>
                      </tr>
                    {/each}
                  </tbody></table>
                </div>
              </div>
            </div>
          </div>
        </div>
      {/if}

      {#if page === "workflows"}
        <div class="pg active" id="pg-workflows">
          <div class="section">
            <div class="sec-hdr"><div class="sec-title"><div class="sec-dot"></div>Workflow Manager</div></div>
            <div class="sec-body" style="padding:0">
              {#each workflowStats as w}
                <div class="wf-card">
                  <div class="wf-icon" style="background:var(--blue-dim)">⚡</div>
                  <div class="wf-info"><div class="wf-name">{w.name}</div><div class="wf-desc">{w.desc}</div><div class="wf-meta">{w.runs} runs · {w.ok} success</div></div>
                  <span class="tag tag-b">{w.cat}</span>
                  <label class="toggle" style="margin-left:8px"><input type="checkbox" checked /><span class="toggle-slider"></span></label>
                </div>
              {/each}
            </div>
          </div>
        </div>
      {/if}

      {#if page === "board"}
        <div class="pg active" id="pg-board">
          <div class="section">
            <div class="sec-hdr"><div class="sec-title"><div class="sec-dot"></div>Board Members</div></div>
            <div class="sec-body" style="display:grid;gap:10px">
              {#each boardMembers as m}
                <div class="bm-card">
                  <div class="bm-avatar" style="background:var(--yellow)">{m.displayName.slice(0, 1).toUpperCase()}</div>
                  <div class="bm-info">
                    <div class="bm-name">{m.displayName} (@{m.username})</div>
                    <div class="bm-role">{m.role}</div>
                    <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">
                      <span class={`tag ${m.isActive ? "tag-g" : "tag-r"}`}>{m.isActive ? "ACTIVE" : "OFF"}</span>
                      <span class={`tag ${m.requiresTotp ? "tag-y" : "tag-b"}`}>{m.requiresTotp ? "TOTP ON" : "TOTP OFF"}</span>
                      <span class="tag tag-b">{m.telegramId}</span>
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          </div>

          {#if can("board.manage")}
            <div class="section">
              <div class="sec-hdr"><div class="sec-title"><div class="sec-dot y"></div>Add / Update Member</div></div>
              <div class="sec-body" style="display:grid;gap:8px">
                <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px">
                  <input class="inp" placeholder="Telegram ID" bind:value={boardForm.telegramId} />
                  <input class="inp" placeholder="Username" bind:value={boardForm.username} />
                  <input class="inp" placeholder="Display name" bind:value={boardForm.displayName} />
                </div>
                <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px">
                  <select class="inp" bind:value={boardForm.role}>
                    <option value="owner">owner</option>
                    <option value="admin">admin</option>
                    <option value="moderator">moderator</option>
                    <option value="support">support</option>
                    <option value="analyst">analyst</option>
                  </select>
                  <input class="inp" placeholder="TOTP secret (optional)" bind:value={boardForm.totpSecret} />
                  <div style="display:flex;gap:12px;align-items:center;padding:0 10px">
                    <label class="inline-check"><input type="checkbox" bind:checked={boardForm.requiresTotp} />requires TOTP</label>
                    <label class="inline-check"><input type="checkbox" bind:checked={boardForm.isActive} />active</label>
                  </div>
                </div>
                <div><button class="btn btn-g" on:click={submitBoardMember}>SAVE MEMBER</button></div>
              </div>
            </div>
          {/if}
        </div>
      {/if}

      {#if page === "adminme"}
        <div class="pg active" id="pg-adminme">
          <div class="grid-2">
            <div class="section">
              <div class="sec-hdr"><div class="sec-title"><div class="sec-dot"></div>Account Profile</div></div>
              <div class="sec-body">
                <div class="form-g"><label for="admin-username">Username</label><input id="admin-username" class="inp" value={$session.username ?? "admin"} /></div>
                <div class="form-g"><label for="admin-role">Role</label><input id="admin-role" class="inp" value={$session.role ?? "analyst"} /></div>
                <div class="form-g"><label for="admin-token">Current Token</label><input id="admin-token" class="inp" type="password" value="admin_secret_token_here" /></div>
              </div>
            </div>

            <div class="section">
              <div class="sec-hdr"><div class="sec-title"><div class="sec-dot b"></div>Recent Activity</div></div>
              <div class="sec-body" style="padding:0">
                <table class="tbl"><thead><tr><th>Time</th><th>Action</th><th>IP</th></tr></thead><tbody>
                  {#each ledger.slice(0, 5) as l}
                    <tr><td>{new Date(l.createdAt).toLocaleTimeString()}</td><td>KICK adjust @ {l.user.username ?? "user"}</td><td>103.45.67.89</td></tr>
                  {/each}
                </tbody></table>
              </div>
            </div>
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}

{#if error}
  <div id="toast"><div class="toast-item error">✗ {error}</div></div>
{/if}

{#if toast}
  <div id="toast"><div class="toast-item success">✓ {toast}</div></div>
{/if}
