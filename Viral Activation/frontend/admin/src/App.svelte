<script lang="ts">
  import { get } from "svelte/store";
  import { onDestroy, onMount } from "svelte";
  import {
    adjustMysteryBoxTickets,
    adjustKick,
    createAnnouncement,
    getMysteryBoxAllocations,
    downloadAuditLogsCsv,
    downloadKickLedgerCsv,
    getConfig,
    getDashboard,
    getReferralsConfig,
    getReferralsMetrics,
    getSystemHealth,
    getSystemQueue,
    installFreeNewsApiPack,
    listAuditLogs,
    listAnnouncements,
    listBoardMembers,
    listKickLedger,
    listKickLeaderboard,
    listMatches,
    listMissions,
    listMysteryBoxTicketUsers,
    listNationsLeaderboard,
    listPiqueConversations,
    listReferralChains,
    listReferralFlagged,
    listReferrersLeaderboard,
    listSocialChannels,
    listUsers,
    loginWithTelegram,
    logoutSession,
    openSseStream,
    refreshSession,
    deleteSocialChannel,
    updateConfig,
    updateMatchStatus,
    updateMysteryBoxAllocations,
    updateReferralsConfig,
    toggleSocialChannel,
    updateUserStatus,
    upsertBoardMember,
    upsertMatch,
    upsertMission,
    upsertSocialChannel,
    verifyTotp,
    toggleMission,
    type AdminRole,
    type AuditLogItem,
    type Announcement,
    type AppUser,
    type BoardMember,
    type FeedSnapshotPayload,
    type KickLedgerItem,
    type MatchFixture,
    type MissionItem,
    type MysteryBoxAllocationConfig,
    type MysteryBoxTier,
    type MysteryBoxTicketUser,
    type NationLeaderboardItem,
    type PiqueConversation,
    type ReferrerLeaderboardItem,
    type ReferralChain,
    type ReferralConfig,
    type ReferralFlaggedItem,
    type ReferralsMetrics,
    type KickLeaderboardItem,
    type SocialChannelItem,
    type SystemHealthSnapshot,
    type SystemQueueSnapshot,
    type UserTier,
    type UserTierStatItem,
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
    | "rules"
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
    users: "USERS MANAGEMENT",
    leaderboard: "LEADERBOARD",
    referrals: "REFERRALS",
    matches: "MATCH MANAGER",
    missions: "MISSION CONTROL",
    announce: "ANNOUNCEMENTS",
    rules: "GAME RULES",
    rewards: "REWARD TRANSACTIONS",
    mysterybox: "RANKING TIERS",
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
    rules: "WC26 NFT FANTASY · GAME RULEBOOK",
    rewards: "WC26 NFT FANTASY · REWARD LEDGER",
    mysterybox: "WC26 NFT FANTASY · RANKING TIER TRACKING",
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
        { id: "rules", icon: "📋", label: "Game Rules" },
        { id: "announce", icon: "📣", label: "Announcements" }
      ]
    },
    {
      label: "💰 Economy",
      items: [
        { id: "rewards", icon: "💎", label: "Rewards Dist." },
        { id: "mysterybox", icon: "🎁", label: "Ranking Tiers" },
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
    if (p === "rules") return "announcements.manage";
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

  const RULE_LANGUAGE_OPTIONS = ["en", "es", "pt", "kr", "jp"] as const;
  type RuleLanguageCode = (typeof RULE_LANGUAGE_OPTIONS)[number];

  type RuleContentEntry = {
    title: string;
    content: string;
    updatedAt: string | null;
  };

  const DEFAULT_RULE_TITLE = "📋 Game Rules & Airdrop Overview";
  const DEFAULT_RULE_CONTENT = [
    "## 1. Token Framework & Pools",
    "- **KICK** is an off-chain participation point used for ranking and eligibility.",
    "- **WC26** is the on-chain token allocated by official conversion events.",
    "- Mini Games Conversion Pool remains fixed at 10,000,000 WC26 in current policy.",
    "",
    "## 2. Eligibility Snapshot Basics",
    "- At least 10,000 KICK.",
    "- At least 7 active days.",
    "- Pass Anti-Sybil and compliance checks.",
    "",
    "Full legal rulebook and governance updates remain in Admin-managed announcement flows."
  ].join("\n");

  function isRuleLanguageCode(value: string): value is RuleLanguageCode {
    return value === "en" || value === "es" || value === "pt" || value === "kr" || value === "jp";
  }

  function normalizeRuleLanguage(value: string | null | undefined): RuleLanguageCode {
    const normalized = String(value ?? "")
      .trim()
      .toLowerCase();
    return isRuleLanguageCode(normalized) ? normalized : "en";
  }

  function emptyRuleContentEntry(): RuleContentEntry {
    return {
      title: "",
      content: "",
      updatedAt: null
    };
  }

  function defaultRuleEntries(): Record<RuleLanguageCode, RuleContentEntry> {
    return {
      en: {
        title: DEFAULT_RULE_TITLE,
        content: DEFAULT_RULE_CONTENT,
        updatedAt: null
      },
      es: emptyRuleContentEntry(),
      pt: emptyRuleContentEntry(),
      kr: emptyRuleContentEntry(),
      jp: emptyRuleContentEntry()
    };
  }

  function escapeHtml(value: string): string {
    return value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function sanitizeLink(url: string): string {
    const trimmed = url.trim();
    if (/^(https?:\/\/|mailto:)/i.test(trimmed)) return trimmed;
    return "#";
  }

  function formatInlineMarkdown(input: string): string {
    let output = escapeHtml(input);
    output = output.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label: string, href: string) => {
      const safeHref = escapeHtml(sanitizeLink(href));
      return `<a href="${safeHref}" target="_blank" rel="noreferrer">${label}</a>`;
    });
    output = output.replace(/`([^`]+?)`/g, "<code>$1</code>");
    output = output.replace(/\*\*([^*]+?)\*\*/g, "<strong>$1</strong>");
    output = output.replace(/\*([^*]+?)\*/g, "<em>$1</em>");
    return output;
  }

  function renderMarkdownToHtml(markdown: string): string {
    const lines = markdown.replaceAll("\r\n", "\n").split("\n");
    const html: string[] = [];
    let inUl = false;
    let inOl = false;

    const closeLists = (): void => {
      if (inUl) {
        html.push("</ul>");
        inUl = false;
      }
      if (inOl) {
        html.push("</ol>");
        inOl = false;
      }
    };

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        closeLists();
        continue;
      }

      const bulletMatch = line.match(/^[-*]\s+(.*)$/);
      if (bulletMatch) {
        if (inOl) {
          html.push("</ol>");
          inOl = false;
        }
        if (!inUl) {
          html.push("<ul>");
          inUl = true;
        }
        html.push(`<li>${formatInlineMarkdown(bulletMatch[1])}</li>`);
        continue;
      }

      const orderedMatch = line.match(/^\d+\.\s+(.*)$/);
      if (orderedMatch) {
        if (inUl) {
          html.push("</ul>");
          inUl = false;
        }
        if (!inOl) {
          html.push("<ol>");
          inOl = true;
        }
        html.push(`<li>${formatInlineMarkdown(orderedMatch[1])}</li>`);
        continue;
      }

      closeLists();

      if (line.startsWith("### ")) {
        html.push(`<h3>${formatInlineMarkdown(line.slice(4))}</h3>`);
        continue;
      }
      if (line.startsWith("## ")) {
        html.push(`<h2>${formatInlineMarkdown(line.slice(3))}</h2>`);
        continue;
      }
      if (line.startsWith("# ")) {
        html.push(`<h1>${formatInlineMarkdown(line.slice(2))}</h1>`);
        continue;
      }

      html.push(`<p>${formatInlineMarkdown(line)}</p>`);
    }

    closeLists();
    return html.join("");
  }

  type FootballNewsApiForm = {
    enabled: boolean;
    provider: string;
    baseUrl: string;
    apiKey: string;
    keyHeader: string;
    newsPath: string;
    fixturesPath: string;
    competitions: string;
    language: string;
    timezone: string;
    pollMinutes: string;
    timeoutMs: string;
  };

  type FootballNewsApiProfile = {
    id: string;
    name: string;
    value: FootballNewsApiForm;
  };

  function defaultFootballNewsApiForm(): FootballNewsApiForm {
    return {
      enabled: false,
      provider: "api-football",
      baseUrl: "https://v3.football.api-sports.io",
      apiKey: "",
      keyHeader: "x-apisports-key",
      newsPath: "/news",
      fixturesPath: "/fixtures",
      competitions: "FIFA-WC",
      language: "en",
      timezone: "UTC",
      pollMinutes: "10",
      timeoutMs: "12000"
    };
  }

  function cloneFootballNewsApiForm(form: FootballNewsApiForm): FootballNewsApiForm {
    return { ...form };
  }

  function defaultFootballProfileName(provider: string): string {
    const key = provider.trim().toLowerCase();
    if (key === "api-football") return "API-Football";
    if (key === "football-data") return "Football-Data";
    if (key === "thesportsdb") return "TheSportsDB";
    if (key === "openligadb") return "OpenLigaDB";
    if (key === "sportmonks") return "SportMonks";
    if (key === "custom") return "Custom API";
    return provider.trim() || "API Profile";
  }

  function createFootballProfileId(): string {
    return `api-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  const footballProviderPresets: Record<string, Partial<FootballNewsApiForm>> = {
    "api-football": {
      provider: "api-football",
      baseUrl: "https://v3.football.api-sports.io",
      keyHeader: "x-apisports-key",
      newsPath: "/news",
      fixturesPath: "/fixtures?league=1&season=2022&timezone=UTC",
      competitions: "FIFA-WC",
      language: "en",
      timezone: "UTC",
      pollMinutes: "10",
      timeoutMs: "12000"
    },
    "football-data": {
      provider: "football-data",
      baseUrl: "https://api.football-data.org/v4",
      keyHeader: "X-Auth-Token",
      newsPath: "/competitions/WC/matches?season=2022",
      fixturesPath: "/competitions/WC/matches?season=2022",
      competitions: "WC",
      language: "en",
      timezone: "UTC",
      pollMinutes: "15",
      timeoutMs: "12000"
    },
    thesportsdb: {
      provider: "thesportsdb",
      baseUrl: "https://www.thesportsdb.com/api/v1/json/3",
      keyHeader: "x-api-key",
      newsPath: "/eventsseason.php?id=4429&s=2022",
      fixturesPath: "/eventsseason.php?id=4429&s=2022",
      competitions: "FIFA-WC",
      language: "en",
      timezone: "UTC",
      pollMinutes: "20",
      timeoutMs: "12000"
    },
    openligadb: {
      provider: "openligadb",
      baseUrl: "https://api.openligadb.de",
      keyHeader: "x-api-key",
      newsPath: "/getmatchdata/wm2022",
      fixturesPath: "/getmatchdata/wm2022",
      competitions: "WM2022",
      language: "de",
      timezone: "UTC",
      pollMinutes: "20",
      timeoutMs: "12000"
    },
    sportmonks: {
      provider: "sportmonks",
      baseUrl: "https://api.sportmonks.com/v3/football",
      keyHeader: "Authorization",
      newsPath: "/news",
      fixturesPath: "/fixtures",
      competitions: "world-cup",
      language: "en",
      timezone: "UTC",
      pollMinutes: "10",
      timeoutMs: "12000"
    },
    custom: {
      provider: "custom",
      baseUrl: "",
      keyHeader: "x-api-key",
      newsPath: "/news",
      fixturesPath: "/fixtures",
      competitions: "FIFA-WC",
      language: "en",
      timezone: "UTC",
      pollMinutes: "10",
      timeoutMs: "12000"
    }
  };

  function applyFootballProviderPreset(provider: string) {
    const preset = footballProviderPresets[provider];
    if (!preset) return;
    footballNewsApiForm = {
      ...footballNewsApiForm,
      ...preset,
      provider
    };
  }

  function asRecord(value: unknown): Record<string, unknown> {
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  }

  function asString(value: unknown, fallback = ""): string {
    return typeof value === "string" ? value : fallback;
  }

  function asBoolean(value: unknown, fallback = false): boolean {
    return typeof value === "boolean" ? value : fallback;
  }

  function asNumberString(value: unknown, fallback: number): string {
    if (typeof value === "number" && Number.isFinite(value)) return String(Math.trunc(value));
    if (typeof value === "string" && value.trim()) return value.trim();
    return String(fallback);
  }

  function normalizeRuleEntry(value: unknown): RuleContentEntry {
    const node = asRecord(value);
    const title = asString(node.title, "").trim().slice(0, 200);
    const content = asString(node.content, "").trim().slice(0, 20_000);
    const updatedAt = asString(node.updatedAt, "").trim() || null;
    return {
      title,
      content,
      updatedAt
    };
  }

  function mergeRuleEntries(value: unknown): Record<RuleLanguageCode, RuleContentEntry> {
    const defaults = defaultRuleEntries();
    const rawEntries = asRecord(asRecord(value).entries);
    const nextEntries: Record<RuleLanguageCode, RuleContentEntry> = {
      ...defaults
    };

    for (const language of RULE_LANGUAGE_OPTIONS) {
      const parsed = normalizeRuleEntry(rawEntries[language]);
      if (!parsed.title && !parsed.content) continue;
      nextEntries[language] = parsed;
    }
    return nextEntries;
  }

  function parseFootballNewsApiForm(config: Record<string, unknown>): FootballNewsApiForm {
    const defaults = defaultFootballNewsApiForm();
    const footballNews = asRecord(config.footballNews);
    const endpoints = asRecord(footballNews.endpoints);
    const polling = asRecord(footballNews.polling);
    const defaultsNode = asRecord(footballNews.defaults);

    return {
      enabled: asBoolean(footballNews.enabled, defaults.enabled),
      provider: asString(footballNews.provider, defaults.provider),
      baseUrl: asString(footballNews.baseUrl, defaults.baseUrl),
      apiKey: asString(footballNews.apiKey, defaults.apiKey),
      keyHeader: asString(footballNews.keyHeader, defaults.keyHeader),
      newsPath: asString(endpoints.news, defaults.newsPath),
      fixturesPath: asString(endpoints.fixtures, defaults.fixturesPath),
      competitions: Array.isArray(defaultsNode.competitions)
        ? (defaultsNode.competitions as unknown[]).map((v) => String(v)).join(",")
        : asString(defaultsNode.competitions, defaults.competitions),
      language: asString(defaultsNode.language, defaults.language),
      timezone: asString(defaultsNode.timezone, defaults.timezone),
      pollMinutes: asNumberString(polling.intervalMinutes, Number(defaults.pollMinutes)),
      timeoutMs: asNumberString(polling.timeoutMs, Number(defaults.timeoutMs))
    };
  }

  function normalizeFootballNewsApiForm(form: FootballNewsApiForm): FootballNewsApiForm {
    const baseUrl = form.baseUrl.trim();
    if (!baseUrl) {
      throw new Error("Base URL is required");
    }

    let pollMinutes = Number(form.pollMinutes);
    let timeoutMs = Number(form.timeoutMs);
    if (!Number.isFinite(pollMinutes) || pollMinutes < 1) {
      throw new Error("Poll interval must be >= 1 minute");
    }
    if (!Number.isFinite(timeoutMs) || timeoutMs < 1000) {
      throw new Error("Timeout must be >= 1000 ms");
    }
    pollMinutes = Math.trunc(pollMinutes);
    timeoutMs = Math.trunc(timeoutMs);

    const competitions = form.competitions
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    return {
      enabled: Boolean(form.enabled),
      provider: form.provider.trim() || "custom",
      baseUrl,
      apiKey: form.apiKey.trim(),
      keyHeader: form.keyHeader.trim() || "x-api-key",
      newsPath: normalizePath(form.newsPath),
      fixturesPath: normalizePath(form.fixturesPath),
      competitions: competitions.join(","),
      language: form.language.trim() || "en",
      timezone: form.timezone.trim() || "UTC",
      pollMinutes: String(pollMinutes),
      timeoutMs: String(timeoutMs)
    };
  }

  function footballFormToConfigNode(form: FootballNewsApiForm): Record<string, unknown> {
    const competitions = form.competitions
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    return {
      enabled: form.enabled,
      provider: form.provider,
      baseUrl: form.baseUrl,
      apiKey: form.apiKey,
      keyHeader: form.keyHeader,
      endpoints: {
        news: form.newsPath,
        fixtures: form.fixturesPath
      },
      defaults: {
        competitions,
        language: form.language,
        timezone: form.timezone
      },
      polling: {
        intervalMinutes: Number(form.pollMinutes),
        timeoutMs: Number(form.timeoutMs)
      }
    };
  }

  function parseFootballNewsApiProfiles(
    config: Record<string, unknown>,
    fallbackForm: FootballNewsApiForm
  ): { profiles: FootballNewsApiProfile[]; activeId: string } {
    const rawProfiles = Array.isArray(config.footballNewsProfiles) ? config.footballNewsProfiles : [];
    const profiles = rawProfiles
      .map((raw, idx) => {
        const record = asRecord(raw);
        const form = parseFootballNewsApiForm({ footballNews: record });
        const id = asString(record.id, "").trim() || `api-${idx + 1}`;
        const name = asString(record.name, "").trim() || defaultFootballProfileName(form.provider);
        return {
          id,
          name,
          value: form
        };
      })
      .filter((profile) => profile.id.length > 0);

    if (profiles.length === 0) {
      const generatedId = createFootballProfileId();
      const generatedProfile: FootballNewsApiProfile = {
        id: generatedId,
        name: defaultFootballProfileName(fallbackForm.provider),
        value: cloneFootballNewsApiForm(fallbackForm)
      };
      return {
        profiles: [generatedProfile],
        activeId: generatedId
      };
    }

    const configuredActiveId = asString(config.footballNewsActiveProfileId, "").trim();
    const activeId = profiles.some((profile) => profile.id === configuredActiveId)
      ? configuredActiveId
      : profiles[0].id;

    return { profiles, activeId };
  }

  function setActiveFootballNewsProfile(profileId: string) {
    const selected = footballNewsProfiles.find((profile) => profile.id === profileId);
    if (!selected) return;
    footballNewsActiveProfileId = selected.id;
    footballNewsProfileName = selected.name;
    footballNewsApiForm = cloneFootballNewsApiForm(selected.value);
  }

  function addFootballNewsProfile() {
    const profileId = createFootballProfileId();
    const provider = footballNewsApiForm.provider.trim() || "custom";
    const profileName = footballNewsProfileName.trim() || defaultFootballProfileName(provider);
    footballNewsProfiles = [
      ...footballNewsProfiles,
      {
        id: profileId,
        name: profileName,
        value: cloneFootballNewsApiForm(footballNewsApiForm)
      }
    ];
    setActiveFootballNewsProfile(profileId);
    showToast("API profile added. Click SAVE CONFIG to persist.");
  }

  function deleteFootballNewsProfile() {
    if (footballNewsProfiles.length <= 1) {
      showToast("At least 1 API profile is required");
      return;
    }

    const selected = footballNewsProfiles.find((profile) => profile.id === footballNewsActiveProfileId);
    const targetName = selected?.name ?? "this profile";
    const ok = window.confirm(`Delete API profile \"${targetName}\"?`);
    if (!ok) return;

    const nextProfiles = footballNewsProfiles.filter((profile) => profile.id !== footballNewsActiveProfileId);
    footballNewsProfiles = nextProfiles;
    setActiveFootballNewsProfile(nextProfiles[0].id);
    showToast("API profile deleted. Click SAVE CONFIG to persist.");
  }

  type SpinRewardConfig = {
    id: string;
    chance: string;
    value: string;
  };

  type PenaltyConfigForm = {
    soloFreePerDay: string;
    soloExtraCost: string;
    soloWin: string;
    pvpWin: string;
    pvpLose: string;
    pvpBurn: string;
  };

  type SocialChannelForm = {
    id: string;
    category: string;
    missionId: string;
    url: string;
    icon: string;
    sortOrder: string;
    isActive: boolean;
  };

  function defaultSpinConfig() {
    return {
      dailyCap: 5,
      rewards: [
        { id: "k50", chance: 30, value: 50 },
        { id: "k100", chance: 25, value: 100 },
        { id: "k200", chance: 10, value: 200 },
        { id: "q2x", chance: 10, value: 2 },
        { id: "ref3x", chance: 5, value: 3 },
        { id: "box", chance: 5, value: 1 },
        { id: "none", chance: 15, value: 0 }
      ]
    };
  }

  function defaultPenaltyConfig() {
    return {
      soloFreePerDay: 3,
      soloExtraCost: 500,
      soloWin: 2000,
      pvpWin: 2000,
      pvpLose: -2500,
      pvpBurn: 500
    };
  }

  function defaultSocialChannelForm(): SocialChannelForm {
    return {
      id: "",
      category: "",
      missionId: "",
      url: "",
      icon: "📱",
      sortOrder: "0",
      isActive: true
    };
  }

  type MysteryTierPolicyItem = {
    tier: MysteryBoxTier;
    label: string;
    minKick: number;
    kickRangeLabel: string;
    bonusLabel: string;
    rightsLabel: string;
    maxPerUser: number;
    gameplayLabel: string;
    rewardsLabel: string;
    defaultTotalBoxes: number;
  };

  const MYSTERY_TIER_POLICY: MysteryTierPolicyItem[] = [
    {
      tier: "rookie",
      label: "Rookie",
      minKick: 0,
      kickRangeLabel: "0 - 25,000 KICK",
      bonusLabel: "",
      rightsLabel: "2.5% discount · Max 25 boxes",
      maxPerUser: 25,
      gameplayLabel: "+1 Daily Lucky Spin",
      rewardsLabel: "Rookie badge",
      defaultTotalBoxes: 25_000
    },
    {
      tier: "starter",
      label: "Starter",
      minKick: 25_000,
      kickRangeLabel: "25,000 - 100,000 KICK",
      bonusLabel: "",
      rightsLabel: "5% discount · Max 25 boxes",
      maxPerUser: 25,
      gameplayLabel: "+2 Lucky Spins/day",
      rewardsLabel: "Starter badge · 1 Rising Box lottery ticket",
      defaultTotalBoxes: 25_000
    },
    {
      tier: "pro",
      label: "Pro",
      minKick: 100_000,
      kickRangeLabel: "100,000 - 250,000 KICK",
      bonusLabel: "2,000 KICK",
      rightsLabel: "VIP whitelist · 10% discount · Max 20 boxes",
      maxPerUser: 20,
      gameplayLabel: "+3 Lucky Spins/day",
      rewardsLabel: "Pro badge · 2 Rising Box lottery ticket",
      defaultTotalBoxes: 5_000
    },
    {
      tier: "champion",
      label: "Champion",
      minKick: 250_000,
      kickRangeLabel: "250,000 - 500,000 KICK",
      bonusLabel: "5,000 KICK",
      rightsLabel: "VIP whitelist · 12.5% discount · Max 15 boxes",
      maxPerUser: 15,
      gameplayLabel: "+4 Lucky Spins/day",
      rewardsLabel: "Champion badge · 1 Rising Box guaranteed",
      defaultTotalBoxes: 2_500
    },
    {
      tier: "master",
      label: "Master",
      minKick: 500_000,
      kickRangeLabel: "500,000 - 1,000,000 KICK",
      bonusLabel: "10,000 KICK",
      rightsLabel: "VIP whitelist · 15% discount · Max 12 boxes",
      maxPerUser: 12,
      gameplayLabel: "+5 Lucky Spins/day",
      rewardsLabel: "Master badge · 1 Elite Box guaranteed",
      defaultTotalBoxes: 2_000
    },
    {
      tier: "legend",
      label: "Legend",
      minKick: 1_000_000,
      kickRangeLabel: "1,000,000+ KICK",
      bonusLabel: "25,000 KICK",
      rightsLabel: "Ultra VIP whitelist · 20% discount · Max 10 boxes",
      maxPerUser: 10,
      gameplayLabel: "+6 Lucky Spins/day",
      rewardsLabel: "Legend badge · 1 Legacy Mystery Box guaranteed · Hall of Fame leaderboard",
      defaultTotalBoxes: 1_000
    }
  ];

  const LEGACY_MYSTERY_TIER_MAP: Partial<Record<string, MysteryBoxTier>> = {
    rising: "starter",
    elite: "pro",
    legacy: "champion",
    vanguard: "legend"
  };

  const MYSTERY_TIER_POLICY_MAP = new Map(MYSTERY_TIER_POLICY.map((item) => [item.tier, item]));
  const MYSTERY_TIER_POLICY_DESC = [...MYSTERY_TIER_POLICY].sort((left, right) => right.minKick - left.minKick);

  function normalizeMysteryTierKey(value: string): MysteryBoxTier | null {
    const normalized = String(value).trim().toLowerCase();
    if (MYSTERY_TIER_POLICY_MAP.has(normalized as MysteryBoxTier)) {
      return normalized as MysteryBoxTier;
    }
    return LEGACY_MYSTERY_TIER_MAP[normalized] ?? null;
  }

  function mysteryTierPolicy(tier: string): MysteryTierPolicyItem | null {
    const normalizedTier = normalizeMysteryTierKey(tier);
    if (!normalizedTier) return null;
    return MYSTERY_TIER_POLICY_MAP.get(normalizedTier) ?? null;
  }

  function resolveTierByKick(kick: number): UserTier {
    const safeKick = Number.isFinite(kick) ? kick : 0;
    for (const policy of MYSTERY_TIER_POLICY_DESC) {
      if (safeKick >= policy.minKick) return policy.tier;
    }
    return "rookie";
  }

  function userTier(user: AppUser): UserTier {
    return normalizeMysteryTierKey(user.tier) ?? resolveTierByKick(user.kick);
  }

  function defaultMysteryBoxAllocationConfig(): MysteryBoxAllocationConfig {
    return {
      allocations: MYSTERY_TIER_POLICY.map((policy) => ({
        tier: policy.tier,
        totalBoxes: policy.defaultTotalBoxes,
        minKick: policy.minKick,
        maxPerUser: policy.maxPerUser,
        isActive: true
      })),
      requireActiveDays: 7,
      requireSybilPass: true,
      snapshotAt: null
    };
  }

  function normalizeMysteryBoxConfig(raw: MysteryBoxAllocationConfig | null | undefined): MysteryBoxAllocationConfig {
    const fallback = defaultMysteryBoxAllocationConfig();
    if (!raw) return fallback;

    const sourceAllocations = Array.isArray(raw.allocations) ? raw.allocations : [];
    const byTier = new Map<MysteryBoxTier, (typeof sourceAllocations)[number]>();
    for (const row of sourceAllocations) {
      const rawTier = String((row as { tier?: unknown }).tier ?? "");
      const normalizedTier = normalizeMysteryTierKey(rawTier);
      if (!normalizedTier) continue;
      const rowTier = rawTier.trim().toLowerCase();
      if (rowTier === normalizedTier || !byTier.has(normalizedTier)) {
        byTier.set(normalizedTier, row);
      }
    }
    const snapshotCandidate = typeof raw.snapshotAt === "string" && raw.snapshotAt.trim() ? new Date(raw.snapshotAt) : null;
    const allocations = MYSTERY_TIER_POLICY.map((policy) => {
      const current = byTier.get(policy.tier);
      const totalBoxes =
        current && Number.isFinite(current.totalBoxes)
          ? Math.max(0, Math.trunc(current.totalBoxes))
          : policy.defaultTotalBoxes;
      return {
        tier: policy.tier,
        totalBoxes,
        minKick: policy.minKick,
        maxPerUser: policy.maxPerUser,
        isActive: current?.isActive ?? true
      };
    });

    return {
      allocations,
      requireActiveDays: Number.isFinite(raw.requireActiveDays)
        ? Math.max(0, Math.trunc(raw.requireActiveDays))
        : fallback.requireActiveDays,
      requireSybilPass: typeof raw.requireSybilPass === "boolean" ? raw.requireSybilPass : fallback.requireSybilPass,
      snapshotAt: snapshotCandidate && Number.isFinite(snapshotCandidate.getTime()) ? snapshotCandidate.toISOString() : null
    };
  }

  let page: PageId = "dashboard";
  let sidebarCollapsed = false;
  let sidebarLogoBroken = false;
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
  let userTierStats: UserTierStatItem[] = [];
  let userQ = "";
  let userStatus: "all" | UserStatus = "all";
  let userTierFilter: "all" | UserTier = "all";

  let ledger: KickLedgerItem[] = [];
  let selectedUserId = "";
  let kickDelta = 2000;
  let kickReason = "Manual adjustment";

  let spinConfigText = "{}";
  let penaltyConfigText = "{}";
  let spinDailyCap = "5";
  let spinRewardsForm: SpinRewardConfig[] = [];
  let penaltyForm: PenaltyConfigForm = {
    soloFreePerDay: "3",
    soloExtraCost: "500",
    soloWin: "2000",
    pvpWin: "2000",
    pvpLose: "-2500",
    pvpBurn: "500"
  };
  let footballNewsApiForm: FootballNewsApiForm = defaultFootballNewsApiForm();
  let footballNewsProfiles: FootballNewsApiProfile[] = [];
  let footballNewsActiveProfileId = "";
  let footballNewsProfileName = "";

  let announcements: Announcement[] = [];
  let annTitle = "";
  let annMessage = "";
  let annTarget = "all";
  let rulesDefaultLanguage: RuleLanguageCode = "en";
  let rulesEditorLanguage: RuleLanguageCode = "en";
  let rulesEntries: Record<RuleLanguageCode, RuleContentEntry> = defaultRuleEntries();
  let rulesEditorEntry: RuleContentEntry = rulesEntries.en;
  let rulesPreviewHtml = renderMarkdownToHtml(rulesEditorEntry.content);
  $: rulesEditorEntry = rulesEntries[rulesEditorLanguage];
  $: rulesPreviewHtml = renderMarkdownToHtml(rulesEditorEntry.content);

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
  let leaderboardKick: KickLeaderboardItem[] = [];
  let leaderboardReferrers: ReferrerLeaderboardItem[] = [];
  let leaderboardNations: NationLeaderboardItem[] = [];
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
  let socialChannels: SocialChannelItem[] = [];
  let socialChannelsTotal = 0;
  let mysteryConfig: MysteryBoxAllocationConfig = defaultMysteryBoxAllocationConfig();
  let mysteryTicketUsers: MysteryBoxTicketUser[] = [];
  let mysteryTicketsTotal = 0;
  let mysteryTicketsSum = 0;
  let mysteryTicketQ = "";
  let mysterySelectedUserId = "";
  let mysteryTicketDelta = 1;
  let mysteryTicketReason = "Manual mystery ticket adjustment";
  let socialChannelForm: SocialChannelForm = defaultSocialChannelForm();
  $: if (page === "social") {
    ensureSocialFormSelection();
  }
  let matchForm: {
    id: string;
    groupCode: string;
    homeNation: string;
    awayNation: string;
    stadium: string;
    city: string;
    kickoffAt: string;
    status: string;
    homeScore: string;
    awayScore: string;
    highlight: string;
  } = {
    id: "",
    groupCode: "A",
    homeNation: "",
    awayNation: "",
    stadium: "",
    city: "",
    kickoffAt: "",
    status: "scheduled",
    homeScore: "",
    awayScore: "",
    highlight: ""
  };
  let missionForm: {
    id: string;
    code: string;
    name: string;
    phase: string;
    category: string;
    channelId: string;
    rewardKick: string;
    capPerDay: string;
    isActive: boolean;
  } = {
    id: "",
    code: "",
    name: "",
    phase: "Viral Activation",
    category: "daily",
    channelId: "",
    rewardKick: "100",
    capPerDay: "",
    isActive: true
  };

  const topNations = [
    { flag: "🇧🇷", name: "Brazil", pts: "2.4M", rank: 1 },
    { flag: "🇦🇷", name: "Argentina", pts: "2.1M", rank: 2 },
    { flag: "🇫🇷", name: "France", pts: "1.9M", rank: 3 },
    { flag: "🇩🇪", name: "Germany", pts: "1.7M", rank: 4 },
    { flag: "🇻🇳", name: "Vietnam", pts: "1.2M", rank: 5 }
  ];

  const nationFlagByCode: Record<string, string> = {
    AR: "🇦🇷",
    BR: "🇧🇷",
    DE: "🇩🇪",
    ES: "🇪🇸",
    FR: "🇫🇷",
    GB: "🇬🇧",
    IT: "🇮🇹",
    JP: "🇯🇵",
    KR: "🇰🇷",
    PT: "🇵🇹",
    US: "🇺🇸",
    VN: "🇻🇳"
  };

  const workflowStats = [
    { name: "Auto KICK on Register", desc: "Grant 100 KICK to new users", runs: 2847, ok: 2841, cat: "User Lifecycle" },
    { name: "Jackpot Announcement", desc: "Broadcast jackpot winners", runs: 14, ok: 14, cat: "Economy" },
    { name: "Spin Streak Reward", desc: "3-day streak -> 500 KICK", runs: 431, ok: 428, cat: "Economy" }
  ];

  const systemPrompt =
    "You are PIQUE, the official AI assistant for WC26 NFT FANTASY. Focus on football gameplay, KICK strategy, and app guidance.";

  function statusTag(status: UserStatus): string {
    if (status === "vip") return "tag-y";
    if (status === "banned") return "tag-r";
    return "tag-g";
  }

  function nationFlag(code: string): string {
    return nationFlagByCode[code.toUpperCase()] ?? "🏳️";
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

  function toDatetimeLocalValue(iso: string): string {
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return "";
    const localMs = dt.getTime() - dt.getTimezoneOffset() * 60_000;
    return new Date(localMs).toISOString().slice(0, 16);
  }

  function asText(value: unknown): string {
    if (typeof value === "string") return value;
    if (value === null || value === undefined) return "";
    return String(value);
  }

  function parseOptionalInt(value: unknown, field: string): number | undefined {
    const normalized = asText(value).trim();
    if (!normalized) return undefined;
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed)) {
      throw new Error(`Invalid number in ${field}`);
    }
    return Math.trunc(parsed);
  }

  function normalizePath(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) return "/";
    return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  }

  function resetMatchForm() {
    matchForm = {
      id: "",
      groupCode: "A",
      homeNation: "",
      awayNation: "",
      stadium: "",
      city: "",
      kickoffAt: "",
      status: "scheduled",
      homeScore: "",
      awayScore: "",
      highlight: ""
    };
  }

  function setMatchFormFromItem(match: MatchFixture) {
    matchForm = {
      id: match.id,
      groupCode: match.groupCode,
      homeNation: match.homeNation,
      awayNation: match.awayNation,
      stadium: match.stadium,
      city: match.city ?? "",
      kickoffAt: toDatetimeLocalValue(match.kickoffAt),
      status: match.status,
      homeScore: match.homeScore === null ? "" : String(match.homeScore),
      awayScore: match.awayScore === null ? "" : String(match.awayScore),
      highlight: match.highlight ?? ""
    };
  }

  function resetMissionForm() {
    missionForm = {
      id: "",
      code: "",
      name: "",
      phase: "Viral Activation",
      category: "daily",
      channelId: "",
      rewardKick: "100",
      capPerDay: "",
      isActive: true
    };
  }

  function resetFootballNewsApiForm() {
    footballNewsApiForm = defaultFootballNewsApiForm();
    if (!footballNewsProfileName.trim()) {
      footballNewsProfileName = defaultFootballProfileName(footballNewsApiForm.provider);
    }
  }

  function toSafeInt(value: string, fallback = 0): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.trunc(parsed);
  }

  function syncSpinFormFromText() {
    try {
      const parsed = JSON.parse(spinConfigText) as {
        dailyCap?: number;
        rewards?: Array<{ id?: string; chance?: number; value?: number }>;
      };
      const rewards = Array.isArray(parsed.rewards) ? parsed.rewards : [];
      spinDailyCap = String(typeof parsed.dailyCap === "number" ? parsed.dailyCap : 5);
      spinRewardsForm =
        rewards.length > 0
          ? rewards.map((row) => ({
              id: String(row.id ?? ""),
              chance: String(typeof row.chance === "number" ? row.chance : 0),
              value: String(typeof row.value === "number" ? row.value : 0)
            }))
          : defaultSpinConfig().rewards.map((row) => ({
              id: row.id,
              chance: String(row.chance),
              value: String(row.value)
            }));
    } catch {
      const template = defaultSpinConfig();
      spinDailyCap = String(template.dailyCap);
      spinRewardsForm = template.rewards.map((row) => ({
        id: row.id,
        chance: String(row.chance),
        value: String(row.value)
      }));
    }
  }

  function applySpinFormToText() {
    const rewards = spinRewardsForm
      .map((row) => ({
        id: row.id.trim(),
        chance: toSafeInt(row.chance),
        value: toSafeInt(row.value)
      }))
      .filter((row) => row.id.length > 0);

    const next = {
      dailyCap: toSafeInt(spinDailyCap, 5),
      rewards
    };
    spinConfigText = JSON.stringify(next, null, 2);
  }

  function loadSpinTemplate() {
    spinConfigText = JSON.stringify(defaultSpinConfig(), null, 2);
    syncSpinFormFromText();
  }

  function addSpinRewardRow() {
    spinRewardsForm = [
      ...spinRewardsForm,
      {
        id: "",
        chance: "0",
        value: "0"
      }
    ];
  }

  function removeSpinRewardRow(index: number) {
    spinRewardsForm = spinRewardsForm.filter((_, i) => i !== index);
    applySpinFormToText();
  }

  function syncPenaltyFormFromText() {
    try {
      const parsed = JSON.parse(penaltyConfigText) as {
        soloFreePerDay?: number;
        soloExtraCost?: number;
        soloWin?: number;
        pvpWin?: number;
        pvpLose?: number;
        pvpBurn?: number;
      };
      penaltyForm = {
        soloFreePerDay: String(typeof parsed.soloFreePerDay === "number" ? parsed.soloFreePerDay : 3),
        soloExtraCost: String(typeof parsed.soloExtraCost === "number" ? parsed.soloExtraCost : 500),
        soloWin: String(typeof parsed.soloWin === "number" ? parsed.soloWin : 2000),
        pvpWin: String(typeof parsed.pvpWin === "number" ? parsed.pvpWin : 2000),
        pvpLose: String(typeof parsed.pvpLose === "number" ? parsed.pvpLose : -2500),
        pvpBurn: String(typeof parsed.pvpBurn === "number" ? parsed.pvpBurn : 500)
      };
    } catch {
      const template = defaultPenaltyConfig();
      penaltyForm = {
        soloFreePerDay: String(template.soloFreePerDay),
        soloExtraCost: String(template.soloExtraCost),
        soloWin: String(template.soloWin),
        pvpWin: String(template.pvpWin),
        pvpLose: String(template.pvpLose),
        pvpBurn: String(template.pvpBurn)
      };
    }
  }

  function applyPenaltyFormToText() {
    const next = {
      soloFreePerDay: toSafeInt(penaltyForm.soloFreePerDay, 3),
      soloExtraCost: toSafeInt(penaltyForm.soloExtraCost, 500),
      soloWin: toSafeInt(penaltyForm.soloWin, 2000),
      pvpWin: toSafeInt(penaltyForm.pvpWin, 2000),
      pvpLose: toSafeInt(penaltyForm.pvpLose, -2500),
      pvpBurn: toSafeInt(penaltyForm.pvpBurn, 500)
    };
    penaltyConfigText = JSON.stringify(next, null, 2);
  }

  function loadPenaltyTemplate() {
    penaltyConfigText = JSON.stringify(defaultPenaltyConfig(), null, 2);
    syncPenaltyFormFromText();
  }

  function resetSocialChannelForm() {
    socialChannelForm = defaultSocialChannelForm();
  }

  function missionCategoryOptions(): string[] {
    return [...new Set(missionsData.map((mission) => mission.category).filter((value) => value.trim().length > 0))].sort(
      (left, right) => left.localeCompare(right)
    );
  }

  function missionsForCategory(category: string): MissionItem[] {
    if (!category.trim()) return missionsData;
    return missionsData.filter((mission) => mission.category === category);
  }

  function findMissionById(missionId: string): MissionItem | null {
    const found = missionsData.find((mission) => mission.id === missionId);
    return found ?? null;
  }

  function findMappedMissionByChannelId(channelId: string): MissionItem | null {
    const found = missionsData.find((mission) => mission.channelId === channelId);
    return found ?? null;
  }

  function inferPlatformFromMission(mission: MissionItem): string {
    const text = `${mission.category} ${mission.code} ${mission.name}`.toLowerCase();
    if (text.includes("telegram") || text.includes("tg")) return "Telegram";
    if (text.includes("twitter") || text.includes(" x")) return "Twitter/X";
    if (text.includes("facebook") || text.includes("instagram") || text.includes("meta")) return "Meta";
    if (text.includes("youtube")) return "YouTube";
    if (text.includes("tiktok")) return "TikTok";
    if (text.includes("referral") || text.includes("invite") || text.includes("growth")) return "Growth";
    if (text.includes("amplification") || text.includes("share")) return "Amplification";
    return "Social";
  }

  function inferIconFromPlatform(platform: string): string {
    const key = platform.toLowerCase();
    if (key.includes("telegram")) return "📣";
    if (key.includes("twitter") || key.includes("x")) return "🐦";
    if (key.includes("meta") || key.includes("instagram") || key.includes("facebook")) return "📸";
    if (key.includes("youtube")) return "▶️";
    if (key.includes("tiktok")) return "🎬";
    if (key.includes("growth")) return "🚀";
    if (key.includes("amplification")) return "📢";
    return "🔗";
  }

  function ensureSocialFormSelection() {
    if (socialChannelForm.id) return;
    const categories = missionCategoryOptions();
    let category = socialChannelForm.category;
    if (!category || !categories.includes(category)) {
      category = categories[0] ?? "";
    }
    const missions = missionsForCategory(category);
    let missionId = socialChannelForm.missionId;
    if (!missionId || !missions.some((mission) => mission.id === missionId)) {
      missionId = missions[0]?.id ?? "";
    }
    if (category !== socialChannelForm.category || missionId !== socialChannelForm.missionId) {
      socialChannelForm = {
        ...socialChannelForm,
        category,
        missionId
      };
    }
  }

  function onSocialCategoryChanged(nextCategory: string) {
    const missions = missionsForCategory(nextCategory);
    socialChannelForm = {
      ...socialChannelForm,
      category: nextCategory,
      missionId: missions[0]?.id ?? ""
    };
  }

  function handleSocialCategoryChange(event: Event) {
    const target = event.currentTarget as HTMLSelectElement | null;
    onSocialCategoryChanged(target?.value ?? "");
  }

  function setSocialChannelFormFromItem(channel: SocialChannelItem) {
    const linkedMission = findMappedMissionByChannelId(channel.id);
    const categories = missionCategoryOptions();
    const fallbackCategory = categories[0] ?? "";
    socialChannelForm = {
      id: channel.id,
      category: linkedMission?.category ?? fallbackCategory,
      missionId: linkedMission?.id ?? "",
      url: channel.url,
      icon: channel.icon ?? inferIconFromPlatform(channel.platform),
      sortOrder: String(channel.sortOrder),
      isActive: channel.isActive
    };
  }

  function setMissionFormFromItem(mission: MissionItem) {
    missionForm = {
      id: mission.id,
      code: mission.code,
      name: mission.name,
      phase: mission.phase,
      category: mission.category,
      channelId: mission.channelId ?? "",
      rewardKick: String(mission.rewardKick),
      capPerDay: mission.capPerDay === null ? "" : String(mission.capPerDay),
      isActive: mission.isActive
    };
  }

  function patchMysteryAllocation(
    index: number,
    patch: Partial<MysteryBoxAllocationConfig["allocations"][number]>
  ) {
    mysteryConfig = {
      ...mysteryConfig,
      allocations: mysteryConfig.allocations.map((row, i) => (i === index ? { ...row, ...patch } : row))
    };
  }

  function tierLabel(tier: string): string {
    const policy = mysteryTierPolicy(tier);
    if (policy) return policy.label;
    return tier.charAt(0).toUpperCase() + tier.slice(1);
  }

  function tierKickLabel(tier: string): string {
    return mysteryTierPolicy(tier)?.kickRangeLabel ?? "-";
  }

  function tierBonusLabel(tier: string): string {
    return mysteryTierPolicy(tier)?.bonusLabel ?? "-";
  }

  function tierMaxPerUser(tier: string): number {
    return mysteryTierPolicy(tier)?.maxPerUser ?? 0;
  }

  function tierRightsLabel(tier: string): string {
    const policy = mysteryTierPolicy(tier);
    if (!policy) return "Whitelist access · fixed discount · mystery box quota by policy";
    return policy.rightsLabel;
  }

  function tierGameplayLabel(tier: string): string {
    return mysteryTierPolicy(tier)?.gameplayLabel ?? "-";
  }

  function tierRewardsLabel(tier: string): string {
    return mysteryTierPolicy(tier)?.rewardsLabel ?? "-";
  }

  function mysterySnapshotInputValue(): string {
    return mysteryConfig.snapshotAt ? toDatetimeLocalValue(mysteryConfig.snapshotAt) : "";
  }

  function setMysterySnapshot(value: string) {
    mysteryConfig = {
      ...mysteryConfig,
      snapshotAt: value.trim() ? new Date(value).toISOString() : null
    };
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
    if (can("api.manage")) tasks.push(loadApiConfig());
    if (can("announcements.manage")) {
      tasks.push(loadAnnouncements(), loadRulesConfig());
    }
    if (can("pique.logs.read")) tasks.push(loadPique());
    if (can("board.manage")) tasks.push(loadBoard());
    if (can("reports.read")) tasks.push(loadAuditLogs());
    if (can("dashboard.read")) {
      tasks.push(loadOperationalData(), loadLeaderboard(), loadReferrals(), loadMatches(), loadMissions(), loadSocialChannels());
    }
    if (can("economy.manage")) {
      tasks.push(loadMysteryBox());
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
    if (next === "leaderboard") await loadLeaderboard();
    if (next === "api") await loadApiConfig();
    if (next === "rewards") await loadAuditLogs();
    if (next === "spin" || next === "penalty") await loadConfigs();
    if (next === "announce") await loadAnnouncements();
    if (next === "rules") await loadRulesConfig();
    if (next === "pique") await loadPique();
    if (next === "board") await loadBoard();
    if (next === "referrals") await loadReferrals();
    if (next === "matches") await loadMatches();
    if (next === "missions") await Promise.all([loadMissions(), loadSocialChannels()]);
    if (next === "mysterybox") await loadMysteryBox();
    if (next === "social") await Promise.all([loadMissions(), loadSocialChannels()]);
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
        tier: userTierFilter === "all" ? undefined : userTierFilter,
        limit: 100
      })
    );
    users = userRes.items;
    usersTotal = userRes.total;
    userTierStats = userRes.tierStats;
    if (!selectedUserId && users[0]) selectedUserId = users[0].id;
    const ledgerRes = await withAccess((token) => listKickLedger(token, { limit: 80 }));
    ledger = ledgerRes.items;
  }

  async function loadLeaderboard() {
    const [kickRes, refRes, nationRes] = await Promise.all([
      withAccess((token) => listKickLeaderboard(token, { limit: 50 })),
      withAccess((token) => listReferrersLeaderboard(token, { limit: 50 })),
      withAccess((token) => listNationsLeaderboard(token, { limit: 50 }))
    ]);

    leaderboardKick = kickRes.items;
    leaderboardReferrers = refRes.items;
    leaderboardNations = nationRes.items;
  }

  async function loadConfigs() {
    const [spin, penalty] = await Promise.all([
      withAccess((token) => getConfig(token, "spin")),
      withAccess((token) => getConfig(token, "penalty"))
    ]);
    const spinValue = asRecord(spin.value);
    const penaltyValue = asRecord(penalty.value);
    const normalizedSpin = Object.keys(spinValue).length > 0 ? spinValue : defaultSpinConfig();
    const normalizedPenalty = Object.keys(penaltyValue).length > 0 ? penaltyValue : defaultPenaltyConfig();
    spinConfigText = JSON.stringify(normalizedSpin, null, 2);
    penaltyConfigText = JSON.stringify(normalizedPenalty, null, 2);
    syncSpinFormFromText();
    syncPenaltyFormFromText();
  }

  async function loadApiConfig() {
    const apiConfig = await withAccess((token) => getConfig(token, "api"));
    const rootConfig = asRecord(apiConfig.value);
    const activeForm = parseFootballNewsApiForm(rootConfig);
    const parsedProfiles = parseFootballNewsApiProfiles(rootConfig, activeForm);
    footballNewsProfiles = parsedProfiles.profiles;
    footballNewsActiveProfileId = parsedProfiles.activeId;
    setActiveFootballNewsProfile(parsedProfiles.activeId);
  }

  async function installFreeApiPack() {
    loading = true;
    error = "";
    try {
      await withAccess((token) =>
        installFreeNewsApiPack(token, {
          setActive: true,
          activeProvider: "openligadb"
        })
      );
      await loadApiConfig();
      showToast("Free API pack installed");
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  async function loadAnnouncements() {
    announcements = await withAccess((token) => listAnnouncements(token));
  }

  function applyRulesConfig(value: unknown): void {
    const root = asRecord(value);
    rulesEntries = mergeRuleEntries(root);
    rulesDefaultLanguage = normalizeRuleLanguage(asString(root.defaultLanguage, "en"));
    rulesEditorLanguage = normalizeRuleLanguage(rulesEditorLanguage);
  }

  async function loadRulesConfig() {
    const config = await withAccess((token) => getConfig(token, "rules"));
    applyRulesConfig(config.value);
  }

  function updateRulesTitle(value: string): void {
    const current = rulesEntries[rulesEditorLanguage];
    rulesEntries = {
      ...rulesEntries,
      [rulesEditorLanguage]: {
        ...current,
        title: value
      }
    };
  }

  function updateRulesContent(value: string): void {
    const current = rulesEntries[rulesEditorLanguage];
    rulesEntries = {
      ...rulesEntries,
      [rulesEditorLanguage]: {
        ...current,
        content: value
      }
    };
  }

  function handleRulesTitleInput(event: Event): void {
    const target = event.currentTarget;
    if (!(target instanceof HTMLInputElement)) return;
    updateRulesTitle(target.value);
  }

  function handleRulesContentInput(event: Event): void {
    const target = event.currentTarget;
    if (!(target instanceof HTMLTextAreaElement)) return;
    updateRulesContent(target.value);
  }

  async function saveRulesConfig() {
    const payloadEntries: Record<string, RuleContentEntry> = {};
    const now = new Date().toISOString();

    for (const language of RULE_LANGUAGE_OPTIONS) {
      const entry = rulesEntries[language];
      const title = entry.title.trim().slice(0, 200);
      const content = entry.content.trim().slice(0, 20_000);
      if (!title && !content) continue;
      payloadEntries[language] = {
        title,
        content,
        updatedAt: now
      };
    }

    if (Object.keys(payloadEntries).length === 0) {
      error = "Please provide at least one language rule content";
      return;
    }

    const defaultEntry = payloadEntries[rulesDefaultLanguage];
    if (!defaultEntry || defaultEntry.content.trim().length === 0) {
      error = `Default language (${rulesDefaultLanguage.toUpperCase()}) must have content`;
      return;
    }

    loading = true;
    error = "";
    try {
      const updated = await withAccess((token) =>
        updateConfig(token, "rules", {
          defaultLanguage: rulesDefaultLanguage,
          entries: payloadEntries
        })
      );
      applyRulesConfig(updated.value);
      showToast("Rules content saved");
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
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

  async function loadSocialChannels() {
    const res = await withAccess((token) => listSocialChannels(token, { limit: 100 }));
    socialChannels = res.items;
    socialChannelsTotal = res.total;
  }

  async function loadMysteryBox() {
    const [allocationRes, ticketRes] = await Promise.all([
      withAccess((token) => getMysteryBoxAllocations(token)),
      withAccess((token) =>
        listMysteryBoxTicketUsers(token, {
          q: mysteryTicketQ || undefined,
          limit: 100
        })
      )
    ]);
    mysteryConfig = normalizeMysteryBoxConfig(allocationRes.value);
    mysteryTicketUsers = ticketRes.items;
    mysteryTicketsTotal = ticketRes.total;
    mysteryTicketsSum = ticketRes.totalTickets;
  }

  async function saveMysteryBoxConfig() {
    loading = true;
    error = "";
    try {
      const normalized = normalizeMysteryBoxConfig(mysteryConfig);
      mysteryConfig = normalized;
      await withAccess((token) => updateMysteryBoxAllocations(token, normalized));
      showToast("Ranking Tiers allocation saved");
      await loadMysteryBox();
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  async function adjustMysteryTickets() {
    if (!mysterySelectedUserId) {
      error = "Please select a user";
      return;
    }
    if (!Number.isFinite(Number(mysteryTicketDelta)) || Number(mysteryTicketDelta) === 0) {
      error = "Ticket delta must be non-zero";
      return;
    }
    loading = true;
    error = "";
    try {
      await withAccess((token) =>
        adjustMysteryBoxTickets(token, {
          userId: mysterySelectedUserId,
          delta: Math.trunc(Number(mysteryTicketDelta)),
          reason: mysteryTicketReason.trim() || "Manual mystery ticket adjustment"
        })
      );
      showToast("Mystery ticket updated");
      await loadMysteryBox();
      await loadUsersAndLedger();
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  async function submitSocialChannel() {
    const selectedMission = findMissionById(socialChannelForm.missionId);
    const channelUrl = asText(socialChannelForm.url).trim();
    if (!selectedMission) {
      error = "Please select a mission";
      return;
    }
    if (!channelUrl) {
      error = "Please input channel URL";
      return;
    }

    const platform = inferPlatformFromMission(selectedMission);
    const channelName = selectedMission.name;
    const icon = asText(socialChannelForm.icon).trim() || inferIconFromPlatform(platform);
    const sortOrder = toSafeInt(socialChannelForm.sortOrder, 0);

    loading = true;
    error = "";
    try {
      const savedChannel = await withAccess((token) =>
        upsertSocialChannel(token, {
          id: socialChannelForm.id || undefined,
          platform,
          name: channelName,
          url: channelUrl,
          icon,
          tasks: 1,
          kick: selectedMission.rewardKick,
          sortOrder,
          isActive: socialChannelForm.isActive
        })
      );

      await withAccess((token) =>
        upsertMission(token, {
          id: selectedMission.id,
          code: selectedMission.code,
          name: selectedMission.name,
          phase: selectedMission.phase,
          category: selectedMission.category,
          channelId: savedChannel.id,
          rewardKick: selectedMission.rewardKick,
          capPerDay: selectedMission.capPerDay ?? undefined,
          isActive: selectedMission.isActive
        })
      );

      showToast(socialChannelForm.id ? "Social channel updated" : "Social channel created");
      resetSocialChannelForm();
      await Promise.all([loadSocialChannels(), loadMissions()]);
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  async function setSocialChannelActive(channel: SocialChannelItem, nextActive: boolean) {
    loading = true;
    error = "";
    try {
      await withAccess((token) =>
        toggleSocialChannel(token, {
          id: channel.id,
          isActive: nextActive
        })
      );
      await loadSocialChannels();
      showToast(`Social channel ${nextActive ? "activated" : "disabled"}`);
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  async function removeSocialChannel(channel: SocialChannelItem) {
    const ok = window.confirm(`Delete social channel "${channel.platform} · ${channel.name}"?`);
    if (!ok) return;
    loading = true;
    error = "";
    try {
      await withAccess((token) => deleteSocialChannel(token, channel.id));
      await loadSocialChannels();
      if (socialChannelForm.id === channel.id) {
        resetSocialChannelForm();
      }
      showToast("Social channel deleted");
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  async function submitMatch() {
    if (
      !matchForm.groupCode.trim() ||
      !matchForm.homeNation.trim() ||
      !matchForm.awayNation.trim() ||
      !matchForm.stadium.trim() ||
      !matchForm.kickoffAt.trim()
    ) {
      error = "Please fill required match fields";
      return;
    }

    const kickoffDate = new Date(matchForm.kickoffAt);
    if (Number.isNaN(kickoffDate.getTime())) {
      error = "Invalid kickoff time";
      return;
    }

    loading = true;
    error = "";
    try {
      await withAccess((token) =>
        upsertMatch(token, {
          id: matchForm.id || undefined,
          groupCode: matchForm.groupCode.trim(),
          homeNation: matchForm.homeNation.trim(),
          awayNation: matchForm.awayNation.trim(),
          stadium: matchForm.stadium.trim(),
          city: matchForm.city.trim() || undefined,
          kickoffAt: kickoffDate.toISOString(),
          status: matchForm.status.trim() || "scheduled",
          homeScore: parseOptionalInt(matchForm.homeScore, "home score"),
          awayScore: parseOptionalInt(matchForm.awayScore, "away score"),
          highlight: matchForm.highlight.trim() || undefined
        })
      );
      showToast(matchForm.id ? "Match updated" : "Match created");
      resetMatchForm();
      await loadMatches();
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  async function setMatchStatus(match: MatchFixture, status: string) {
    loading = true;
    error = "";
    try {
      await withAccess((token) =>
        updateMatchStatus(token, {
          id: match.id,
          status,
          homeScore: match.homeScore ?? undefined,
          awayScore: match.awayScore ?? undefined,
          highlight: match.highlight ?? undefined
        })
      );
      await loadMatches();
      showToast(`Match status set to ${status.toUpperCase()}`);
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  async function submitMission() {
    const code = asText(missionForm.code).trim();
    const name = asText(missionForm.name).trim();
    const phase = asText(missionForm.phase).trim() || "Viral Activation";
    const category = asText(missionForm.category).trim() || "daily";
    const rewardKickRaw = asText(missionForm.rewardKick).trim();

    if (!code || !name || !rewardKickRaw) {
      error = "Please fill required mission fields";
      return;
    }
    const rewardKick = Number(rewardKickRaw);
    if (!Number.isFinite(rewardKick) || rewardKick < 0) {
      error = "Invalid reward KICK";
      return;
    }

    loading = true;
    error = "";
    try {
      await withAccess((token) =>
        upsertMission(token, {
          id: missionForm.id || undefined,
          code,
          name,
          phase,
          category,
          channelId: asText(missionForm.channelId).trim() || null,
          rewardKick: Math.trunc(rewardKick),
          capPerDay: parseOptionalInt(missionForm.capPerDay, "cap per day"),
          isActive: missionForm.isActive
        })
      );
      showToast(missionForm.id ? "Mission updated" : "Mission created");
      resetMissionForm();
      await loadMissions();
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  async function setMissionActive(mission: MissionItem, nextActive: boolean) {
    loading = true;
    error = "";
    try {
      await withAccess((token) =>
        toggleMission(token, {
          id: mission.id,
          isActive: nextActive
        })
      );
      await loadMissions();
      showToast(`Mission ${nextActive ? "activated" : "disabled"}`);
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
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

  async function saveFootballNewsApiConfig() {
    loading = true;
    error = "";
    try {
      const normalizedForm = normalizeFootballNewsApiForm(footballNewsApiForm);
      const activeProfileId = footballNewsActiveProfileId || createFootballProfileId();
      const activeProfileName = footballNewsProfileName.trim() || defaultFootballProfileName(normalizedForm.provider);
      const nextProfiles =
        footballNewsProfiles.length > 0
          ? footballNewsProfiles.map((profile) =>
              profile.id === activeProfileId
                ? {
                    ...profile,
                    name: activeProfileName,
                    value: cloneFootballNewsApiForm(normalizedForm)
                  }
                : profile
            )
          : [
              {
                id: activeProfileId,
                name: activeProfileName,
                value: cloneFootballNewsApiForm(normalizedForm)
              }
            ];
      const hasActiveProfile = nextProfiles.some((profile) => profile.id === activeProfileId);
      const normalizedProfiles = hasActiveProfile
        ? nextProfiles
        : [
            ...nextProfiles,
            {
              id: activeProfileId,
              name: activeProfileName,
              value: cloneFootballNewsApiForm(normalizedForm)
            }
          ];

      const currentApiConfig = await withAccess((token) => getConfig(token, "api"));
      const currentValue = asRecord(currentApiConfig.value);
      const nextValue: Record<string, unknown> = {
        ...currentValue,
        footballNews: footballFormToConfigNode(normalizedForm),
        footballNewsActiveProfileId: activeProfileId,
        footballNewsProfiles: normalizedProfiles.map((profile) => ({
          id: profile.id,
          name: profile.name,
          ...footballFormToConfigNode(profile.value)
        }))
      };
      await withAccess((token) => updateConfig(token, "api", nextValue));
      footballNewsProfiles = normalizedProfiles;
      footballNewsActiveProfileId = activeProfileId;
      footballNewsProfileName = activeProfileName;
      footballNewsApiForm = cloneFootballNewsApiForm(normalizedForm);
      showToast("Football API config saved");
      await loadApiConfig();
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
    userTierStats = [];
    ledger = [];
    userTierFilter = "all";
    leaderboardKick = [];
    leaderboardReferrers = [];
    leaderboardNations = [];
    auditLogs = [];
    announcements = [];
    rulesDefaultLanguage = "en";
    rulesEditorLanguage = "en";
    rulesEntries = defaultRuleEntries();
    piqueLogs = [];
    boardMembers = [];
    referralChains = [];
    referralFlagged = [];
    matchesData = [];
    missionsData = [];
    mysteryConfig = defaultMysteryBoxAllocationConfig();
    mysteryTicketUsers = [];
    mysteryTicketsTotal = 0;
    mysteryTicketsSum = 0;
    mysteryTicketQ = "";
    mysterySelectedUserId = "";
    mysteryTicketDelta = 1;
    mysteryTicketReason = "Manual mystery ticket adjustment";
    socialChannels = [];
    socialChannelsTotal = 0;
    resetSocialChannelForm();
    resetFootballNewsApiForm();
    footballNewsProfiles = [];
    footballNewsActiveProfileId = "";
    footballNewsProfileName = "";
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
      <div class="sb-logo-icon">
        {#if sidebarLogoBroken}
          <span class="sb-logo-fallback">W</span>
        {:else}
          <img
            src="/assets/wc26-logo.png"
            alt="WC26 logo"
            class="sb-logo-img"
            on:error={() => (sidebarLogoBroken = true)}
          />
        {/if}
      </div>
      <div class="sb-logo-text">
        <span class="sb-logo-line-main">WC26 JOURNEY AIRDROP</span>
        <span class="sb-logo-line-sub">MANAGEMENT PANEL</span>
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
      <button type="button" class="sb-logout" on:click={doLogout}>LOGOUT</button>
    </div>
  </nav>

  <div id="wc26-main">
    <div id="wc26-topbar">
      <button id="wc26-menu-toggle" on:click={toggleSidebar}>
        <span></span><span></span><span></span>
      </button>
      <div class="pg-title-wrap">
        <div id="wc26-pg-title">{currentTitle}</div>
        <div id="wc26-pg-sub">{currentSub}</div>
      </div>
      <div class="topbar-actions">
        <div class="tb-chip live"><span class="tb-dot"></span>{dashboard?.onlineUsers ?? 0} ONLINE</div>
        <button type="button" class="tb-chip" on:click={() => navigate("announce")}>📣 QUICK ANN</button>
        <button type="button" class="tb-chip" on:click={() => navigate("users")}>⚡ KICK GRANT</button>
        <button type="button" class="tb-chip" on:click={doLogout}>🔐 LOGOUT</button>
      </div>
    </div>

    <div id="wc26-content">
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
              <div class="sec-title"><div class="sec-dot"></div>Users Management</div>
              <div style="display:flex;gap:8px">
                <input class="inp" style="width:200px" placeholder="Search user / TG ID..." bind:value={userQ} />
                <button class="btn btn-g btn-sm" on:click={loadUsersAndLedger}>FILTER</button>
              </div>
            </div>
            <div class="sec-body" style="padding:8px 16px">
              <div class="filter-row">
                <button class="filter-btn" class:active={userStatus === "all" && userTierFilter === "all"} on:click={() => {
                  userStatus = "all";
                  userTierFilter = "all";
                }}>All</button>
                <button class="filter-btn" class:active={userStatus === "active"} on:click={() => (userStatus = "active")}>Active</button>
                <button class="filter-btn y" class:active={userStatus === "vip"} on:click={() => (userStatus = "vip")}>VIP</button>
                <button class="filter-btn r" class:active={userStatus === "banned"} on:click={() => (userStatus = "banned")}>Banned</button>
                <button class="filter-btn" class:active={userTierFilter === "rookie"} on:click={() => (userTierFilter = "rookie")}>Rookie</button>
                <button class="filter-btn" class:active={userTierFilter === "starter"} on:click={() => (userTierFilter = "starter")}>Starter</button>
                <button class="filter-btn" class:active={userTierFilter === "pro"} on:click={() => (userTierFilter = "pro")}>Pro</button>
                <button class="filter-btn" class:active={userTierFilter === "champion"} on:click={() => (userTierFilter = "champion")}>Champion</button>
                <button class="filter-btn" class:active={userTierFilter === "master"} on:click={() => (userTierFilter = "master")}>Master</button>
                <button class="filter-btn" class:active={userTierFilter === "legend"} on:click={() => (userTierFilter = "legend")}>Legend</button>
                <button class="btn btn-ghost btn-sm" on:click={loadUsersAndLedger}>APPLY</button>
              </div>
              <div class="grid-4" style="margin-top:10px">
                {#each userTierStats as stat}
                  <div class="mb-tier" style="text-align:left;padding:12px">
                    <div class="mb-tier-name" style="font-size:14px;margin:0">{tierLabel(stat.tier)}</div>
                    <div class="mb-tier-policy">Range: {tierKickLabel(stat.tier)}</div>
                    <div class="mb-tier-policy">Users: {stat.totalUsers.toLocaleString()}</div>
                    <div class="mb-tier-policy">
                      Active/VIP/Banned: {stat.activeUsers.toLocaleString()} / {stat.vipUsers.toLocaleString()} / {stat.bannedUsers.toLocaleString()}
                    </div>
                    <div class="mb-tier-policy">Total KICK: {stat.totalKick.toLocaleString()}</div>
                  </div>
                {/each}
              </div>
            </div>
            <div style="padding:0">
              <table class="tbl"><thead><tr>
                <th>#</th><th>User</th><th>TG ID</th><th>Nation</th><th>KICK</th><th>Tier</th><th>Direct Referral (F1)</th><th>Indirect Referral (F2)</th><th>Status</th><th>Actions</th>
              </tr></thead><tbody>
                {#each users as u, i}
                  <tr>
                    <td>{i + 1}</td>
                    <td>@{u.username ?? "unknown"}</td>
                    <td>{u.telegramId ?? "-"}</td>
                    <td>{u.nationCode}</td>
                    <td style="font-family:var(--mono);color:var(--yellow)">{u.kick.toLocaleString()}</td>
                    <td><span class="tag tag-b">{tierLabel(userTier(u))}</span></td>
                    <td>{u.directReferrals.toLocaleString()}</td>
                    <td>{u.indirectReferrals.toLocaleString()}</td>
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
                <table class="tbl"><thead><tr><th>#</th><th>User</th><th>TG ID</th><th>Nation</th><th>KICK</th><th>Status</th></tr></thead><tbody>
                  {#if leaderboardKick.length === 0}
                    <tr><td colspan="6" style="text-align:center;color:var(--text2)">No data yet</td></tr>
                  {:else}
                    {#each leaderboardKick as u}
                      <tr>
                        <td>#{u.rank}</td>
                        <td>@{u.username ?? "unknown"}</td>
                        <td>{u.telegramId ?? "-"}</td>
                        <td>{nationFlag(u.nationCode)} {u.nationCode}</td>
                        <td style="font-family:var(--mono);color:var(--yellow)">{u.kick.toLocaleString()}</td>
                        <td><span class={`tag ${statusTag(u.status)}`}>{u.status.toUpperCase()}</span></td>
                      </tr>
                    {/each}
                  {/if}
                </tbody></table>
              </div>
            </div>
          {/if}

          {#if leaderboardTab === "ref"}
            <div class="section">
              <div class="sec-hdr"><div class="sec-title"><div class="sec-dot b"></div>Top Referrers</div></div>
              <div class="sec-body" style="padding:0">
                <table class="tbl"><thead><tr><th>#</th><th>User</th><th>Nation</th><th>Total</th><th>F1</th><th>Active 7d</th><th>KICK Awarded</th><th>Flagged</th></tr></thead><tbody>
                  {#if leaderboardReferrers.length === 0}
                    <tr><td colspan="8" style="text-align:center;color:var(--text2)">No data yet</td></tr>
                  {:else}
                    {#each leaderboardReferrers as row}
                      <tr>
                        <td>#{row.rank}</td>
                        <td>@{row.username || "unknown"}</td>
                        <td>{nationFlag(row.nationCode)} {row.nationCode}</td>
                        <td>{row.totalReferrals}</td>
                        <td>{row.f1Referrals}</td>
                        <td>{row.active7dCount}</td>
                        <td>{row.totalKickAwarded.toLocaleString()}</td>
                        <td style={`color:${row.flaggedCount > 0 ? "var(--red)" : "var(--text2)"}`}>{row.flaggedCount}</td>
                      </tr>
                    {/each}
                  {/if}
                </tbody></table>
              </div>
            </div>
          {/if}

          {#if leaderboardTab === "nation"}
            <div class="section">
              <div class="sec-hdr"><div class="sec-title"><div class="sec-dot y"></div>Nation War Rankings</div></div>
              <div class="sec-body" style="padding:0">
                <table class="tbl"><thead><tr><th>#</th><th>Nation</th><th>War Points</th><th>Total KICK</th><th>Eligible</th><th>Top Player</th></tr></thead><tbody>
                  {#if leaderboardNations.length === 0}
                    <tr><td colspan="6" style="text-align:center;color:var(--text2)">No data yet</td></tr>
                  {:else}
                    {#each leaderboardNations as row}
                      <tr>
                        <td>#{row.rank}</td>
                        <td>{nationFlag(row.nationCode)} {row.nationCode}</td>
                        <td>{row.warPoints.toLocaleString()}</td>
                        <td>{row.totalKick.toLocaleString()}</td>
                        <td>{row.eligibleUsers.toLocaleString()} / {row.totalUsers.toLocaleString()}</td>
                        <td>@{row.topUsername} ({row.topKick.toLocaleString()})</td>
                      </tr>
                    {/each}
                  {/if}
                </tbody></table>
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
            <div class="sec-hdr">
              <div class="sec-title"><div class="sec-dot"></div>World Cup 2026 Schedule</div>
              <button class="btn btn-ghost btn-sm" on:click={loadMatches}>REFRESH</button>
            </div>
            <div class="sec-body" style="padding:0">
              <table class="tbl"><thead><tr><th>Group</th><th>Fixture</th><th>Stadium</th><th>Status</th><th>Date</th><th>Score</th><th>Actions</th></tr></thead><tbody>
                {#each matchesData as m}
                  <tr>
                    <td>{m.groupCode}</td>
                    <td>{m.homeNation} vs {m.awayNation}</td>
                    <td>{m.stadium}</td>
                    <td>{m.status}</td>
                    <td>{new Date(m.kickoffAt).toLocaleString()}</td>
                    <td>{m.homeScore === null || m.awayScore === null ? "-" : `${m.homeScore} - ${m.awayScore}`}</td>
                    <td style="display:flex;gap:6px;flex-wrap:wrap">
                      {#if can("settings.manage")}
                        <button class="btn btn-ghost btn-sm" on:click={() => setMatchFormFromItem(m)}>EDIT</button>
                        <button class="btn btn-ghost btn-sm" disabled={m.status === "scheduled"} on:click={() => setMatchStatus(m, "scheduled")}>SCHEDULED</button>
                        <button class="btn btn-ghost btn-sm" disabled={m.status === "live"} on:click={() => setMatchStatus(m, "live")}>LIVE</button>
                        <button class="btn btn-ghost btn-sm" disabled={m.status === "finished"} on:click={() => setMatchStatus(m, "finished")}>FINISHED</button>
                      {:else}
                        -
                      {/if}
                    </td>
                  </tr>
                {/each}
              </tbody></table>
            </div>
          </div>

          {#if can("settings.manage")}
            <div class="section">
              <div class="sec-hdr">
                <div class="sec-title"><div class="sec-dot y"></div>{matchForm.id ? "Update Match" : "Create Match"}</div>
              </div>
              <div class="sec-body" style="display:grid;gap:8px">
                <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px">
                  <input class="inp" placeholder="Group (A-H)" bind:value={matchForm.groupCode} />
                  <input class="inp" placeholder="Home nation" bind:value={matchForm.homeNation} />
                  <input class="inp" placeholder="Away nation" bind:value={matchForm.awayNation} />
                  <input class="inp" placeholder="Stadium" bind:value={matchForm.stadium} />
                </div>
                <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px">
                  <input class="inp" placeholder="City (optional)" bind:value={matchForm.city} />
                  <input class="inp" type="datetime-local" bind:value={matchForm.kickoffAt} />
                  <input class="inp" placeholder="Status (scheduled/live/finished)" bind:value={matchForm.status} />
                  <input class="inp" placeholder="Highlight (optional)" bind:value={matchForm.highlight} />
                </div>
                <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;align-items:center">
                  <input class="inp" type="number" placeholder="Home score" bind:value={matchForm.homeScore} />
                  <input class="inp" type="number" placeholder="Away score" bind:value={matchForm.awayScore} />
                  <div style="display:flex;align-items:center;gap:8px">
                    <span style="font-size:11px;color:var(--text3)">Editing ID:</span>
                    <code>{matchForm.id || "new"}</code>
                  </div>
                  <div style="display:flex;justify-content:flex-end;gap:8px">
                    <button class="btn btn-ghost btn-sm" on:click={resetMatchForm}>RESET</button>
                    <button class="btn btn-g btn-sm" on:click={submitMatch}>{matchForm.id ? "UPDATE MATCH" : "CREATE MATCH"}</button>
                  </div>
                </div>
              </div>
            </div>
          {/if}
        </div>
      {/if}

      {#if page === "missions"}
        <div class="pg active" id="pg-missions">
          <div class="section">
            <div class="sec-hdr">
              <div class="sec-title"><div class="sec-dot"></div>Mission Control</div>
              <button class="btn btn-ghost btn-sm" on:click={loadMissions}>REFRESH</button>
            </div>
            <div class="sec-body" style="padding:0">
              <table class="tbl"><thead><tr><th>Code</th><th>Mission</th><th>Phase</th><th>Category</th><th>Channel</th><th>Reward</th><th>Cap/Day</th><th>Completions</th><th>Awarded</th><th>Status</th><th>Actions</th></tr></thead><tbody>
                {#each missionsData as m}
                  <tr>
                    <td>{m.code}</td><td>{m.name}</td><td>{m.phase}</td><td>{m.category}</td>
                    <td>{m.channel ? `${m.channel.platform} · ${m.channel.name}` : "-"}</td>
                    <td>{m.rewardKick} KICK</td><td>{m.capPerDay ?? "-"}</td>
                    <td>{m.stats.completions}</td>
                    <td>{m.stats.awardedKick.toLocaleString()}</td>
                    <td><span class={`tag ${m.isActive ? "tag-g" : "tag-r"}`}>{m.isActive ? "ACTIVE" : "OFF"}</span></td>
                    <td style="display:flex;gap:6px;flex-wrap:wrap">
                      {#if can("missions.manage")}
                        <button class="btn btn-ghost btn-sm" on:click={() => setMissionFormFromItem(m)}>EDIT</button>
                        <button class="btn btn-ghost btn-sm" on:click={() => setMissionActive(m, !m.isActive)}>
                          {m.isActive ? "DISABLE" : "ACTIVATE"}
                        </button>
                      {:else}
                        -
                      {/if}
                    </td>
                  </tr>
                {/each}
              </tbody></table>
            </div>
          </div>

          {#if can("missions.manage")}
            <div class="section">
              <div class="sec-hdr">
                <div class="sec-title"><div class="sec-dot y"></div>{missionForm.id ? "Update Mission" : "Create Mission"}</div>
              </div>
              <div class="sec-body" style="display:grid;gap:8px">
                <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px">
                  <input class="inp" placeholder="Code (e.g. SOCIAL_TW_FOLLOW)" bind:value={missionForm.code} />
                  <input class="inp" placeholder="Name" bind:value={missionForm.name} />
                  <input class="inp" placeholder="Phase" bind:value={missionForm.phase} />
                  <input class="inp" placeholder="Category" bind:value={missionForm.category} />
                </div>
                <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px">
                  <select class="inp" bind:value={missionForm.channelId}>
                    <option value="">No channel mapped</option>
                    {#each socialChannels as channel}
                      <option value={channel.id}>
                        {channel.platform} · {channel.name} {channel.isActive ? "" : "(OFF)"}
                      </option>
                    {/each}
                  </select>
                  <input class="inp" type="number" placeholder="Reward KICK" bind:value={missionForm.rewardKick} />
                  <input class="inp" type="number" placeholder="Cap per day (optional)" bind:value={missionForm.capPerDay} />
                  <label class="toggle">
                    <input type="checkbox" bind:checked={missionForm.isActive} />
                    <span class="toggle-slider"></span>
                  </label>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:8px;align-items:center">
                  <div style="font-size:11px;color:var(--text3)">
                    Linked Channel:
                    <b>{missionForm.channelId ? socialChannels.find((x) => x.id === missionForm.channelId)?.name || "Unknown" : "None"}</b>
                  </div>
                  <div></div>
                  <div style="display:flex;justify-content:flex-end;gap:8px">
                    <button class="btn btn-ghost btn-sm" on:click={resetMissionForm}>RESET</button>
                    <button class="btn btn-g btn-sm" on:click={submitMission}>{missionForm.id ? "UPDATE MISSION" : "CREATE MISSION"}</button>
                  </div>
                </div>
                <div style="font-size:11px;color:var(--text3)">Editing ID: <code>{missionForm.id || "new"}</code></div>
              </div>
            </div>
          {/if}
        </div>
      {/if}

      {#if page === "rules"}
        <div class="pg active" id="pg-rules">
          <div class="section">
            <div class="sec-hdr"><div class="sec-title"><div class="sec-dot y"></div>Game Rules · Multilingual</div></div>
            <div class="sec-body" style="display:grid;gap:10px">
              <div style="display:grid;grid-template-columns:220px 220px auto;gap:8px;align-items:end">
                <div class="form-g" style="margin:0">
                  <label for="rules-default-language">Default Language</label>
                  <select id="rules-default-language" class="inp" bind:value={rulesDefaultLanguage}>
                    {#each RULE_LANGUAGE_OPTIONS as language}
                      <option value={language}>{language.toUpperCase()}</option>
                    {/each}
                  </select>
                </div>
                <div class="form-g" style="margin:0">
                  <label for="rules-editor-language">Editing Language</label>
                  <select id="rules-editor-language" class="inp" bind:value={rulesEditorLanguage}>
                    {#each RULE_LANGUAGE_OPTIONS as language}
                      <option value={language}>{language.toUpperCase()}</option>
                    {/each}
                  </select>
                </div>
                <div style="display:flex;justify-content:flex-end">
                  <button class="btn btn-g" on:click={saveRulesConfig}>SAVE GAME RULES</button>
                </div>
              </div>

              <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                <div style="display:grid;gap:8px">
                  <input
                    class="inp"
                    placeholder="Rules title"
                    value={rulesEditorEntry.title}
                    on:input={handleRulesTitleInput}
                  />
                  <textarea
                    class="inp rules-editor"
                    rows="14"
                    placeholder="Use Markdown format (#, ##, -, **bold**, *italic*, [link](https://...))"
                    value={rulesEditorEntry.content}
                    on:input={handleRulesContentInput}
                  ></textarea>
                  <div style="font-size:11px;color:var(--text3)">
                    Supports markdown format and will render at Users frontend Rules tab by selected language.
                  </div>
                </div>

                <div class="rules-preview-wrap">
                  <div class="rules-preview-head">Preview · {rulesEditorLanguage.toUpperCase()}</div>
                  <div class="rules-preview-body">
                    {#if rulesEditorEntry.title.trim()}
                      <h2>{rulesEditorEntry.title.trim()}</h2>
                    {/if}
                    {@html rulesPreviewHtml}
                  </div>
                  {#if rulesEditorEntry.updatedAt}
                    <div class="rules-preview-updated">
                      Last saved: {new Date(rulesEditorEntry.updatedAt).toLocaleString()}
                    </div>
                  {/if}
                </div>
              </div>

              <div style="display:flex;gap:6px;flex-wrap:wrap">
                {#each RULE_LANGUAGE_OPTIONS as language}
                  <span class={`tag ${rulesEntries[language].content.trim() ? "tag-g" : "tag-y"}`}>
                    {language.toUpperCase()} · {rulesEntries[language].content.trim() ? "READY" : "EMPTY"}
                  </span>
                {/each}
              </div>
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
          <div class="section">
            <div class="sec-hdr">
              <div class="sec-title"><div class="sec-dot y"></div>Ranking Tiers Allocation</div>
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                <span class="tag tag-b">TOTAL TIERS {mysteryConfig.allocations.length}</span>
                <button class="btn btn-ghost btn-sm" on:click={loadMysteryBox}>REFRESH</button>
                <button class="btn btn-g btn-sm" on:click={saveMysteryBoxConfig}>SAVE ALLOCATION</button>
              </div>
            </div>
            <div class="sec-body" style="display:grid;gap:10px">
              <div class="grid-4">
                {#each mysteryConfig.allocations as row, idx}
                  <div class="mb-tier" style="text-align:left">
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
                      <div>
                        <div class="mb-tier-name" style="font-size:16px;margin:0">{tierLabel(row.tier)}</div>
                        <div class="mb-tier-policy">{tierRightsLabel(row.tier)}</div>
                        {#if tierBonusLabel(row.tier).trim()}
                          <div class="mb-tier-policy">Upgrade Bonus: {tierBonusLabel(row.tier)}</div>
                        {/if}
                        <div class="mb-tier-policy">Gameplay: {tierGameplayLabel(row.tier)}</div>
                        <div class="mb-tier-policy">Exclusive: {tierRewardsLabel(row.tier)}</div>
                      </div>
                      <label class="toggle">
                        <input
                          type="checkbox"
                          checked={row.isActive}
                          on:change={(event) => patchMysteryAllocation(idx, { isActive: Boolean(event.currentTarget && event.currentTarget.checked) })}
                        />
                        <span class="toggle-slider"></span>
                      </label>
                    </div>
                    <div style="display:grid;gap:8px">
                      <div class="form-g" style="margin:0">
                        <label for={`mb-total-${row.tier}`}>Total Boxes</label>
                        <input
                          id={`mb-total-${row.tier}`}
                          class="inp"
                          type="number"
                          min="0"
                          value={row.totalBoxes}
                          on:input={(event) => patchMysteryAllocation(idx, { totalBoxes: toSafeInt(event.currentTarget && event.currentTarget.value, 0) })}
                        />
                      </div>
                      <div class="form-g" style="margin:0">
                        <label for={`mb-min-${row.tier}`}>KICK Range (fixed)</label>
                        <input id={`mb-min-${row.tier}`} class="inp" value={tierKickLabel(row.tier)} readonly />
                      </div>
                      <div class="form-g" style="margin:0">
                        <label for={`mb-max-${row.tier}`}>Max Per User (fixed)</label>
                        <input id={`mb-max-${row.tier}`} class="inp" value={String(tierMaxPerUser(row.tier))} readonly />
                      </div>
                      {#if tierBonusLabel(row.tier).trim()}
                        <div class="form-g" style="margin:0">
                          <label for={`mb-bonus-${row.tier}`}>Tier Upgrade Bonus (fixed)</label>
                          <input id={`mb-bonus-${row.tier}`} class="inp" value={tierBonusLabel(row.tier)} readonly />
                        </div>
                      {/if}
                    </div>
                  </div>
                {/each}
              </div>

              <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;align-items:center">
                <div class="form-g" style="margin:0">
                  <label for="mb-required-days">Required Active Days</label>
                  <input
                    id="mb-required-days"
                    class="inp"
                    type="number"
                    min="0"
                    value={mysteryConfig.requireActiveDays}
                    on:input={(event) =>
                      (mysteryConfig = {
                        ...mysteryConfig,
                        requireActiveDays: Math.max(0, toSafeInt(event.currentTarget && event.currentTarget.value, 0))
                      })}
                  />
                </div>
                <div class="form-g" style="margin:0">
                  <label for="mb-snapshot-at">Snapshot Time (optional)</label>
                  <input
                    id="mb-snapshot-at"
                    class="inp"
                    type="datetime-local"
                    value={mysterySnapshotInputValue()}
                    on:input={(event) => setMysterySnapshot((event.currentTarget && event.currentTarget.value) || "")}
                  />
                </div>
                <div style="display:flex;align-items:center;justify-content:flex-start;gap:8px;padding-top:10px">
                  <span style="font-size:11px;color:var(--text2)">Require Sybil Check</span>
                  <label class="toggle">
                    <input
                      type="checkbox"
                      checked={mysteryConfig.requireSybilPass}
                      on:change={(event) =>
                        (mysteryConfig = {
                          ...mysteryConfig,
                          requireSybilPass: Boolean(event.currentTarget && event.currentTarget.checked)
                        })}
                    />
                    <span class="toggle-slider"></span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          <div class="section">
            <div class="sec-hdr">
              <div class="sec-title"><div class="sec-dot b"></div>Users With Mystery Tickets ({mysteryTicketsTotal})</div>
              <div style="display:flex;gap:8px;align-items:center">
                <span class="tag tag-g">TOTAL TICKETS {mysteryTicketsSum}</span>
                <input class="inp" style="width:260px" placeholder="Search user / TG ID..." bind:value={mysteryTicketQ} />
                <button class="btn btn-ghost btn-sm" on:click={loadMysteryBox}>FILTER</button>
              </div>
            </div>
            <div class="sec-body" style="padding:0">
              <table class="tbl">
                <thead>
                  <tr><th>User</th><th>TG ID</th><th>Nation</th><th>KICK</th><th>Tickets</th><th>Eligible Tier</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {#if mysteryTicketUsers.length === 0}
                    <tr><td colspan="7" style="color:var(--text3)">No user has mystery ticket yet.</td></tr>
                  {:else}
                    {#each mysteryTicketUsers as user}
                      <tr>
                        <td>@{user.username ?? "unknown"}</td>
                        <td>{user.telegramId ?? "-"}</td>
                        <td>{user.nationCode}</td>
                        <td>{user.kick.toLocaleString()}</td>
                        <td>{user.mysteryTickets}</td>
                        <td>{user.eligibleTier ? tierLabel(user.eligibleTier) : "-"}</td>
                        <td><span class={`tag ${statusTag(user.status)}`}>{user.status.toUpperCase()}</span></td>
                      </tr>
                    {/each}
                  {/if}
                </tbody>
              </table>
            </div>
          </div>

          <div class="section">
            <div class="sec-hdr"><div class="sec-title"><div class="sec-dot"></div>Adjust User Ticket</div></div>
            <div class="sec-body" style="display:grid;grid-template-columns:2fr 120px 2fr auto;gap:8px;align-items:center">
              <select class="inp" bind:value={mysterySelectedUserId}>
                <option value="">Select user</option>
                {#each users as u}
                  <option value={u.id}>@{u.username ?? "unknown"} · {u.telegramId ?? "no-tg"} · KICK {u.kick.toLocaleString()}</option>
                {/each}
              </select>
              <input class="inp" type="number" bind:value={mysteryTicketDelta} />
              <input class="inp" placeholder="Reason" bind:value={mysteryTicketReason} />
              <button class="btn btn-g btn-sm" on:click={adjustMysteryTickets}>APPLY</button>
            </div>
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
            <div class="section"><div class="sec-hdr">
                <div class="sec-title"><div class="sec-dot"></div>Social Channels ({socialChannelsTotal})</div>
                <div style="display:flex;gap:8px">
                  <button class="btn btn-ghost btn-sm" on:click={loadSocialChannels}>RELOAD</button>
                  {#if can("missions.manage")}
                    <button class="btn btn-ghost btn-sm" on:click={resetSocialChannelForm}>RESET FORM</button>
                  {/if}
                </div>
              </div>
              <div class="sec-body" style="display:grid;gap:10px">
                <div style="padding:0;overflow:auto">
                  <table class="tbl">
                    <thead>
                      <tr>
                        <th>Platform</th>
                        <th>Category</th>
                        <th>Mission</th>
                        <th>Name</th>
                        <th>URL</th>
                        <th>Tasks</th>
                        <th>KICK</th>
                        <th>Sort</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {#if socialChannels.length === 0}
                        <tr>
                          <td colspan="10" style="text-align:center;color:var(--text3)">No social channels found. Create one below.</td>
                        </tr>
                      {:else}
                        {#each socialChannels as ch}
                          <tr>
                            <td>{ch.icon ?? "🔗"} {ch.platform}</td>
                            <td>{findMappedMissionByChannelId(ch.id)?.category ?? "-"}</td>
                            <td>{findMappedMissionByChannelId(ch.id)?.name ?? "-"}</td>
                            <td>{ch.name}</td>
                            <td><span class="sc-url">{ch.url}</span></td>
                            <td>{ch.tasks}</td>
                            <td>{ch.kick}</td>
                            <td>{ch.sortOrder}</td>
                            <td><span class={`tag ${ch.isActive ? "tag-g" : "tag-r"}`}>{ch.isActive ? "ACTIVE" : "OFF"}</span></td>
                            <td style="display:flex;gap:6px;flex-wrap:wrap">
                              {#if can("missions.manage")}
                                <button class="btn btn-ghost btn-sm" on:click={() => setSocialChannelFormFromItem(ch)}>EDIT</button>
                                <button class="btn btn-ghost btn-sm" on:click={() => setSocialChannelActive(ch, !ch.isActive)}>
                                  {ch.isActive ? "DISABLE" : "ACTIVATE"}
                                </button>
                                <button class="btn btn-ghost btn-sm" on:click={() => removeSocialChannel(ch)}>DELETE</button>
                              {:else}
                                -
                              {/if}
                            </td>
                          </tr>
                        {/each}
                      {/if}
                    </tbody>
                  </table>
                </div>

                {#if can("missions.manage")}
                  <div style="display:grid;gap:8px;border-top:1px solid var(--border);padding-top:10px">
                    <div class="sec-title" style="font-size:14px"><div class="sec-dot y"></div>{socialChannelForm.id ? "Update Channel" : "Create Channel"}</div>
                    <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px">
                      <select
                        class="inp"
                        bind:value={socialChannelForm.category}
                        on:change={handleSocialCategoryChange}
                      >
                        {#each missionCategoryOptions() as category}
                          <option value={category}>{category}</option>
                        {/each}
                      </select>
                      <select class="inp" bind:value={socialChannelForm.missionId}>
                        {#each missionsForCategory(socialChannelForm.category) as mission}
                          <option value={mission.id}>{mission.name}</option>
                        {/each}
                      </select>
                      <input class="inp" placeholder="Channel URL (t.me/... or x.com/...)" bind:value={socialChannelForm.url} />
                      <input class="inp" placeholder="Icon (optional emoji)" bind:value={socialChannelForm.icon} />
                    </div>
                    <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;align-items:center">
                      <input class="inp" value={findMissionById(socialChannelForm.missionId)?.category ?? "-"} readonly />
                      <input class="inp" value={String(findMissionById(socialChannelForm.missionId)?.rewardKick ?? 0)} readonly />
                      <input class="inp" type="number" placeholder="Sort order" bind:value={socialChannelForm.sortOrder} />
                      <label class="toggle">
                        <input type="checkbox" bind:checked={socialChannelForm.isActive} />
                        <span class="toggle-slider"></span>
                      </label>
                    </div>
                    {#if missionsForCategory(socialChannelForm.category).length === 0}
                      <div style="font-size:11px;color:var(--text3)">No missions in selected category. Create mission first.</div>
                    {/if}
                    <div style="display:flex;justify-content:flex-end;gap:8px">
                      <button class="btn btn-ghost btn-sm" on:click={resetSocialChannelForm}>RESET</button>
                      <button class="btn btn-g btn-sm" on:click={submitSocialChannel}>
                        {socialChannelForm.id ? "UPDATE CHANNEL" : "CREATE CHANNEL"}
                      </button>
                    </div>
                  </div>
                {/if}
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
            <div class="sec-hdr">
              <div class="sec-title"><div class="sec-dot"></div>Lucky Spin Config (Live)</div>
              <div style="display:flex;gap:8px;flex-wrap:wrap">
                <button class="btn btn-ghost btn-sm" on:click={loadConfigs}>RELOAD</button>
                <button class="btn btn-ghost btn-sm" on:click={loadSpinTemplate}>LOAD TEMPLATE</button>
                <button class="btn btn-ghost btn-sm" on:click={syncSpinFormFromText}>JSON → FORM</button>
                <button class="btn btn-ghost btn-sm" on:click={applySpinFormToText}>FORM → JSON</button>
              </div>
            </div>
            <div class="sec-body" style="display:grid;grid-template-columns:1.3fr .7fr;gap:12px">
              <div style="display:grid;gap:8px">
                <div style="display:grid;grid-template-columns:120px 1fr auto;gap:8px;align-items:center">
                  <label for="spin-daily-cap" style="font-family:var(--mono);font-size:10px;color:var(--text3)">Daily Cap</label>
                  <input id="spin-daily-cap" class="inp" type="number" min="1" bind:value={spinDailyCap} on:input={applySpinFormToText} />
                  <button class="btn btn-ghost btn-sm" on:click={addSpinRewardRow}>+ REWARD</button>
                </div>
                <div style="display:grid;gap:6px;max-height:220px;overflow:auto;padding-right:2px">
                  {#each spinRewardsForm as row, idx}
                    <div style="display:grid;grid-template-columns:1.2fr .6fr .6fr auto;gap:8px;align-items:center">
                      <input class="inp" placeholder="reward id" bind:value={row.id} on:input={applySpinFormToText} />
                      <input class="inp" type="number" placeholder="% chance" bind:value={row.chance} on:input={applySpinFormToText} />
                      <input class="inp" type="number" placeholder="value" bind:value={row.value} on:input={applySpinFormToText} />
                      <button class="btn btn-ghost btn-sm" on:click={() => removeSpinRewardRow(idx)}>X</button>
                    </div>
                  {/each}
                </div>
                <textarea class="inp" rows="10" bind:value={spinConfigText}></textarea>
                <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">
                  <button class="btn btn-ghost btn-sm" on:click={syncSpinFormFromText}>APPLY JSON</button>
                  <button class="btn btn-g" on:click={() => saveConfig("spin")}>SAVE SPIN CONFIG</button>
                </div>
              </div>
              <div>
                <div class="sec-title" style="font-size:14px;margin-bottom:10px"><div class="sec-dot b"></div>Probability Preview</div>
                {#if spinRewards.length === 0}
                  <div class="muted-line">No rewards array in config. Load template or fill rewards list.</div>
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
            <div class="sec-hdr">
              <div class="sec-title"><div class="sec-dot"></div>Penalty Config (Live)</div>
              <div style="display:flex;gap:8px;flex-wrap:wrap">
                <button class="btn btn-ghost btn-sm" on:click={loadConfigs}>RELOAD</button>
                <button class="btn btn-ghost btn-sm" on:click={loadPenaltyTemplate}>LOAD TEMPLATE</button>
                <button class="btn btn-ghost btn-sm" on:click={syncPenaltyFormFromText}>JSON → FORM</button>
                <button class="btn btn-ghost btn-sm" on:click={applyPenaltyFormToText}>FORM → JSON</button>
              </div>
            </div>
            <div class="sec-body">
              <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:10px">
                <input class="inp" type="number" placeholder="soloFreePerDay" bind:value={penaltyForm.soloFreePerDay} on:input={applyPenaltyFormToText} />
                <input class="inp" type="number" placeholder="soloExtraCost" bind:value={penaltyForm.soloExtraCost} on:input={applyPenaltyFormToText} />
                <input class="inp" type="number" placeholder="soloWin" bind:value={penaltyForm.soloWin} on:input={applyPenaltyFormToText} />
                <input class="inp" type="number" placeholder="pvpWin" bind:value={penaltyForm.pvpWin} on:input={applyPenaltyFormToText} />
                <input class="inp" type="number" placeholder="pvpLose" bind:value={penaltyForm.pvpLose} on:input={applyPenaltyFormToText} />
                <input class="inp" type="number" placeholder="pvpBurn" bind:value={penaltyForm.pvpBurn} on:input={applyPenaltyFormToText} />
              </div>
              <textarea class="inp" rows="16" bind:value={penaltyConfigText}></textarea>
              <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">
                <button class="btn btn-ghost btn-sm" on:click={syncPenaltyFormFromText}>APPLY JSON</button>
                <button class="btn btn-g" on:click={() => saveConfig("penalty")}>SAVE PENALTY CONFIG</button>
              </div>
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
          <div class="section">
            <div class="sec-hdr">
              <div class="sec-title"><div class="sec-dot y"></div>Football News API Integration</div>
              <div style="display:flex;gap:8px">
                <button class="btn btn-ghost btn-sm" on:click={installFreeApiPack}>ADD FREE API PACK</button>
                <button class="btn btn-ghost btn-sm" on:click={loadApiConfig}>RELOAD</button>
                <button class="btn btn-ghost btn-sm" on:click={() => applyFootballProviderPreset(footballNewsApiForm.provider)}>LOAD PRESET</button>
                <button class="btn btn-ghost btn-sm" on:click={resetFootballNewsApiForm}>RESET DEFAULT</button>
                <button class="btn btn-g btn-sm" on:click={saveFootballNewsApiConfig}>SAVE CONFIG</button>
              </div>
            </div>
            <div class="sec-body" style="display:grid;gap:8px">
              <div style="display:grid;grid-template-columns:2fr 2fr auto;gap:8px;align-items:end">
                <div class="form-g" style="margin:0">
                  <label for="football-profile-select">API Profile</label>
                  <select
                    id="football-profile-select"
                    class="inp"
                    bind:value={footballNewsActiveProfileId}
                    on:change={() => setActiveFootballNewsProfile(footballNewsActiveProfileId)}
                  >
                    {#each footballNewsProfiles as profile}
                      <option value={profile.id}>{profile.name}</option>
                    {/each}
                  </select>
                </div>
                <div class="form-g" style="margin:0">
                  <label for="football-profile-name">Profile Name</label>
                  <input id="football-profile-name" class="inp" bind:value={footballNewsProfileName} placeholder="API profile name" />
                </div>
                <div style="display:flex;gap:8px;align-items:center">
                  <button class="btn btn-ghost btn-sm" on:click={addFootballNewsProfile}>ADD NEW API</button>
                  <button class="btn btn-ghost btn-sm" style="border-color:var(--red);color:var(--red)" on:click={deleteFootballNewsProfile}>
                    DELETE API
                  </button>
                </div>
              </div>

              <div style="border:1px solid var(--border);border-radius:10px;overflow:auto">
                <table class="tbl">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Name</th>
                      <th>Provider</th>
                      <th>Base URL</th>
                      <th>Enabled</th>
                      <th>State</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#if footballNewsProfiles.length === 0}
                      <tr><td colspan="7" style="color:var(--text3)">No API profile yet.</td></tr>
                    {:else}
                      {#each footballNewsProfiles as profile, idx}
                        <tr>
                          <td>{idx + 1}</td>
                          <td>{profile.name}</td>
                          <td>{profile.value.provider}</td>
                          <td>{profile.value.baseUrl}</td>
                          <td>{profile.value.enabled ? "ON" : "OFF"}</td>
                          <td>{profile.id === footballNewsActiveProfileId ? "ACTIVE" : "-"}</td>
                          <td>
                            <button class="btn btn-ghost btn-sm" on:click={() => setActiveFootballNewsProfile(profile.id)}>
                              EDIT
                            </button>
                          </td>
                        </tr>
                      {/each}
                    {/if}
                  </tbody>
                </table>
              </div>

              <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;align-items:center">
                <div class="form-g" style="margin:0">
                  <label for="football-provider">Provider</label>
                  <select id="football-provider" class="inp" bind:value={footballNewsApiForm.provider} on:change={() => applyFootballProviderPreset(footballNewsApiForm.provider)}>
                    <option value="api-football">API-Football</option>
                    <option value="football-data">Football-Data</option>
                    <option value="thesportsdb">TheSportsDB (free)</option>
                    <option value="openligadb">OpenLigaDB (free)</option>
                    <option value="sportmonks">SportMonks</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
                <div class="form-g" style="margin:0">
                  <label for="football-key-header">API Key Header</label>
                  <input id="football-key-header" class="inp" bind:value={footballNewsApiForm.keyHeader} />
                </div>
                <div class="form-g" style="margin:0">
                  <label for="football-poll">Poll Interval (minutes)</label>
                  <input id="football-poll" class="inp" type="number" min="1" bind:value={footballNewsApiForm.pollMinutes} />
                </div>
                <div class="form-g" style="margin:0">
                  <label for="football-timeout">Timeout (ms)</label>
                  <input id="football-timeout" class="inp" type="number" min="1000" bind:value={footballNewsApiForm.timeoutMs} />
                </div>
              </div>

              <div style="display:grid;grid-template-columns:2fr 1fr;gap:8px;align-items:end">
                <div class="form-g" style="margin:0">
                  <label for="football-base-url">Base URL</label>
                  <input id="football-base-url" class="inp" bind:value={footballNewsApiForm.baseUrl} placeholder="https://v3.football.api-sports.io" />
                </div>
                <div class="form-g" style="margin:0">
                  <label for="football-api-key">API Key</label>
                  <input id="football-api-key" class="inp" type="password" bind:value={footballNewsApiForm.apiKey} placeholder="paste your provider key" />
                </div>
              </div>

              <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px">
                <div class="form-g" style="margin:0">
                  <label for="football-news-path">News Path</label>
                  <input id="football-news-path" class="inp" bind:value={footballNewsApiForm.newsPath} placeholder="/news" />
                </div>
                <div class="form-g" style="margin:0">
                  <label for="football-fixtures-path">Fixtures Path</label>
                  <input id="football-fixtures-path" class="inp" bind:value={footballNewsApiForm.fixturesPath} placeholder="/fixtures" />
                </div>
                <div class="form-g" style="margin:0">
                  <label for="football-language">Language</label>
                  <input id="football-language" class="inp" bind:value={footballNewsApiForm.language} placeholder="en" />
                </div>
                <div class="form-g" style="margin:0">
                  <label for="football-timezone">Timezone</label>
                  <input id="football-timezone" class="inp" bind:value={footballNewsApiForm.timezone} placeholder="UTC" />
                </div>
              </div>

              <div style="display:grid;grid-template-columns:3fr 1fr;gap:8px;align-items:center">
                <div class="form-g" style="margin:0">
                  <label for="football-competitions">Competitions (comma separated)</label>
                  <input id="football-competitions" class="inp" bind:value={footballNewsApiForm.competitions} placeholder="FIFA-WC,UEFA-CL" />
                </div>
                <label class="toggle" style="justify-self:start;margin-top:22px">
                  <input type="checkbox" bind:checked={footballNewsApiForm.enabled} />
                  <span class="toggle-slider"></span>
                </label>
              </div>
              <div style="font-size:11px;color:var(--text3)">Toggle ON to allow scheduled sync using this provider config.</div>
            </div>
          </div>
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
