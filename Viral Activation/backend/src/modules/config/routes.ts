import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { writeAudit } from "../common/audit.js";

const configKeySchema = z.enum(["spin", "penalty", "missions", "settings", "api", "rules", "wc26token"]);
const appRulesQuerySchema = z.object({
  language: z.string().trim().min(2).max(12).optional()
});

const wrappedUpdateSchema = z.object({
  value: z.record(z.any())
});

const directUpdateSchema = z.record(z.any());

interface RulesEntry extends Record<string, unknown> {
  title: string;
  content: string;
  updatedAt: string | null;
}

interface RulesConfigValue extends Record<string, unknown> {
  defaultLanguage: string;
  entries: Record<string, RulesEntry>;
}

function parseMaybeJsonDeep(value: unknown, maxDepth = 3): unknown {
  let next = value;
  for (let i = 0; i < maxDepth; i += 1) {
    if (typeof next !== "string") return next;
    const trimmed = next.trim();
    if (!trimmed) return next;
    try {
      next = JSON.parse(trimmed) as unknown;
    } catch {
      return next;
    }
  }
  return next;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeLanguageCode(value: string): string {
  return value.trim().toLowerCase();
}

function asTrimmedString(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return trimmed.slice(0, maxLength).trim();
}

function normalizeRulesConfig(value: unknown): RulesConfigValue {
  const source = isRecord(value) ? value : {};
  const rawEntries = isRecord(source.entries) ? source.entries : {};

  const entries: Record<string, RulesEntry> = {};
  for (const [rawLanguage, rawEntry] of Object.entries(rawEntries)) {
    const language = normalizeLanguageCode(rawLanguage);
    if (!language) continue;
    const entry = isRecord(rawEntry) ? rawEntry : {};
    const title = asTrimmedString(entry.title, 200);
    const content = asTrimmedString(entry.content, 20_000);
    if (!title && !content) continue;
    entries[language] = {
      title,
      content,
      updatedAt: asTrimmedString(entry.updatedAt, 64) || null
    };
  }

  const preferredDefault = normalizeLanguageCode(asTrimmedString(source.defaultLanguage, 12) || "en");
  const fallbackDefault =
    (preferredDefault && entries[preferredDefault] && preferredDefault) ||
    (entries.en ? "en" : Object.keys(entries)[0] ?? "en");

  return {
    defaultLanguage: fallbackDefault,
    entries
  };
}

function resolveRulesEntry(config: RulesConfigValue, requestedLanguage?: string) {
  const requested = requestedLanguage ? normalizeLanguageCode(requestedLanguage) : "";
  const candidates = [requested, config.defaultLanguage, "en", ...Object.keys(config.entries)];
  const visited = new Set<string>();

  for (const language of candidates) {
    if (!language || visited.has(language)) continue;
    visited.add(language);
    const entry = config.entries[language];
    if (!entry) continue;
    if (!entry.title && !entry.content) continue;
    return {
      requestedLanguage: requested || null,
      language,
      fallbackLanguage: requested && requested !== language ? language : null,
      entry
    };
  }

  return {
    requestedLanguage: requested || null,
    language: config.defaultLanguage,
    fallbackLanguage: requested ? config.defaultLanguage : null,
    entry: null as RulesEntry | null
  };
}

export const configRoutes: FastifyPluginAsync = async (app) => {
  app.get("/api/v1/app/rules", async (request) => {
    const query = appRulesQuerySchema.parse(request.query ?? {});
    const row = await app.prisma.featureConfig.findUnique({ where: { key: "rules" } });
    const config = normalizeRulesConfig(row?.value);
    const resolved = resolveRulesEntry(config, query.language);

    return {
      requestedLanguage: resolved.requestedLanguage,
      language: resolved.language,
      defaultLanguage: config.defaultLanguage,
      fallbackLanguage: resolved.fallbackLanguage,
      availableLanguages: Object.keys(config.entries).sort((left, right) => left.localeCompare(right)),
      title: resolved.entry?.title ?? "",
      content: resolved.entry?.content ?? "",
      updatedAt: resolved.entry?.updatedAt ?? null
    };
  });

  app.get(
    "/api/v1/config/:key",
    { preHandler: app.requirePermission("dashboard.read") },
    async (request) => {
      const key = configKeySchema.parse((request.params as { key: string }).key);
      const row = await app.prisma.featureConfig.findUnique({ where: { key } });
      return row ?? { key, value: {} };
    }
  );

  app.put(
    "/api/v1/config/:key",
    {
      preHandler: async (request, reply) => {
        const key = configKeySchema.parse((request.params as { key: string }).key);
        const permMap: Record<string, Parameters<typeof app.requirePermission>[0]> = {
          spin: "config.spin",
          penalty: "config.penalty",
          missions: "missions.manage",
          settings: "settings.manage",
          api: "api.manage",
          rules: "announcements.manage",
          wc26token: "economy.manage"
        };
        return app.requirePermission(permMap[key])(request, reply);
      }
    },
    async (request) => {
      const key = configKeySchema.parse((request.params as { key: string }).key);
      const rawBody = parseMaybeJsonDeep(request.body);
      const withParsedValue =
        typeof rawBody === "object" &&
        rawBody !== null &&
        "value" in rawBody &&
        typeof (rawBody as { value?: unknown }).value === "string"
          ? {
              ...(rawBody as Record<string, unknown>),
              value: parseMaybeJsonDeep((rawBody as { value?: unknown }).value)
            }
          : rawBody;
      const body =
        typeof withParsedValue === "object" && withParsedValue !== null && "value" in withParsedValue
          ? wrappedUpdateSchema.parse(withParsedValue).value
          : directUpdateSchema.parse(withParsedValue);
      const payload = key === "rules" ? normalizeRulesConfig(body) : body;
      const before = await app.prisma.featureConfig.findUnique({ where: { key } });
      const after = await app.prisma.featureConfig.upsert({
        where: { key },
        update: {
          value: payload,
          updatedBy: request.auth.sub
        },
        create: {
          key,
          value: payload,
          updatedBy: request.auth.sub
        }
      });
      await writeAudit(app.prisma, {
        actorId: request.auth.sub,
        actorRole: request.auth.role,
        action: "config.update",
        module: "config",
        targetType: "feature_config",
        targetId: key,
        before: before?.value,
        after: after.value,
        ipAddress: request.ip
      });
      return after;
    }
  );
};
