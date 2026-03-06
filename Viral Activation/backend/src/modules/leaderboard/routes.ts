import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

const pagingSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0)
});

export const leaderboardRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/api/v1/leaderboard/kick",
    { preHandler: app.requirePermission("dashboard.read") },
    async (request) => {
      const { limit, offset } = pagingSchema.parse(request.query);
      const where = {
        status: { not: "banned" as const }
      };

      const [items, total] = await Promise.all([
        app.prisma.appUser.findMany({
          where,
          orderBy: [{ kick: "desc" }, { createdAt: "asc" }],
          take: limit,
          skip: offset
        }),
        app.prisma.appUser.count({ where })
      ]);

      return {
        items: items.map((row, index) => ({
          rank: offset + index + 1,
          userId: row.id,
          telegramId: row.telegramId,
          username: row.username,
          nationCode: row.nationCode,
          kick: row.kick,
          status: row.status
        })),
        total
      };
    }
  );

  app.get(
    "/api/v1/leaderboard/referrers",
    { preHandler: app.requirePermission("dashboard.read") },
    async (request) => {
      const { limit, offset } = pagingSchema.parse(request.query);

      const [aggAll, aggF1, aggActive7, aggFlagged] = await Promise.all([
        app.prisma.referralEvent.groupBy({
          by: ["inviterUserId"],
          _count: { _all: true },
          _sum: { kickAward: true }
        }),
        app.prisma.referralEvent.groupBy({
          by: ["inviterUserId"],
          where: { level: 1 },
          _count: { _all: true }
        }),
        app.prisma.referralEvent.groupBy({
          by: ["inviterUserId"],
          where: { status: "active_7d" },
          _count: { _all: true }
        }),
        app.prisma.referralEvent.groupBy({
          by: ["inviterUserId"],
          where: {
            OR: [{ status: "flagged" }, { riskScore: { gte: 70 } }]
          },
          _count: { _all: true }
        })
      ]);

      const inviterIds = aggAll.map((row) => row.inviterUserId);
      const inviters =
        inviterIds.length > 0
          ? await app.prisma.appUser.findMany({
              where: { id: { in: inviterIds } },
              select: {
                id: true,
                telegramId: true,
                username: true,
                nationCode: true,
                kick: true,
                status: true
              }
            })
          : [];

      const inviterMap = new Map(inviters.map((row) => [row.id, row]));
      const f1Map = new Map(aggF1.map((row) => [row.inviterUserId, row._count._all]));
      const active7Map = new Map(aggActive7.map((row) => [row.inviterUserId, row._count._all]));
      const flaggedMap = new Map(aggFlagged.map((row) => [row.inviterUserId, row._count._all]));

      const ranked = aggAll
        .map((row) => {
          const inviter = inviterMap.get(row.inviterUserId);
          return {
            inviterUserId: row.inviterUserId,
            telegramId: inviter?.telegramId ?? null,
            username: inviter?.username ?? "unknown",
            nationCode: inviter?.nationCode ?? "NA",
            inviterKick: inviter?.kick ?? 0,
            inviterStatus: inviter?.status ?? "active",
            totalReferrals: row._count._all,
            f1Referrals: f1Map.get(row.inviterUserId) ?? 0,
            active7dCount: active7Map.get(row.inviterUserId) ?? 0,
            totalKickAwarded: row._sum.kickAward ?? 0,
            flaggedCount: flaggedMap.get(row.inviterUserId) ?? 0
          };
        })
        .sort((a, b) => {
          if (b.totalReferrals !== a.totalReferrals) return b.totalReferrals - a.totalReferrals;
          if (b.totalKickAwarded !== a.totalKickAwarded) return b.totalKickAwarded - a.totalKickAwarded;
          return b.inviterKick - a.inviterKick;
        });

      const sliced = ranked.slice(offset, offset + limit);
      return {
        items: sliced.map((row, index) => ({
          rank: offset + index + 1,
          ...row
        })),
        total: ranked.length
      };
    }
  );

  app.get(
    "/api/v1/leaderboard/nations",
    { preHandler: app.requirePermission("dashboard.read") },
    async (request) => {
      const { limit, offset } = pagingSchema.parse(request.query);
      const where = { status: { not: "banned" as const } };

      const [nationAgg, eligibleAgg, topUsers] = await Promise.all([
        app.prisma.appUser.groupBy({
          by: ["nationCode"],
          where,
          _count: { _all: true },
          _sum: { kick: true }
        }),
        app.prisma.appUser.groupBy({
          by: ["nationCode"],
          where: {
            ...where,
            kick: { gte: 5000 }
          },
          _count: { _all: true }
        }),
        app.prisma.appUser.findMany({
          where,
          distinct: ["nationCode"],
          orderBy: [{ nationCode: "asc" }, { kick: "desc" }],
          select: {
            nationCode: true,
            username: true,
            kick: true
          }
        })
      ]);

      const eligibleMap = new Map(eligibleAgg.map((row) => [row.nationCode, row._count._all]));
      const topUserMap = new Map(
        topUsers.map((row) => [row.nationCode, { username: row.username ?? "unknown", kick: row.kick }])
      );

      const ranked = nationAgg
        .map((row) => {
          const totalKick = row._sum.kick ?? 0;
          const totalUsers = row._count._all;
          const eligibleUsers = eligibleMap.get(row.nationCode) ?? 0;
          const warPoints = eligibleUsers > 0 ? totalKick / eligibleUsers : 0;
          const top = topUserMap.get(row.nationCode) ?? { username: "unknown", kick: 0 };
          return {
            nationCode: row.nationCode,
            totalKick,
            totalUsers,
            eligibleUsers,
            warPoints: Number(warPoints.toFixed(2)),
            topUsername: top.username,
            topKick: top.kick
          };
        })
        .sort((a, b) => b.warPoints - a.warPoints);

      const sliced = ranked.slice(offset, offset + limit);
      return {
        items: sliced.map((row, index) => ({
          rank: offset + index + 1,
          ...row
        })),
        total: ranked.length
      };
    }
  );
};
