import { createHash } from "node:crypto";
import type { AdminRole } from "@prisma/client";
import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { writeAudit } from "../common/audit.js";

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

  const summary = firstString(raw, ["summary", "description", "snippet", "short_description"]);
  const content = firstString(raw, ["content", "body", "text"]);
  const imageUrl = firstString(raw, ["image", "imageUrl", "urlToImage", "thumbnail"]);
  const sourceName = firstString(raw, ["source.name", "source", "provider", "publisher"]);
  const language = firstString(raw, ["language", "lang"]) ?? config.defaults.language;
  const competition = firstString(raw, ["competition", "competition.name", "league", "league.name"]);

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
  const homeNation = firstString(raw, ["teams.home.name", "homeTeam.name", "home.name", "home_team", "home"]);
  const awayNation = firstString(raw, ["teams.away.name", "awayTeam.name", "away.name", "away_team", "away"]);
  const kickoffAt =
    firstDate(raw, ["fixture.date", "kickoff", "kickoffAt", "startTime", "date", "datetime"]) ?? null;

  if (!homeNation || !awayNation || !kickoffAt) return null;

  const rawGroup =
    firstString(raw, ["league.round", "round", "stage", "group", "groupCode", "competition.name"]) ??
    config.defaults.competitions[0] ??
    "A";

  const providerFixtureId =
    firstString(raw, ["fixture.id", "id", "fixture_id", "match_id", "event_key"]) ??
    createHash("sha1")
      .update(`${config.provider}:${homeNation}:${awayNation}:${kickoffAt.toISOString()}`)
      .digest("hex");

  const stadium = firstString(raw, ["fixture.venue.name", "venue.name", "stadium", "ground"]) ?? "TBD";
  const city = firstString(raw, ["fixture.venue.city", "venue.city", "city"]);
  const homeScore = firstNumber(raw, ["goals.home", "score.fulltime.home", "scores.home", "homeScore"]);
  const awayScore = firstNumber(raw, ["goals.away", "score.fulltime.away", "scores.away", "awayScore"]);
  const highlight = firstString(raw, ["fixture.status.long", "status.long", "league.round", "round"]);

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
  const url = new URL(normalizePath(config.endpoints.news), config.baseUrl);
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

function buildFixturesUrl(config: FootballNewsConfig): URL {
  const url = new URL(normalizePath(config.endpoints.fixtures), config.baseUrl);

  const hasCompetition = url.searchParams.has("competition") || url.searchParams.has("competitions");
  if (!hasCompetition && config.defaults.competitions.length > 0) {
    url.searchParams.set("competitions", config.defaults.competitions.join(","));
    if (config.defaults.competitions.length === 1) {
      url.searchParams.set("competition", config.defaults.competitions[0]);
    }
  }
  if (!url.searchParams.has("timezone")) {
    url.searchParams.set("timezone", config.defaults.timezone);
  }
  if (!url.searchParams.has("language") && !url.searchParams.has("lang")) {
    url.searchParams.set("language", config.defaults.language);
    url.searchParams.set("lang", config.defaults.language);
  }
  return url;
}

async function fetchProviderNews(config: FootballNewsConfig): Promise<{
  requestUrl: string;
  items: NormalizedNewsItem[];
  fetched: number;
}> {
  const url = buildNewsUrl(config);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.polling.timeoutMs);

  const headers: Record<string, string> = {
    Accept: "application/json"
  };
  if (config.apiKey.trim()) {
    headers[config.keyHeader] = config.apiKey.trim();
  }

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
    throw new Error(`Football provider request failed (${response.status}): ${text || "no message"}`);
  }

  const payload = (await response.json()) as unknown;
  const records = extractArray(payload);
  const mapped = records
    .map((item) => normalizeNewsRecord(item, config))
    .filter((item): item is NormalizedNewsItem => item !== null);

  const deduped = new Map<string, NormalizedNewsItem>();
  for (const item of mapped) {
    deduped.set(item.providerItemId, item);
  }

  return {
    requestUrl: url.toString(),
    items: [...deduped.values()],
    fetched: records.length
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

  const headers: Record<string, string> = {
    Accept: "application/json"
  };
  if (config.apiKey.trim()) {
    headers[config.keyHeader] = config.apiKey.trim();
  }

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

async function upsertNewsItems(app: FastifyInstance, config: FootballNewsConfig, items: NormalizedNewsItem[]) {
  let stored = 0;
  for (const item of items) {
    await app.prisma.newsItem.upsert({
      where: {
        provider_providerItemId: {
          provider: config.provider,
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
        provider: config.provider,
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
      let fixturesRequestUrl = "";
      let fixturesFetched = 0;
      let fixturesStored = 0;
      let fixturesCreated = 0;
      let fixturesUpdated = 0;

      const newsFetch = await fetchProviderNews(config);
      newsRequestUrl = newsFetch.requestUrl;
      newsFetched = newsFetch.fetched;
      newsStored = await upsertNewsItems(app, config, newsFetch.items);

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
    if (state.nextRunAt) {
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
    const where = {
      ...(q.language ? { language: q.language } : {}),
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

    const [items, total] = await Promise.all([
      app.prisma.newsItem.findMany({
        where,
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
        take: q.limit,
        skip: q.offset,
        select: {
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
        }
      }),
      app.prisma.newsItem.count({ where })
    ]);
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
};
