import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { writeAudit } from "../common/audit.js";

const configKeySchema = z.enum(["spin", "penalty", "missions", "settings", "api"]);

const updateSchema = z.object({
  value: z.record(z.any())
});

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return value;
  }
}

export const configRoutes: FastifyPluginAsync = async (app) => {
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
          api: "api.manage"
        };
        return app.requirePermission(permMap[key])(request, reply);
      }
    },
    async (request) => {
      const key = configKeySchema.parse((request.params as { key: string }).key);
      const rawBody = parseMaybeJson(request.body);
      const withParsedValue =
        typeof rawBody === "object" &&
        rawBody !== null &&
        "value" in rawBody &&
        typeof (rawBody as { value?: unknown }).value === "string"
          ? {
              ...(rawBody as Record<string, unknown>),
              value: parseMaybeJson((rawBody as { value?: unknown }).value)
            }
          : rawBody;
      const body = updateSchema.parse(withParsedValue);
      const before = await app.prisma.featureConfig.findUnique({ where: { key } });
      const after = await app.prisma.featureConfig.upsert({
        where: { key },
        update: {
          value: body.value,
          updatedBy: request.auth.sub
        },
        create: {
          key,
          value: body.value,
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
