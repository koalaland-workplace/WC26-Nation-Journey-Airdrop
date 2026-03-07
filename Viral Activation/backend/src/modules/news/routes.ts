import { createHash } from "node:crypto";
import type { AdminRole } from "@prisma/client";
import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { writeAudit } from "../common/audit.js";

const APP_HOT_SIGNAL_LANGUAGES = ["en", "es", "pt", "kr", "jp"] as const;
type AppHotSignalLanguage = (typeof APP_HOT_SIGNAL_LANGUAGES)[number];
const HOT_SIGNAL_PROVIDER = "hot-signal";
const HOT_SIGNAL_FEED_SIZE = 5;
const HOT_SIGNAL_REFILL_MIN_COUNT = 3;
const HOT_SIGNAL_REFILL_GRACE_MINUTES = 45;

const GNEWS_DEFAULT_SEARCH_QUERY = [
  "\"World Cup 2026\"",
  "\"FIFA World Cup 2026\"",
  "\"national team\" football",
  "\"international football\"",
  "Mbappe",
  "Messi",
  "Bellingham",
  "Vinicius",
  "\"football transfer\"",
  "\"football injury\""
].join(" OR ");

const GNEWS_DEFAULT_NEWS_PATH = `/search?q=${encodeURIComponent(GNEWS_DEFAULT_SEARCH_QUERY)}&max=8&in=title,description`;
const GNEWS_MULTI_BUCKET_QUERIES = [
  {
    id: "world-cup-2026",
    q: ["\"World Cup 2026\"", "\"FIFA World Cup 2026\"", "\"2026 World Cup\" host", "\"2026 World Cup\" schedule"].join(
      " OR "
    )
  },
  {
    id: "national-teams",
    q: ["\"national team\" football", "\"international football\"", "\"World Cup qualifier\"", "coach", "federation"].join(" OR ")
  },
  {
    id: "star-players",
    q: ["Mbappe", "Messi", "Bellingham", "Vinicius", "Haaland", "Yamal", "Ronaldo", "\"national team\" star"].join(" OR ")
  },
  {
    id: "transfers-injuries",
    q: ["\"football transfer\"", "\"football injury\"", "\"transfer window\" football", "\"squad update\" football"].join(" OR ")
  },
  {
    id: "fifa-governance",
    q: ["FIFA sanction", "\"Court of Arbitration for Sport\" football", "\"football federation\"", "\"World Cup\" controversy"].join(
      " OR "
    )
  }
] as const;

const footballNewsSchema = z.object({
  enabled: z.coerce.boolean().default(false),
  provider: z.string().min(1).default("api-football"),
  baseUrl: z.string().url().default("https://v3.football.api-sports.io"),
  apiKey: z.string().default(""),
  keyHeader: z.string().min(1).default("x-apisports-key"),
  endpoints: z
    .object({
      news: z.string().min(1).default("/news"),
      fixtures: z.string().min(1).default("/fixtures")
    })
    .default({ news: "/news", fixtures: "/fixtures" }),
  defaults: z
    .object({
      competitions: z.array(z.string().min(1)).default(["FIFA-WC"]),
      language: z.string().min(1).default("en"),
      timezone: z.string().min(1).default("UTC")
    })
    .default({ competitions: ["FIFA-WC"], language: "en", timezone: "UTC" }),
  polling: z
    .object({
      intervalMinutes: z.coerce.number().int().min(1).max(1440).default(10),
      timeoutMs: z.coerce.number().int().min(1000).max(60000).default(12000)
    })
    .default({ intervalMinutes: 10, timeoutMs: 12000 })
});

const appNewsQuerySchema = z.object({
  q: z.string().optional(),
  language: z.string().optional(),
  competition: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0)
});

const manualSyncSchema = z.object({
  force: z.boolean().optional()
});

type FootballNewsConfig = z.infer<typeof footballNewsSchema>;

type FootballNewsProfileNode = FootballNewsConfig & {
  id: string;
  name: string;
};

type SyncState = {
  running: boolean;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  nextRunAt: string | null;
  lastResult: {
    provider: string;
    newsRequestUrl: string;
    fixturesRequestUrl: string;
    newsFetched: number;
    newsStored: number;
    curatedStored: number;
    fixturesFetched: number;
    fixturesStored: number;
    fixturesCreated: number;
    fixturesUpdated: number;
    warnings: string[];
    completedAt: string;
    reason: "startup" | "schedule" | "manual";
  } | null;
};

type NormalizedNewsItem = {
  providerItemId: string;
  title: string;
  summary: string | null;
  content: string | null;
  url: string | null;
  imageUrl: string | null;
  sourceName: string | null;
  language: string | null;
  competition: string | null;
  publishedAt: Date;
  rawPayload: Record<string, unknown>;
};

type NormalizedFixtureItem = {
  providerFixtureId: string;
  groupCode: string;
  homeNation: string;
  awayNation: string;
  stadium: string;
  city: string | null;
  kickoffAt: Date;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  highlight: string | null;
  rawPayload: Record<string, unknown>;
};

type CuratedNewsSourceItem = {
  id: string;
  title: string;
  summary: string | null;
  content: string | null;
  url: string | null;
  imageUrl: string | null;
  sourceName: string | null;
  language: string | null;
  competition: string | null;
  publishedAt: Date;
  createdAt: Date;
  provider: string;
};

type CuratedHotSignalItem = NormalizedNewsItem & {
  topicKey: string;
  sourceNewsId: string;
  sourceProvider: string;
};

const FREE_FOOTBALL_NEWS_PROFILES: FootballNewsProfileNode[] = [
  {
    id: "openligadb-free",
    name: "OpenLigaDB Free",
    ...footballNewsSchema.parse({
      enabled: true,
      provider: "openligadb",
      baseUrl: "https://api.openligadb.de",
      apiKey: "",
      keyHeader: "x-api-key",
      endpoints: {
        news: "/getmatchdata/wm2022",
        fixtures: "/getmatchdata/wm2022"
      },
      defaults: {
        competitions: ["WM2022"],
        language: "de",
        timezone: "UTC"
      },
      polling: {
        intervalMinutes: 20,
        timeoutMs: 12000
      }
    })
  },
  {
    id: "thesportsdb-free",
    name: "TheSportsDB Free",
    ...footballNewsSchema.parse({
      enabled: true,
      provider: "thesportsdb",
      baseUrl: "https://www.thesportsdb.com/api/v1/json/3",
      apiKey: "",
      keyHeader: "x-api-key",
      endpoints: {
        news: "/eventsseason.php?id=4429&s=2022",
        fixtures: "/eventsseason.php?id=4429&s=2022"
      },
      defaults: {
        competitions: ["FIFA-WC"],
        language: "en",
        timezone: "UTC"
      },
      polling: {
        intervalMinutes: 20,
        timeoutMs: 12000
      }
    })
  },
  {
    id: "football-data-free",
    name: "Football-Data Free (token required)",
    ...footballNewsSchema.parse({
      enabled: false,
      provider: "football-data",
      baseUrl: "https://api.football-data.org/v4",
      apiKey: "",
      keyHeader: "X-Auth-Token",
      endpoints: {
        news: "/competitions/WC/matches?season=2022",
        fixtures: "/competitions/WC/matches?season=2022"
      },
      defaults: {
        competitions: ["WC"],
        language: "en",
        timezone: "UTC"
      },
      polling: {
        intervalMinutes: 15,
        timeoutMs: 12000
      }
    })
  },
  {
    id: "gnews-world-cup",
    name: "GNews World Cup 2026",
    ...footballNewsSchema.parse({
      enabled: false,
      provider: "gnews",
      baseUrl: "https://gnews.io/api/v4",
      apiKey: "",
      keyHeader: "x-api-key",
      endpoints: {
        news: GNEWS_DEFAULT_NEWS_PATH,
        fixtures: "/top-headlines?topic=sports&lang=en&max=5"
      },
      defaults: {
        competitions: ["FIFA-WC", "WORLD-CUP-2026"],
        language: "en",
        timezone: "UTC"
      },
      polling: {
        intervalMinutes: 360,
        timeoutMs: 12000
      }
    })
  }
];

const installFreePackSchema = z.object({
  setActive: z.boolean().default(true),
  activeProvider: z.string().min(1).optional()
});

const hotSignalsQuerySchema = z.object({
  language: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20)
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toDateOrUndefined(value?: string): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date;
}

function normalizePath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

function firstString(record: Record<string, unknown>, paths: string[]): string | null {
  for (const path of paths) {
    const segments = path.split(".");
    let cursor: unknown = record;
    let missing = false;
    for (const segment of segments) {
      if (!isRecord(cursor) || !(segment in cursor)) {
        missing = true;
        break;
      }
      cursor = cursor[segment];
    }
    if (missing || cursor === undefined || cursor === null) continue;
    if (typeof cursor === "string" && cursor.trim().length > 0) return cursor.trim();
    if (typeof cursor === "number" && Number.isFinite(cursor)) return String(cursor);
  }
  return null;
}

function firstDate(record: Record<string, unknown>, paths: string[]): Date | null {
  for (const path of paths) {
    const value = firstString(record, [path]);
    if (!value) continue;
    if (/^\d+$/.test(value)) {
      const epoch = Number(value);
      if (Number.isFinite(epoch)) {
        const epochMs = epoch > 1e12 ? epoch : epoch * 1000;
        const fromEpoch = new Date(epochMs);
        if (!Number.isNaN(fromEpoch.getTime())) return fromEpoch;
      }
    }
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

function firstNumber(record: Record<string, unknown>, paths: string[]): number | null {
  for (const path of paths) {
    const value = firstString(record, [path]);
    if (!value) continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function firstBoolean(record: Record<string, unknown>, paths: string[]): boolean | null {
  for (const path of paths) {
    const segments = path.split(".");
    let cursor: unknown = record;
    let missing = false;
    for (const segment of segments) {
      if (!isRecord(cursor) || !(segment in cursor)) {
        missing = true;
        break;
      }
      cursor = cursor[segment];
    }
    if (missing || cursor === undefined || cursor === null) continue;
    if (typeof cursor === "boolean") return cursor;
    if (typeof cursor === "string") {
      const text = cursor.trim().toLowerCase();
      if (text === "true") return true;
      if (text === "false") return false;
    }
  }
  return null;
}

function clampText(value: string | null | undefined, maxLen: number, fallback = ""): string {
  const text = (value ?? "").trim();
  if (!text) return fallback;
  return text.length > maxLen ? text.slice(0, maxLen) : text;
}

function parseGroupCode(rawValue: string | null): string {
  const text = (rawValue ?? "").trim();
  if (!text) return "A";
  const groupMatch = text.match(/group[\s-]*([a-z0-9]+)/i);
  if (groupMatch?.[1]) return clampText(groupMatch[1].toUpperCase(), 10, "A");
  return clampText(text.toUpperCase(), 10, "A");
}

function normalizeFixtureStatus(raw: Record<string, unknown>): string {
  const explicitFinished = firstBoolean(raw, ["matchIsFinished", "fixture.status.finished"]);
  if (explicitFinished === true) return "finished";

  const short = (firstString(raw, ["status.short", "fixture.status.short"]) ?? "").toUpperCase();
  const long = (firstString(raw, ["status.long", "fixture.status.long", "status"]) ?? "").toLowerCase();
  const finishedShort = new Set(["FT", "AET", "PEN"]);
  const liveShort = new Set(["1H", "2H", "HT", "ET", "BT", "P", "LIVE", "INT"]);

  if (finishedShort.has(short) || long.includes("finished") || long.includes("full time")) {
    return "finished";
  }
  if (liveShort.has(short) || long.includes("live") || long.includes("half")) {
    return "live";
  }
  return "scheduled";
}

function extractArray(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter(isRecord);
  }
  if (!isRecord(payload)) return [];

  const candidates: unknown[] = [
    payload.response,
    payload.matches,
    payload.events,
    payload.fixtures,
    payload.articles,
    payload.items,
    payload.news,
    payload.data
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter(isRecord);
    }
    if (isRecord(candidate) && Array.isArray(candidate.items)) {
      return candidate.items.filter(isRecord);
    }
  }
  return [];
}

function normalizeAppHotSignalLanguage(value: unknown): AppHotSignalLanguage {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (normalized === "es" || normalized === "pt" || normalized === "kr" || normalized === "jp") return normalized;
  return "en";
}

function toGoogleTargetLanguage(language: AppHotSignalLanguage): string {
  if (language === "kr") return "ko";
  if (language === "jp") return "ja";
  return language;
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, " ");
}

function compactSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function clampSummary(value: string, maxLength = 220): string {
  const normalized = compactSpaces(stripHtml(value));
  if (normalized.length <= maxLength) return normalized;
  const shortened = normalized.slice(0, Math.max(0, maxLength - 1));
  const lastBreak = Math.max(shortened.lastIndexOf(" "), shortened.lastIndexOf("."));
  const base = lastBreak >= Math.floor(maxLength * 0.55) ? shortened.slice(0, lastBreak) : shortened;
  return `${base.trim()}…`;
}

function buildHotSignalSummary(title: string, summary?: string | null, content?: string | null): string {
  const cleanTitle = compactSpaces(title);
  const cleanSummary = summary ? compactSpaces(stripHtml(summary)) : "";
  const cleanContent = content ? compactSpaces(stripHtml(content)) : "";

  if (cleanSummary) {
    const withoutDuplicateTitle = cleanSummary
      .replace(new RegExp(`^${cleanTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[:\\-\\s]*`, "i"), "")
      .trim();
    if (withoutDuplicateTitle) return clampSummary(withoutDuplicateTitle, 190);
    return clampSummary(cleanSummary, 190);
  }

  if (cleanContent) return clampSummary(cleanContent, 190);
  return "Latest development from the World Cup 2026 signal desk.";
}

function inferCompetition(
  raw: Record<string, unknown>,
  config: FootballNewsConfig,
  title: string,
  summary: string | null
): string | null {
  const explicit = firstString(raw, ["competition", "competition.name", "league", "league.name"]);
  if (explicit) return explicit;

  const haystack = `${title} ${summary ?? ""}`.toLowerCase();
  if (haystack.includes("world cup")) return "FIFA-WC";
  if (haystack.includes("fifa")) return "FIFA";
  return config.defaults.competitions[0] ?? null;
}

function scoreNewsSource(item: CuratedNewsSourceItem): number {
  const ageHours = Math.max(0, (Date.now() - item.publishedAt.getTime()) / 3_600_000);
  const freshness = Math.max(0, 72 - ageHours);
  const imageBonus = item.imageUrl ? 12 : 0;
  const summaryBonus = item.summary && item.summary.trim().length > 40 ? 8 : 0;
  const sourceBonus = /reuters|associated press|ap\b|bbc|espn|sky|guardian|washington post|times/i.test(item.sourceName ?? "")
    ? 10
    : 0;
  const topicBonus = /world cup|fifa|national team|messi|mbappe|bellingham|vinicius|ronaldo|football/i.test(
    `${item.title} ${item.summary ?? ""}`
  )
    ? 6
    : 0;
  return freshness + imageBonus + summaryBonus + sourceBonus + topicBonus;
}

function normalizeTopicTokens(text: string): string[] {
  return compactSpaces(stripHtml(text))
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(" ")
    .map((part) => part.trim())
    .filter(
      (part) =>
        part.length >= 4 &&
        ![
          "with",
          "from",
          "that",
          "this",
          "have",
          "will",
          "after",
          "before",
          "their",
          "against",
          "about",
          "football",
          "soccer",
          "world",
          "cup",
          "fifa",
          "2026",
          "team",
          "teams",
          "player",
          "players"
        ].includes(part)
    );
}

function titleTopicKey(title: string): string {
  const tokens = normalizeTopicTokens(title);
  return tokens.slice(0, 6).join("|");
}

function titleSimilarity(left: string, right: string): number {
  const a = new Set(normalizeTopicTokens(left));
  const b = new Set(normalizeTopicTokens(right));
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  return intersection / Math.max(a.size, b.size);
}

function buildCuratedHotSignal(source: CuratedNewsSourceItem): CuratedHotSignalItem {
  const topicKey =
    titleTopicKey(source.title) ||
    createHash("sha1")
      .update(compactSpaces(source.title).toLowerCase())
      .digest("hex")
      .slice(0, 12);
  const canonicalId = createHash("sha1")
    .update(
      [
        source.provider,
        source.id,
        compactSpaces(source.title).toLowerCase(),
        compactSpaces(source.sourceName ?? "").toLowerCase()
      ].join("|")
    )
    .digest("hex")
    .slice(0, 24);

  return {
    providerItemId: canonicalId,
    title: clampText(compactSpaces(source.title), 180, "Hot Signal"),
    summary: clampSummary(buildHotSignalSummary(source.title, source.summary, source.content), 190),
    content: source.content ? clampSummary(compactSpaces(stripHtml(source.content)), 280) : null,
    url: source.url,
    imageUrl: source.imageUrl,
    sourceName: source.sourceName,
    language: normalizeAppHotSignalLanguage(source.language),
    competition: source.competition,
    publishedAt: source.publishedAt,
    rawPayload: {
      curated: true,
      topicKey,
      sourceNewsId: source.id,
      sourceProvider: source.provider
    },
    topicKey,
    sourceNewsId: source.id,
    sourceProvider: source.provider
  };
}

function curateDistinctHotSignals(items: CuratedNewsSourceItem[], limit = HOT_SIGNAL_FEED_SIZE): CuratedHotSignalItem[] {
  const sorted = [...items].sort((left, right) => {
    const scoreDiff = scoreNewsSource(right) - scoreNewsSource(left);
    if (scoreDiff !== 0) return scoreDiff;
    return right.publishedAt.getTime() - left.publishedAt.getTime();
  });

  const selected: CuratedHotSignalItem[] = [];
  const usedTopicKeys = new Set<string>();

  for (const item of sorted) {
    const curated = buildCuratedHotSignal(item);
    const duplicate =
      usedTopicKeys.has(curated.topicKey) ||
      selected.some(
        (existing) =>
          (!!curated.url && existing.url === curated.url) ||
          titleSimilarity(existing.title, curated.title) >= 0.5 ||
          ((existing.summary ?? "").length > 0 &&
            (curated.summary ?? "").length > 0 &&
            titleSimilarity(existing.summary ?? "", curated.summary ?? "") >= 0.55)
      );

    if (duplicate) continue;

    usedTopicKeys.add(curated.topicKey);
    selected.push(curated);
    if (selected.length >= limit) break;
  }

  return selected;
}

function normalizeNewsRecord(raw: Record<string, unknown>, config: FootballNewsConfig): NormalizedNewsItem | null {
  const title = firstString(raw, ["title", "headline", "name"]);
  if (!title) return null;

  const publishedAt = firstDate(raw, [
    "publishedAt",
    "published_at",
    "date",
    "datetime",
    "createdAt",
    "created_at",
    "time"
  ]) ?? new Date();

  const url = firstString(raw, ["url", "link", "source_url"]);
  const providerItemId =
    firstString(raw, ["id", "news_id", "uuid", "slug", "article_id"]) ??
    createHash("sha1")
      .update(`${config.provider}:${title}:${url ?? ""}:${publishedAt.toISOString()}`)
      .digest("hex");

  const rawSummary = firstString(raw, ["summary", "description", "snippet", "short_description"]);
  const content = firstString(raw, ["content", "body", "text"]);
  const imageUrl = firstString(raw, ["image", "imageUrl", "urlToImage", "thumbnail"]);
  const sourceName = firstString(raw, ["source.name", "source", "provider", "publisher"]);
  const language = normalizeAppHotSignalLanguage(firstString(raw, ["language", "lang"]) ?? config.defaults.language);
  const summary = buildHotSignalSummary(title, rawSummary, content);
  const competition = inferCompetition(raw, config, title, summary);

  return {
    providerItemId,
    title,
    summary,
    content,
    url,
    imageUrl,
    sourceName,
    language,
    competition,
    publishedAt,
    rawPayload: raw
  };
}

function normalizeFixtureRecord(raw: Record<string, unknown>, config: FootballNewsConfig): NormalizedFixtureItem | null {
  const homeNation = firstString(raw, [
    "teams.home.name",
    "homeTeam.name",
    "home.name",
    "home_team",
    "home",
    "team1.teamName",
    "Team1.TeamName",
    "strHomeTeam"
  ]);
  const awayNation = firstString(raw, [
    "teams.away.name",
    "awayTeam.name",
    "away.name",
    "away_team",
    "away",
    "team2.teamName",
    "Team2.TeamName",
    "strAwayTeam"
  ]);
  const kickoffAt =
    firstDate(raw, [
      "fixture.date",
      "kickoff",
      "kickoffAt",
      "startTime",
      "date",
      "datetime",
      "utcDate",
      "matchDateTimeUTC",
      "matchDateTime",
      "strTimestamp"
    ]) ?? null;

  if (!homeNation || !awayNation || !kickoffAt) return null;

  const rawGroup =
    firstString(raw, [
      "league.round",
      "round",
      "stage",
      "group",
      "groupCode",
      "competition.name",
      "group.groupName",
      "Group.GroupName",
      "leagueShortcut",
      "league.name"
    ]) ??
    config.defaults.competitions[0] ??
    "A";

  const providerFixtureId =
    firstString(raw, ["fixture.id", "id", "fixture_id", "match_id", "event_key", "matchID", "idEvent"]) ??
    createHash("sha1")
      .update(`${config.provider}:${homeNation}:${awayNation}:${kickoffAt.toISOString()}`)
      .digest("hex");

  const stadium =
    firstString(raw, ["fixture.venue.name", "venue.name", "stadium", "ground", "location.locationStadium"]) ?? "TBD";
  const city = firstString(raw, ["fixture.venue.city", "venue.city", "city", "location.locationCity"]);
  const homeScore = firstNumber(raw, [
    "goals.home",
    "score.fulltime.home",
    "score.fullTime.home",
    "score.fullTime.homeTeam",
    "scores.home",
    "homeScore",
    "intHomeScore",
    "team1.teamScore",
    "Team1.Score"
  ]);
  const awayScore = firstNumber(raw, [
    "goals.away",
    "score.fulltime.away",
    "score.fullTime.away",
    "score.fullTime.awayTeam",
    "scores.away",
    "awayScore",
    "intAwayScore",
    "team2.teamScore",
    "Team2.Score"
  ]);
  const highlight = firstString(raw, [
    "fixture.status.long",
    "status.long",
    "league.round",
    "round",
    "group.groupName",
    "Group.GroupName"
  ]);

  return {
    providerFixtureId: clampText(providerFixtureId, 120, providerFixtureId),
    groupCode: parseGroupCode(rawGroup),
    homeNation: clampText(homeNation, 60, "Unknown"),
    awayNation: clampText(awayNation, 60, "Unknown"),
    stadium: clampText(stadium, 120, "TBD"),
    city: city ? clampText(city, 80) : null,
    kickoffAt,
    status: clampText(normalizeFixtureStatus(raw), 30, "scheduled"),
    homeScore: homeScore === null ? null : Math.max(0, Math.trunc(homeScore)),
    awayScore: awayScore === null ? null : Math.max(0, Math.trunc(awayScore)),
    highlight: highlight ? clampText(highlight, 200) : null,
    rawPayload: raw
  };
}

async function loadFootballNewsConfig(app: FastifyInstance): Promise<FootballNewsConfig> {
  const row = await app.prisma.featureConfig.findUnique({ where: { key: "api" } });
  const value = isRecord(row?.value) ? row.value : {};
  const footballNews = isRecord(value.footballNews) ? value.footballNews : {};
  const parsed = footballNewsSchema.safeParse(footballNews);
  if (parsed.success) return parsed.data;
  app.log.warn({ err: parsed.error }, "Invalid footballNews config detected, fallback to defaults");
  return footballNewsSchema.parse({});
}

function buildNewsUrl(config: FootballNewsConfig): URL {
  const rawPath = normalizePath(config.endpoints.news);
  const url = rawPath.startsWith("http://") || rawPath.startsWith("https://")
    ? new URL(rawPath)
    : new URL(rawPath, config.baseUrl);

  if (config.provider === "gnews") {
    if (!url.searchParams.get("lang")) {
      url.searchParams.set("lang", normalizeAppHotSignalLanguage(config.defaults.language));
    }
    if (!url.searchParams.get("max")) {
      url.searchParams.set("max", "5");
    }
    if (config.apiKey.trim() && !url.searchParams.get("apikey")) {
      url.searchParams.set("apikey", config.apiKey.trim());
    }
    return url;
  }

  if (config.defaults.competitions.length > 0) {
    url.searchParams.set("competitions", config.defaults.competitions.join(","));
    if (config.defaults.competitions.length === 1) {
      url.searchParams.set("competition", config.defaults.competitions[0]);
    }
  }
  url.searchParams.set("language", config.defaults.language);
  url.searchParams.set("lang", config.defaults.language);
  url.searchParams.set("timezone", config.defaults.timezone);
  return url;
}

function buildGnewsBucketUrls(config: FootballNewsConfig): URL[] {
  const baseUrl = buildNewsUrl(config);
  const configuredQuery = compactSpaces(baseUrl.searchParams.get("q") ?? "");
  const bucketQueries = [
    ...(configuredQuery ? [{ id: "configured", q: configuredQuery }] : []),
    ...GNEWS_MULTI_BUCKET_QUERIES
  ];

  const seen = new Set<string>();
  const urls: URL[] = [];
  for (const bucket of bucketQueries) {
    const normalizedQ = compactSpaces(bucket.q);
    if (!normalizedQ || seen.has(normalizedQ.toLowerCase())) continue;
    seen.add(normalizedQ.toLowerCase());
    const url = new URL(baseUrl.toString());
    url.searchParams.set("q", normalizedQ);
    if (!url.searchParams.get("max")) {
      url.searchParams.set("max", "6");
    } else {
      url.searchParams.set("max", String(Math.max(4, Number(url.searchParams.get("max")) || 6)));
    }
    url.searchParams.set("in", "title,description");
    urls.push(url);
  }

  return urls.length > 0 ? urls : [baseUrl];
}

function buildProviderHeaders(config: FootballNewsConfig): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json"
  };
  if (config.apiKey.trim() && config.provider !== "gnews") {
    headers[config.keyHeader] = config.apiKey.trim();
  }
  return headers;
}

function buildFixturesUrl(config: FootballNewsConfig): URL {
  // Keep fixtures endpoint untouched so admins can pass provider-specific query params
  // (e.g. /fixtures?league=1&season=2024) without auto-injected incompatible params.
  return new URL(normalizePath(config.endpoints.fixtures), config.baseUrl);
}

async function fetchProviderNews(config: FootballNewsConfig): Promise<{
  requestUrl: string;
  items: NormalizedNewsItem[];
  fetched: number;
}> {
  const headers = buildProviderHeaders(config);
  const urls = config.provider === "gnews" ? buildGnewsBucketUrls(config) : [buildNewsUrl(config)];
  const results = await Promise.allSettled(
    urls.map(async (url) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), config.polling.timeoutMs);
      try {
        const response = await fetch(url, {
          method: "GET",
          headers,
          signal: controller.signal
        });
        if (!response.ok) {
          const text = (await response.text()).slice(0, 400);
          throw new Error(`Football provider request failed (${response.status}): ${text || "no message"}`);
        }
        const payload = (await response.json()) as unknown;
        const records = extractArray(payload);
        const mapped = records
          .map((item) => normalizeNewsRecord(item, config))
          .filter((item): item is NormalizedNewsItem => item !== null)
          .map((item) => ({
            ...item,
            rawPayload: {
              ...item.rawPayload,
              gnewsBucketUrl: url.toString()
            }
          }));
        return {
          requestUrl: url.toString(),
          fetched: records.length,
          items: mapped
        };
      } finally {
        clearTimeout(timer);
      }
    })
  );

  const success: Array<{ requestUrl: string; fetched: number; items: NormalizedNewsItem[] }> = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      success.push({
        requestUrl: result.value.requestUrl,
        fetched: result.value.fetched,
        items: result.value.items as NormalizedNewsItem[]
      });
    }
  }

  if (success.length === 0) {
    const firstFailure = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
    throw firstFailure?.reason instanceof Error ? firstFailure.reason : new Error("Football provider request failed");
  }

  const requestUrls: string[] = [];
  let fetched = 0;
  const deduped = new Map<string, NormalizedNewsItem>();
  for (const result of success) {
    requestUrls.push(result.requestUrl);
    fetched += result.fetched;
    for (const item of result.items) {
      deduped.set(item.providerItemId, item);
    }
  }

  return {
    requestUrl: requestUrls.join(" | "),
    items: [...deduped.values()],
    fetched
  };
}

async function fetchProviderFixtures(config: FootballNewsConfig): Promise<{
  requestUrl: string;
  items: NormalizedFixtureItem[];
  fetched: number;
}> {
  const url = buildFixturesUrl(config);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.polling.timeoutMs);

  const headers = buildProviderHeaders(config);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const text = (await response.text()).slice(0, 400);
    throw new Error(`Fixture provider request failed (${response.status}): ${text || "no message"}`);
  }

  const payload = (await response.json()) as unknown;
  const records = extractArray(payload);
  const mapped = records
    .map((item) => normalizeFixtureRecord(item, config))
    .filter((item): item is NormalizedFixtureItem => item !== null);

  const deduped = new Map<string, NormalizedFixtureItem>();
  for (const item of mapped) {
    deduped.set(item.providerFixtureId, item);
  }

  return {
    requestUrl: url.toString(),
    items: [...deduped.values()],
    fetched: records.length
  };
}

async function translateWithGoogle(
  app: FastifyInstance,
  texts: string[],
  targetLanguage: AppHotSignalLanguage
): Promise<string[] | null> {
  const apiKey = app.appConfig.googleTranslateApiKey.trim();
  if (!apiKey || texts.length === 0) return null;

  const body = new URLSearchParams();
  body.set("source", "en");
  body.set("target", toGoogleTargetLanguage(targetLanguage));
  body.set("format", "text");
  for (const text of texts) {
    body.append("q", text);
  }

  const response = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded;charset=UTF-8"
    },
    body
  });

  if (!response.ok) {
    const text = (await response.text()).slice(0, 400);
    throw new Error(`Google Translate request failed (${response.status}): ${text || "no message"}`);
  }

  const payload = (await response.json()) as {
    data?: { translations?: Array<{ translatedText?: string }> };
  };
  const translations = payload.data?.translations ?? [];
  if (translations.length !== texts.length) {
    throw new Error("Google Translate returned an unexpected translation count");
  }

  return translations.map((item, index) => clampSummary(item.translatedText ?? texts[index], 190));
}

async function buildLocalizedNewsItems(
  app: FastifyInstance,
  items: NormalizedNewsItem[]
): Promise<{ items: NormalizedNewsItem[]; warnings: string[] }> {
  const warnings: string[] = [];
  const baseItems = items.map((item) => ({
    ...item,
    language: normalizeAppHotSignalLanguage(item.language)
  }));
  if (!app.appConfig.googleTranslateApiKey.trim()) {
    return { items: baseItems, warnings };
  }
  const englishItems = baseItems.filter((item) => normalizeAppHotSignalLanguage(item.language) === "en");
  if (englishItems.length === 0) return { items: baseItems, warnings };

  const localizedItems = [...baseItems];
  for (const language of APP_HOT_SIGNAL_LANGUAGES) {
    if (language === "en") continue;
    try {
      const translatedTitles = await translateWithGoogle(
        app,
        englishItems.map((item) => item.title),
        language
      );
      const translatedSummaries = await translateWithGoogle(
        app,
        englishItems.map((item) => item.summary ?? ""),
        language
      );
      if (!translatedTitles || !translatedSummaries) {
        warnings.push(`translation_skipped_${language}`);
        continue;
      }

      englishItems.forEach((item, index) => {
        localizedItems.push({
          ...item,
          providerItemId: `${item.providerItemId}:${language}`,
          title: clampSummary(translatedTitles[index] ?? item.title, 180),
          summary: clampSummary(translatedSummaries[index] ?? item.summary ?? "", 190),
          language,
          rawPayload: {
            ...item.rawPayload,
            translatedFromLanguage: "en",
            translatedTargetLanguage: language,
            canonicalProviderItemId: item.providerItemId
          }
        });
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : `translation_failed_${language}`;
      warnings.push(`${language}:${message}`);
      app.log.warn({ err: error, language }, "Hot signal translation failed");
    }
  }

  return { items: localizedItems, warnings };
}

async function upsertNewsItems(app: FastifyInstance, provider: string, items: NormalizedNewsItem[]) {
  let stored = 0;
  for (const item of items) {
    await app.prisma.newsItem.upsert({
      where: {
        provider_providerItemId: {
          provider,
          providerItemId: item.providerItemId
        }
      },
      update: {
        title: item.title,
        summary: item.summary,
        content: item.content,
        url: item.url,
        imageUrl: item.imageUrl,
        sourceName: item.sourceName,
        language: item.language,
        competition: item.competition,
        publishedAt: item.publishedAt,
        fetchedAt: new Date(),
        rawPayload: item.rawPayload as never
      },
      create: {
        provider,
        providerItemId: item.providerItemId,
        title: item.title,
        summary: item.summary,
        content: item.content,
        url: item.url,
        imageUrl: item.imageUrl,
        sourceName: item.sourceName,
        language: item.language,
        competition: item.competition,
        publishedAt: item.publishedAt,
        rawPayload: item.rawPayload as never
      }
    });
    stored += 1;
  }
  return stored;
}

async function loadCuratedHotSignalSourceItems(
  app: FastifyInstance,
  provider?: string,
  take = 40
): Promise<CuratedNewsSourceItem[]> {
  const preferredProvider = provider?.trim();
  const primaryWhere = {
    provider: preferredProvider
      ? preferredProvider
      : {
          not: HOT_SIGNAL_PROVIDER
        },
    language: "en",
    publishedAt: {
      gte: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)
    }
  } as const;

  const fallbackWhere = {
    provider: {
      not: HOT_SIGNAL_PROVIDER
    },
    language: "en",
    publishedAt: {
      gte: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)
    }
  } as const;

  const items = await app.prisma.newsItem.findMany({
    where: primaryWhere,
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    take
  });
  if (items.length > 0 || !preferredProvider) {
    return items.map((item) => ({
      id: item.id,
      title: item.title,
      summary: item.summary,
      content: item.content,
      url: item.url,
      imageUrl: item.imageUrl,
      sourceName: item.sourceName,
      language: item.language,
      competition: item.competition,
      publishedAt: item.publishedAt,
      createdAt: item.createdAt,
      provider: item.provider
    }));
  }

  const fallbackItems = await app.prisma.newsItem.findMany({
    where: fallbackWhere,
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    take
  });
  return fallbackItems.map((item) => ({
    id: item.id,
    title: item.title,
    summary: item.summary,
    content: item.content,
    url: item.url,
    imageUrl: item.imageUrl,
    sourceName: item.sourceName,
    language: item.language,
    competition: item.competition,
    publishedAt: item.publishedAt,
    createdAt: item.createdAt,
    provider: item.provider
  }));
}

async function refreshCuratedHotSignals(
  app: FastifyInstance,
  provider?: string,
  limit = HOT_SIGNAL_FEED_SIZE
): Promise<{ stored: number; warnings: string[]; items: NormalizedNewsItem[] }> {
  const warnings: string[] = [];
  const sourceItems = await loadCuratedHotSignalSourceItems(app, provider);
  const curated = curateDistinctHotSignals(sourceItems, limit);
  if (curated.length === 0) {
    await app.prisma.newsItem.deleteMany({
      where: { provider: HOT_SIGNAL_PROVIDER }
    });
    return { stored: 0, warnings: ["No source news available for curation"], items: [] };
  }

  const localized = await buildLocalizedNewsItems(
    app,
    curated.map((item) => ({
      providerItemId: item.providerItemId,
      title: item.title,
      summary: item.summary,
      content: item.content,
      url: item.url,
      imageUrl: item.imageUrl,
      sourceName: item.sourceName,
      language: item.language,
      competition: item.competition,
      publishedAt: item.publishedAt,
      rawPayload: {
        ...(isRecord(item.rawPayload) ? item.rawPayload : {}),
        curated: true,
        topicKey: item.topicKey,
        sourceNewsId: item.sourceNewsId,
        sourceProvider: item.sourceProvider
      }
    }))
  );
  warnings.push(...localized.warnings);
  const keepIds = localized.items.map((item) => item.providerItemId);

  await app.prisma.$transaction(async (tx) => {
    await tx.newsItem.deleteMany({
      where: {
        provider: HOT_SIGNAL_PROVIDER,
        ...(keepIds.length > 0 ? { providerItemId: { notIn: keepIds } } : {})
      }
    });

    for (const item of localized.items) {
      await tx.newsItem.upsert({
        where: {
          provider_providerItemId: {
            provider: HOT_SIGNAL_PROVIDER,
            providerItemId: item.providerItemId
          }
        },
        update: {
          title: item.title,
          summary: item.summary,
          content: item.content,
          url: item.url,
          imageUrl: item.imageUrl,
          sourceName: item.sourceName,
          language: item.language,
          competition: item.competition,
          publishedAt: item.publishedAt,
          fetchedAt: new Date(),
          rawPayload: item.rawPayload as never
        },
        create: {
          provider: HOT_SIGNAL_PROVIDER,
          providerItemId: item.providerItemId,
          title: item.title,
          summary: item.summary,
          content: item.content,
          url: item.url,
          imageUrl: item.imageUrl,
          sourceName: item.sourceName,
          language: item.language,
          competition: item.competition,
          publishedAt: item.publishedAt,
          rawPayload: item.rawPayload as never
        }
      });
    }
  });

  return {
    stored: localized.items.length,
    warnings,
    items: localized.items
  };
}

async function upsertMatchFixtures(app: FastifyInstance, items: NormalizedFixtureItem[]) {
  let created = 0;
  let updated = 0;

  for (const item of items) {
    const kickoff = item.kickoffAt;
    const fuzzyStart = new Date(kickoff.getTime() - 36 * 60 * 60 * 1000);
    const fuzzyEnd = new Date(kickoff.getTime() + 36 * 60 * 60 * 1000);

    const existing =
      (await app.prisma.matchFixture.findFirst({
        where: {
          homeNation: item.homeNation,
          awayNation: item.awayNation,
          kickoffAt: kickoff
        }
      })) ??
      (await app.prisma.matchFixture.findFirst({
        where: {
          homeNation: item.homeNation,
          awayNation: item.awayNation,
          kickoffAt: {
            gte: fuzzyStart,
            lte: fuzzyEnd
          }
        },
        orderBy: [{ updatedAt: "desc" }]
      }));

    const data = {
      groupCode: item.groupCode,
      homeNation: item.homeNation,
      awayNation: item.awayNation,
      stadium: item.stadium,
      city: item.city,
      kickoffAt: item.kickoffAt,
      status: item.status,
      homeScore: item.homeScore,
      awayScore: item.awayScore,
      highlight: item.highlight
    };

    if (existing) {
      await app.prisma.matchFixture.update({
        where: { id: existing.id },
        data
      });
      updated += 1;
    } else {
      await app.prisma.matchFixture.create({
        data
      });
      created += 1;
    }
  }

  return {
    stored: created + updated,
    created,
    updated
  };
}

function addMinutesIso(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

function isPastIso(value: string | null): boolean {
  if (!value) return false;
  const ms = new Date(value).getTime();
  return !Number.isNaN(ms) && Date.now() >= ms;
}

async function shouldRefillHotSignals(app: FastifyInstance, state: SyncState): Promise<boolean> {
  const count = await app.prisma.newsItem.count({
    where: {
      provider: HOT_SIGNAL_PROVIDER,
      language: "en"
    }
  });
  if (count >= HOT_SIGNAL_FEED_SIZE) return false;

  const lastAttemptAtMs = state.lastAttemptAt ? new Date(state.lastAttemptAt).getTime() : 0;
  if (!Number.isNaN(lastAttemptAtMs) && Date.now() - lastAttemptAtMs < HOT_SIGNAL_REFILL_GRACE_MINUTES * 60_000) {
    return false;
  }

  return count < HOT_SIGNAL_REFILL_MIN_COUNT || (count < HOT_SIGNAL_FEED_SIZE && isPastIso(state.nextRunAt));
}

function maskApiKey(apiKey: string): string {
  const trimmed = apiKey.trim();
  if (!trimmed) return "";
  if (trimmed.length <= 6) return "***";
  return `${trimmed.slice(0, 3)}***${trimmed.slice(-3)}`;
}

export const newsRoutes: FastifyPluginAsync = async (app) => {
  const state: SyncState = {
    running: false,
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastError: null,
    nextRunAt: null,
    lastResult: null
  };
  let scheduleTimer: ReturnType<typeof setInterval> | null = null;

  const runSync = async (
    reason: "startup" | "schedule" | "manual",
    options?: {
      force?: boolean;
      actorId?: string;
      actorRole?: AdminRole;
      ipAddress?: string;
    }
  ) => {
    if (state.running) {
      if (reason === "manual") {
        throw app.httpErrors.conflict("News sync is already running");
      }
      return {
        ok: false,
        skipped: true,
        reason: "already_running"
      };
    }

    state.running = true;
    state.lastAttemptAt = new Date().toISOString();
    try {
      const config = await loadFootballNewsConfig(app);
      if (!config.enabled && !options?.force) {
        state.lastError = null;
        state.nextRunAt = null;
        return {
          ok: true,
          skipped: true,
          reason: "disabled",
          enabled: false
        };
      }

      const warnings: string[] = [];

      let newsRequestUrl = "";
      let newsFetched = 0;
      let newsStored = 0;
      let curatedStored = 0;
      let fixturesRequestUrl = "";
      let fixturesFetched = 0;
      let fixturesStored = 0;
      let fixturesCreated = 0;
      let fixturesUpdated = 0;

      try {
        const newsFetch = await fetchProviderNews(config);
        newsRequestUrl = newsFetch.requestUrl;
        newsFetched = newsFetch.fetched;
        const localizedNews = await buildLocalizedNewsItems(app, newsFetch.items);
        warnings.push(...localizedNews.warnings);
        newsStored = await upsertNewsItems(app, config.provider, localizedNews.items);
      } catch (newsError) {
        const msg = newsError instanceof Error ? newsError.message : "News sync failed";
        warnings.push(msg);
      }

      try {
        const curated = await refreshCuratedHotSignals(app, config.provider);
        curatedStored = curated.stored;
        warnings.push(...curated.warnings);
      } catch (curatedError) {
        const msg = curatedError instanceof Error ? curatedError.message : "Hot news curation failed";
        warnings.push(msg);
      }

      try {
        const fixtureFetch = await fetchProviderFixtures(config);
        fixturesRequestUrl = fixtureFetch.requestUrl;
        fixturesFetched = fixtureFetch.fetched;
        const fixtureWrite = await upsertMatchFixtures(app, fixtureFetch.items);
        fixturesStored = fixtureWrite.stored;
        fixturesCreated = fixtureWrite.created;
        fixturesUpdated = fixtureWrite.updated;
      } catch (fixtureError) {
        const msg = fixtureError instanceof Error ? fixtureError.message : "Fixture sync failed";
        warnings.push(msg);
      }

      if (!newsRequestUrl && !fixturesRequestUrl) {
        throw new Error(warnings.join(" | ") || "News/fixtures sync failed");
      }

      const completedAt = new Date().toISOString();

      state.lastSuccessAt = completedAt;
      state.lastError = warnings.length > 0 ? warnings.join(" | ") : null;
      state.nextRunAt = addMinutesIso(config.polling.intervalMinutes);
      state.lastResult = {
        provider: config.provider,
        newsRequestUrl,
        fixturesRequestUrl,
        newsFetched,
        newsStored,
        curatedStored,
        fixturesFetched,
        fixturesStored,
        fixturesCreated,
        fixturesUpdated,
        warnings,
        completedAt,
        reason
      };

      if (reason === "manual" && options?.actorId && options.actorRole) {
        await writeAudit(app.prisma, {
          actorId: options.actorId,
          actorRole: options.actorRole,
          action: "news.sync.manual",
          module: "news",
          targetType: "system",
          targetId: "football_news_sync",
          after: {
            provider: config.provider,
            newsRequestUrl,
            fixturesRequestUrl,
            newsFetched,
            newsStored,
            curatedStored,
            fixturesFetched,
            fixturesStored,
            fixturesCreated,
            fixturesUpdated,
            warnings
          },
          ipAddress: options.ipAddress
        });
      }

      return {
        ok: true,
        skipped: false,
        provider: config.provider,
        newsRequestUrl,
        fixturesRequestUrl,
        newsFetched,
        newsStored,
        curatedStored,
        fixturesFetched,
        fixturesStored,
        fixturesCreated,
        fixturesUpdated,
        warnings,
        nextRunAt: state.nextRunAt
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "News sync failed";
      state.lastError = message;
      try {
        const config = await loadFootballNewsConfig(app);
        state.nextRunAt = addMinutesIso(config.polling.intervalMinutes);
      } catch {
        state.nextRunAt = addMinutesIso(10);
      }
      if (reason === "manual") {
        throw app.httpErrors.badRequest(message);
      }
      return {
        ok: false,
        skipped: false,
        error: message,
        nextRunAt: state.nextRunAt
      };
    } finally {
      state.running = false;
    }
  };

  const tickSchedule = async () => {
    if (state.running) return;
    const refillNeeded = await shouldRefillHotSignals(app, state);
    if (!refillNeeded && state.nextRunAt) {
      const nextRunMs = new Date(state.nextRunAt).getTime();
      if (!Number.isNaN(nextRunMs) && Date.now() < nextRunMs) return;
    }
    await runSync("schedule");
  };

  app.addHook("onReady", async () => {
    void runSync("startup");
    scheduleTimer = setInterval(() => {
      void tickSchedule();
    }, 30_000);
  });

  app.addHook("onClose", async () => {
    if (scheduleTimer) {
      clearInterval(scheduleTimer);
      scheduleTimer = null;
    }
  });

  app.get("/api/v1/app/news", async (request) => {
    const q = appNewsQuerySchema.parse(request.query);
    const from = toDateOrUndefined(q.from);
    const to = toDateOrUndefined(q.to);
    const requestedLanguage = q.language ? normalizeAppHotSignalLanguage(q.language) : undefined;
    const effectiveHotSignalLanguage = requestedLanguage ?? "en";
    const buildWhere = (provider?: string, language?: string) => ({
      ...(provider ? { provider } : {}),
      ...(language ? { language } : {}),
      ...(q.competition ? { competition: q.competition } : {}),
      ...(q.q
        ? {
            OR: [
              { title: { contains: q.q, mode: "insensitive" as const } },
              { summary: { contains: q.q, mode: "insensitive" as const } }
            ]
          }
        : {}),
      ...(from || to
        ? {
            publishedAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {})
            }
          }
        : {})
    });
    const fallbackWhere = buildWhere(HOT_SIGNAL_PROVIDER, effectiveHotSignalLanguage !== "en" ? "en" : undefined);
    const primaryWhere = buildWhere(HOT_SIGNAL_PROVIDER, effectiveHotSignalLanguage);
    const legacyWhere = {
      ...(requestedLanguage ? { language: requestedLanguage } : {}),
      ...(q.competition ? { competition: q.competition } : {}),
      ...(q.q
        ? {
            OR: [
              { title: { contains: q.q, mode: "insensitive" as const } },
              { summary: { contains: q.q, mode: "insensitive" as const } }
            ]
          }
        : {}),
      ...(from || to
        ? {
            publishedAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {})
            }
          }
        : {})
    };

    const select = {
      id: true,
      provider: true,
      title: true,
      summary: true,
      url: true,
      imageUrl: true,
      sourceName: true,
      language: true,
      competition: true,
      publishedAt: true,
      createdAt: true
    } as const;

    let [items, total] = await Promise.all([
      app.prisma.newsItem.findMany({
        where: primaryWhere,
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
        take: q.limit,
        skip: q.offset,
        select
      }),
      app.prisma.newsItem.count({ where: primaryWhere })
    ]);

    if (items.length === 0 && (requestedLanguage || q.q || q.competition || from || to)) {
      [items, total] = await Promise.all([
        app.prisma.newsItem.findMany({
          where: fallbackWhere,
          orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
          take: q.limit,
          skip: q.offset,
          select
        }),
        app.prisma.newsItem.count({ where: fallbackWhere })
      ]);
    }

    if (items.length === 0) {
      [items, total] = await Promise.all([
        app.prisma.newsItem.findMany({
          where: legacyWhere,
          orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
          take: q.limit,
          skip: q.offset,
          select
        }),
        app.prisma.newsItem.count({ where: legacyWhere })
      ]);
    }

    if (requestedLanguage && requestedLanguage !== "en" && items.length === 0) {
      const legacyFallbackWhere = {
        ...legacyWhere,
        language: "en"
      };
      [items, total] = await Promise.all([
        app.prisma.newsItem.findMany({
          where: legacyFallbackWhere,
          orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
          take: q.limit,
          skip: q.offset,
          select
        }),
        app.prisma.newsItem.count({ where: legacyFallbackWhere })
      ]);
    }

    return { items, total };
  });

  app.get("/api/v1/system/news/status", { preHandler: app.requirePermission("api.manage") }, async () => {
    const config = await loadFootballNewsConfig(app);
    return {
      sync: state,
      config: {
        enabled: config.enabled,
        provider: config.provider,
        baseUrl: config.baseUrl,
        keyHeader: config.keyHeader,
        apiKeyMasked: maskApiKey(config.apiKey),
        hasApiKey: config.apiKey.trim().length > 0,
        endpoints: config.endpoints,
        defaults: config.defaults,
        polling: config.polling
      }
    };
  });

  app.post(
    "/api/v1/system/news/free-pack/install",
    { preHandler: app.requirePermission("api.manage") },
    async (request) => {
      const body = installFreePackSchema.parse(request.body ?? {});
      const row = await app.prisma.featureConfig.findUnique({ where: { key: "api" } });
      const current = isRecord(row?.value) ? row.value : {};
      const rawExistingProfiles = Array.isArray(current.footballNewsProfiles)
        ? current.footballNewsProfiles.filter(isRecord)
        : [];

      const existingProfiles: FootballNewsProfileNode[] = rawExistingProfiles
        .map((rawProfile, index) => {
          const profileRecord = isRecord(rawProfile) ? rawProfile : {};
          const parsed = footballNewsSchema.safeParse(profileRecord);
          if (!parsed.success) return null;
          const id =
            typeof profileRecord.id === "string" && profileRecord.id.trim().length > 0
              ? profileRecord.id.trim()
              : `profile-${index + 1}`;
          const name =
            typeof profileRecord.name === "string" && profileRecord.name.trim().length > 0
              ? profileRecord.name.trim()
              : parsed.data.provider;
          return {
            id,
            name,
            ...parsed.data
          };
        })
        .filter((profile): profile is FootballNewsProfileNode => profile !== null);

      const profilesByProvider = new Map<string, FootballNewsProfileNode>();
      for (const profile of existingProfiles) {
        profilesByProvider.set(profile.provider.toLowerCase(), profile);
      }
      for (const preset of FREE_FOOTBALL_NEWS_PROFILES) {
        if (!profilesByProvider.has(preset.provider.toLowerCase())) {
          profilesByProvider.set(preset.provider.toLowerCase(), preset);
        }
      }

      const mergedProfiles = [...profilesByProvider.values()];
      const requestedActive = body.activeProvider?.toLowerCase();
      const activeProfile =
        (requestedActive ? mergedProfiles.find((profile) => profile.provider.toLowerCase() === requestedActive) : null) ??
        mergedProfiles.find((profile) => profile.provider.toLowerCase() === "openligadb") ??
        mergedProfiles[0];

      if (!activeProfile) {
        throw app.httpErrors.badRequest("No API profile available after install");
      }

      const nextValue: Record<string, unknown> = {
        ...current,
        footballNewsProfiles: mergedProfiles.map((profile) => ({
          id: profile.id,
          name: profile.name,
          enabled: profile.enabled,
          provider: profile.provider,
          baseUrl: profile.baseUrl,
          apiKey: profile.apiKey,
          keyHeader: profile.keyHeader,
          endpoints: profile.endpoints,
          defaults: profile.defaults,
          polling: profile.polling
        })),
        ...(body.setActive
          ? {
              footballNewsActiveProfileId: activeProfile.id,
              footballNews: {
                enabled: activeProfile.enabled,
                provider: activeProfile.provider,
                baseUrl: activeProfile.baseUrl,
                apiKey: activeProfile.apiKey,
                keyHeader: activeProfile.keyHeader,
                endpoints: activeProfile.endpoints,
                defaults: activeProfile.defaults,
                polling: activeProfile.polling
              }
            }
          : {})
      };

      const after = await app.prisma.featureConfig.upsert({
        where: { key: "api" },
        update: {
          value: nextValue as never,
          updatedBy: request.auth.sub
        },
        create: {
          key: "api",
          value: nextValue as never,
          updatedBy: request.auth.sub
        }
      });

      await writeAudit(app.prisma, {
        actorId: request.auth.sub,
        actorRole: request.auth.role,
        action: "news.free_pack.install",
        module: "news",
        targetType: "feature_config",
        targetId: "api",
        before: row?.value ?? null,
        after: after.value,
        ipAddress: request.ip
      });

      return {
        ok: true,
        profiles: mergedProfiles.map((profile) => ({
          id: profile.id,
          name: profile.name,
          provider: profile.provider,
          enabled: profile.enabled
        })),
        activeProfileId: body.setActive ? activeProfile.id : (current.footballNewsActiveProfileId as string | undefined) ?? null
      };
    }
  );

  app.post(
    "/api/v1/system/news/sync",
    { preHandler: app.requirePermission("api.manage") },
    async (request) => {
      const body = manualSyncSchema.parse(request.body ?? {});
      const result = await runSync("manual", {
        force: body.force,
        actorId: request.auth.sub,
        actorRole: request.auth.role,
        ipAddress: request.ip
      });
      return result;
    }
  );

  app.get("/api/v1/system/hot-signals", { preHandler: app.requirePermission("api.manage") }, async (request) => {
    const q = hotSignalsQuerySchema.parse(request.query);
    const language = q.language ? normalizeAppHotSignalLanguage(q.language) : "en";
    const items = await app.prisma.newsItem.findMany({
      where: {
        provider: HOT_SIGNAL_PROVIDER,
        language
      },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      take: q.limit,
      select: {
        id: true,
        providerItemId: true,
        title: true,
        summary: true,
        url: true,
        imageUrl: true,
        sourceName: true,
        language: true,
        competition: true,
        publishedAt: true,
        createdAt: true,
        rawPayload: true
      }
    });

    return {
      items: items.map((item) => ({
        ...item,
        sourceProvider: isRecord(item.rawPayload) ? firstString(item.rawPayload, ["sourceProvider"]) : null,
        topicKey: isRecord(item.rawPayload) ? firstString(item.rawPayload, ["topicKey"]) : null
      }))
    };
  });

  app.post(
    "/api/v1/system/hot-signals/refresh",
    { preHandler: app.requirePermission("api.manage") },
    async (request) => {
      const syncResult = await runSync("manual", {
        force: true,
        actorId: request.auth.sub,
        actorRole: request.auth.role,
        ipAddress: request.ip
      });
      const items = await app.prisma.newsItem.findMany({
        where: {
          provider: HOT_SIGNAL_PROVIDER,
          language: "en"
        },
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
        take: HOT_SIGNAL_FEED_SIZE
      });

      return {
        ok: true,
        sync: syncResult,
        items
      };
    }
  );

  app.delete(
    "/api/v1/system/hot-signals/:id",
    { preHandler: app.requirePermission("api.manage") },
    async (request) => {
      const params = z.object({ id: z.string().min(1) }).parse(request.params);
      const current = await app.prisma.newsItem.findUnique({
        where: { id: params.id }
      });
      if (!current || current.provider !== HOT_SIGNAL_PROVIDER) {
        throw app.httpErrors.notFound("Hot signal not found");
      }

      const canonicalId = current.providerItemId.split(":")[0];
      const providerItemIds = [canonicalId, ...APP_HOT_SIGNAL_LANGUAGES.filter((language) => language !== "en").map((language) => `${canonicalId}:${language}`)];

      const deleted = await app.prisma.newsItem.deleteMany({
        where: {
          provider: HOT_SIGNAL_PROVIDER,
          providerItemId: {
            in: providerItemIds
          }
        }
      });

      await writeAudit(app.prisma, {
        actorId: request.auth.sub,
        actorRole: request.auth.role,
        action: "hot_signals.delete",
        module: "news",
        targetType: "news_item",
        targetId: canonicalId,
        before: current,
        after: { deletedCount: deleted.count },
        ipAddress: request.ip
      });

      return {
        ok: true,
        deleted: deleted.count
      };
    }
  );
};
