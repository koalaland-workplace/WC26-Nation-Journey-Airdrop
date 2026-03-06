import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { writeAudit } from "../common/audit.js";

const listSchema = z.object({
  active: z
    .string()
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  platform: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0)
});

const upsertSchema = z.object({
  id: z.string().min(1).optional(),
  platform: z.string().min(2).max(40),
  name: z.string().min(2).max(120),
  url: z.string().min(3).max(300),
  icon: z.string().min(1).max(8).optional(),
  tasks: z.coerce.number().int().min(0).max(10_000).default(0),
  kick: z.coerce.number().int().min(0).max(100_000_000).default(0),
  sortOrder: z.coerce.number().int().min(-1000).max(1000).default(0),
  isActive: z.boolean().default(true)
});

export const socialRoutes: FastifyPluginAsync = async (app) => {
  app.get("/api/v1/social/channels", { preHandler: app.requirePermission("dashboard.read") }, async (request) => {
    const q = listSchema.parse(request.query);
    const where = {
      ...(q.platform ? { platform: q.platform } : {}),
      ...(q.active !== undefined ? { isActive: q.active } : {})
    };

    const [items, total] = await Promise.all([
      app.prisma.socialChannel.findMany({
        where,
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
        take: q.limit,
        skip: q.offset
      }),
      app.prisma.socialChannel.count({ where })
    ]);

    return { items, total };
  });

  app.post(
    "/api/v1/social/channels/upsert",
    { preHandler: app.requirePermission("missions.manage") },
    async (request) => {
      const body = upsertSchema.parse(request.body);
      const before = body.id ? await app.prisma.socialChannel.findUnique({ where: { id: body.id } }) : null;
      const after = body.id
        ? await app.prisma.socialChannel.update({
            where: { id: body.id },
            data: {
              platform: body.platform.trim(),
              name: body.name.trim(),
              url: body.url.trim(),
              icon: body.icon?.trim() || null,
              tasks: body.tasks,
              kick: body.kick,
              sortOrder: body.sortOrder,
              isActive: body.isActive
            }
          })
        : await app.prisma.socialChannel.create({
            data: {
              platform: body.platform.trim(),
              name: body.name.trim(),
              url: body.url.trim(),
              icon: body.icon?.trim() || null,
              tasks: body.tasks,
              kick: body.kick,
              sortOrder: body.sortOrder,
              isActive: body.isActive
            }
          });

      await writeAudit(app.prisma, {
        actorId: request.auth.sub,
        actorRole: request.auth.role,
        action: before ? "social_channel.update" : "social_channel.create",
        module: "social",
        targetType: "social_channel",
        targetId: after.id,
        before,
        after,
        ipAddress: request.ip
      });
      return after;
    }
  );

  app.patch(
    "/api/v1/social/channels/:id/toggle",
    { preHandler: app.requirePermission("missions.manage") },
    async (request) => {
      const id = z.object({ id: z.string().min(1) }).parse(request.params).id;
      const body = z.object({ isActive: z.boolean() }).parse(request.body);
      const before = await app.prisma.socialChannel.findUnique({ where: { id } });
      if (!before) {
        throw app.httpErrors.notFound("Social channel not found");
      }
      const after = await app.prisma.socialChannel.update({
        where: { id },
        data: { isActive: body.isActive }
      });

      await writeAudit(app.prisma, {
        actorId: request.auth.sub,
        actorRole: request.auth.role,
        action: "social_channel.toggle",
        module: "social",
        targetType: "social_channel",
        targetId: after.id,
        before,
        after,
        ipAddress: request.ip
      });
      return after;
    }
  );

  app.delete(
    "/api/v1/social/channels/:id",
    { preHandler: app.requirePermission("missions.manage") },
    async (request) => {
      const id = z.object({ id: z.string().min(1) }).parse(request.params).id;
      const before = await app.prisma.socialChannel.findUnique({ where: { id } });
      if (!before) {
        throw app.httpErrors.notFound("Social channel not found");
      }
      await app.prisma.socialChannel.delete({ where: { id } });

      await writeAudit(app.prisma, {
        actorId: request.auth.sub,
        actorRole: request.auth.role,
        action: "social_channel.delete",
        module: "social",
        targetType: "social_channel",
        targetId: id,
        before,
        after: null,
        ipAddress: request.ip
      });

      return { ok: true };
    }
  );
};
