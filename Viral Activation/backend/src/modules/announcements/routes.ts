import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { writeAudit } from "../common/audit.js";

const createSchema = z.object({
  title: z.string().min(3).max(150),
  message: z.string().min(3).max(4000),
  target: z.string().min(2).max(40).default("all"),
  publishNow: z.boolean().default(true)
});

const updateSchema = z
  .object({
    title: z.string().min(3).max(150).optional(),
    message: z.string().min(3).max(4000).optional(),
    target: z.string().min(2).max(40).optional(),
    publishNow: z.boolean().optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be updated"
  });

const paramsSchema = z.object({
  id: z.string().min(1)
});

export const announcementRoutes: FastifyPluginAsync = async (app) => {
  app.get("/api/v1/app/announcements/latest", async () => {
    const now = new Date();
    const item = await app.prisma.announcement.findFirst({
      where: {
        publishedAt: {
          not: null,
          lte: now
        }
      },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        title: true,
        message: true,
        target: true,
        publishedAt: true,
        createdAt: true
      }
    });

    return { item };
  });

  app.get(
    "/api/v1/announcements",
    { preHandler: app.requirePermission("announcements.manage") },
    async () => {
      return app.prisma.announcement.findMany({
        orderBy: { createdAt: "desc" },
        take: 100
      });
    }
  );

  app.post(
    "/api/v1/announcements",
    { preHandler: app.requirePermission("announcements.manage") },
    async (request) => {
      const body = createSchema.parse(request.body);
      const created = await app.prisma.announcement.create({
        data: {
          title: body.title,
          message: body.message,
          target: body.target,
          createdById: request.auth.sub,
          publishedAt: body.publishNow ? new Date() : null
        }
      });
      await writeAudit(app.prisma, {
        actorId: request.auth.sub,
        actorRole: request.auth.role,
        action: "announcement.create",
        module: "announcements",
        targetType: "announcement",
        targetId: created.id,
        after: created,
        ipAddress: request.ip
      });
      return created;
    }
  );

  app.put(
    "/api/v1/announcements/:id",
    { preHandler: app.requirePermission("announcements.manage") },
    async (request) => {
      const { id } = paramsSchema.parse(request.params);
      const body = updateSchema.parse(request.body ?? {});

      const before = await app.prisma.announcement.findUnique({ where: { id } });
      if (!before) {
        throw app.httpErrors.notFound("Announcement not found");
      }

      const nextPublishedAt =
        body.publishNow === undefined
          ? before.publishedAt
          : body.publishNow
            ? before.publishedAt ?? new Date()
            : null;

      const after = await app.prisma.announcement.update({
        where: { id },
        data: {
          title: body.title ?? before.title,
          message: body.message ?? before.message,
          target: body.target ?? before.target,
          publishedAt: nextPublishedAt
        }
      });

      await writeAudit(app.prisma, {
        actorId: request.auth.sub,
        actorRole: request.auth.role,
        action: "announcement.update",
        module: "announcements",
        targetType: "announcement",
        targetId: after.id,
        before,
        after,
        ipAddress: request.ip
      });

      return after;
    }
  );

  app.delete(
    "/api/v1/announcements/:id",
    { preHandler: app.requirePermission("announcements.manage") },
    async (request) => {
      const { id } = paramsSchema.parse(request.params);

      const before = await app.prisma.announcement.findUnique({ where: { id } });
      if (!before) {
        throw app.httpErrors.notFound("Announcement not found");
      }

      await app.prisma.announcement.delete({ where: { id } });

      await writeAudit(app.prisma, {
        actorId: request.auth.sub,
        actorRole: request.auth.role,
        action: "announcement.delete",
        module: "announcements",
        targetType: "announcement",
        targetId: id,
        before,
        ipAddress: request.ip
      });

      return { ok: true, id };
    }
  );
};
