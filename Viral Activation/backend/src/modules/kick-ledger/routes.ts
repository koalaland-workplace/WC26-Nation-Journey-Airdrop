import type { FastifyPluginAsync } from "fastify";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { writeAudit } from "../common/audit.js";
import { ensureToday, mergePersistedState, sessionView, spinLeft } from "../app-game/state.js";

const adjustSchema = z.object({
  userId: z.string().min(1),
  delta: z.coerce.number().int().min(-1_000_000).max(1_000_000),
  reason: z.string().min(3).max(200),
  source: z.string().min(2).max(40).default("manual")
});

const ledgerQuerySchema = z.object({
  userId: z.string().optional(),
  limit: z.coerce.number().min(1).max(200).default(50),
  offset: z.coerce.number().min(0).default(0)
});

const spinGrantSchema = z.object({
  userId: z.string().min(1),
  amount: z.coerce.number().int().min(1).max(100),
  reason: z.string().min(3).max(200).default("Manual spin grant"),
  source: z.string().min(2).max(40).default("admin_panel")
});

export const kickLedgerRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/api/v1/kick-ledger",
    { preHandler: app.requirePermission("reports.read") },
    async (request) => {
      const q = ledgerQuerySchema.parse(request.query);
      const where = q.userId ? { userId: q.userId } : {};
      const [items, total] = await Promise.all([
        app.prisma.kickLedger.findMany({
          where,
          include: { user: true, actor: true },
          orderBy: { createdAt: "desc" },
          take: q.limit,
          skip: q.offset
        }),
        app.prisma.kickLedger.count({ where })
      ]);
      return { items, total };
    }
  );

  app.post(
    "/api/v1/kick-ledger/adjust",
    { preHandler: app.requirePermission("kick.adjust") },
    async (request) => {
      const body = adjustSchema.parse(request.body);
      const result = await app.prisma.$transaction(async (tx) => {
        const userBefore = await tx.appUser.findUnique({ where: { id: body.userId } });
        if (!userBefore) {
          throw app.httpErrors.notFound("User not found");
        }
        const userAfter = await tx.appUser.update({
          where: { id: body.userId },
          data: { kick: { increment: body.delta } }
        });
        const ledger = await tx.kickLedger.create({
          data: {
            userId: body.userId,
            delta: body.delta,
            reason: body.reason,
            source: body.source,
            actorId: request.auth.sub
          }
        });
        return { userBefore, userAfter, ledger };
      });

      await writeAudit(app.prisma, {
        actorId: request.auth.sub,
        actorRole: request.auth.role,
        action: "kick.adjust",
        module: "economy",
        targetType: "app_user",
        targetId: body.userId,
        before: { kick: result.userBefore.kick },
        after: { kick: result.userAfter.kick, delta: body.delta, reason: body.reason },
        ipAddress: request.ip
      });
      return result;
    }
  );

  app.post(
    "/api/v1/spin/grant",
    { preHandler: app.requirePermission("kick.adjust") },
    async (request) => {
      const body = spinGrantSchema.parse(request.body);

      const result = await app.prisma.$transaction(async (tx) => {
        const user = await tx.appUser.findUnique({
          where: { id: body.userId }
        });
        if (!user) {
          throw app.httpErrors.notFound("User not found");
        }

        const gameState = await tx.appGameState.findUnique({
          where: { userId: body.userId }
        });
        if (!gameState) {
          throw app.httpErrors.conflict("User has no game session yet. Ask user to open app first.");
        }

        const state = mergePersistedState(
          gameState.state,
          gameState.sessionId,
          user.kick,
          user.nationCode ?? "VN"
        );
        ensureToday(state);

        const leftBefore = spinLeft(state);
        state.spin.share = Math.max(0, Math.floor(Number(state.spin.share || 0)) + body.amount);
        const leftAfter = spinLeft(state);
        const granted = Math.max(0, leftAfter - leftBefore);
        const view = sessionView(state);

        await tx.appGameState.update({
          where: { userId: body.userId },
          data: {
            state: state as unknown as Prisma.InputJsonValue
          }
        });

        return {
          user,
          leftBefore,
          leftAfter,
          granted,
          view
        };
      });

      await writeAudit(app.prisma, {
        actorId: request.auth.sub,
        actorRole: request.auth.role,
        action: "spin.grant",
        module: "economy",
        targetType: "app_user",
        targetId: body.userId,
        before: {
          spinLeft: result.leftBefore
        },
        after: {
          spinLeft: result.leftAfter,
          requested: body.amount,
          granted: result.granted,
          reason: body.reason,
          source: body.source
        },
        ipAddress: request.ip
      });

      return {
        ok: true,
        userId: body.userId,
        username: result.user.username ?? null,
        requested: body.amount,
        granted: result.granted,
        reason: body.reason,
        source: body.source,
        spin: result.view.spin
      };
    }
  );
};
