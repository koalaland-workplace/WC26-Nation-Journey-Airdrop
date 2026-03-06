import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { writeAudit } from "../common/audit.js";

const tierSchema = z.enum(["rookie", "starter", "pro", "champion", "master", "legend"]);
const listQuerySchema = z.object({
  q: z.string().optional(),
  status: z.enum(["active", "banned", "vip"]).optional(),
  tier: tierSchema.optional(),
  limit: z.coerce.number().min(1).max(200).default(50),
  offset: z.coerce.number().min(0).default(0)
});

const statusSchema = z.object({
  status: z.enum(["active", "banned", "vip"])
});

type UserTier = z.infer<typeof tierSchema>;
type UserStatus = z.infer<typeof statusSchema>["status"];

const USER_TIER_POLICY: Array<{ tier: UserTier; minKick: number }> = [
  { tier: "rookie", minKick: 0 },
  { tier: "starter", minKick: 25_000 },
  { tier: "pro", minKick: 100_000 },
  { tier: "champion", minKick: 250_000 },
  { tier: "master", minKick: 500_000 },
  { tier: "legend", minKick: 1_000_000 }
];

const USER_TIER_POLICY_DESC = [...USER_TIER_POLICY].sort((left, right) => right.minKick - left.minKick);

function resolveTierByKick(kick: number): UserTier {
  const safeKick = Number.isFinite(kick) ? kick : 0;
  for (const policy of USER_TIER_POLICY_DESC) {
    if (safeKick >= policy.minKick) return policy.tier;
  }
  return "rookie";
}

function buildTierStats(rows: Array<{ kick: number; status: UserStatus }>) {
  const statsMap = new Map(
    USER_TIER_POLICY.map((policy, index) => {
      const next = USER_TIER_POLICY[index + 1];
      return [
        policy.tier,
        {
          tier: policy.tier,
          minKick: policy.minKick,
          maxKick: next?.minKick ?? null,
          totalUsers: 0,
          activeUsers: 0,
          vipUsers: 0,
          bannedUsers: 0,
          totalKick: 0
        }
      ];
    })
  );

  for (const row of rows) {
    const tier = resolveTierByKick(row.kick);
    const bucket = statsMap.get(tier);
    if (!bucket) continue;
    bucket.totalUsers += 1;
    bucket.totalKick += row.kick;
    if (row.status === "active") bucket.activeUsers += 1;
    if (row.status === "vip") bucket.vipUsers += 1;
    if (row.status === "banned") bucket.bannedUsers += 1;
  }

  return USER_TIER_POLICY.map((policy) => statsMap.get(policy.tier)!);
}

function tierKickWhere(tier: UserTier | undefined): { gte: number; lt?: number } | undefined {
  if (!tier) return undefined;
  const index = USER_TIER_POLICY.findIndex((policy) => policy.tier === tier);
  if (index < 0) return undefined;
  const current = USER_TIER_POLICY[index];
  const next = USER_TIER_POLICY[index + 1];
  if (!next) return { gte: current.minKick };
  return { gte: current.minKick, lt: next.minKick };
}

export const userRoutes: FastifyPluginAsync = async (app) => {
  app.get("/api/v1/users", { preHandler: app.requirePermission("users.manage") }, async (request) => {
    const q = listQuerySchema.parse(request.query);
    const tierKick = tierKickWhere(q.tier);
    const where = {
      ...(q.status ? { status: q.status } : {}),
      ...(tierKick ? { kick: tierKick } : {}),
      ...(q.q
        ? {
            OR: [
              { username: { contains: q.q, mode: "insensitive" as const } },
              { telegramId: { contains: q.q, mode: "insensitive" as const } }
            ]
          }
        : {})
    };
    const [items, total, allUsersForStats] = await Promise.all([
      app.prisma.appUser.findMany({
        where,
        orderBy: { kick: "desc" },
        take: q.limit,
        skip: q.offset
      }),
      app.prisma.appUser.count({ where }),
      app.prisma.appUser.findMany({
        where,
        select: {
          kick: true,
          status: true
        }
      })
    ]);

    const userIds = items.map((user) => user.id);
    const [directRows, indirectRows] =
      userIds.length > 0
        ? await Promise.all([
            app.prisma.referralEvent.groupBy({
              by: ["inviterUserId"],
              where: { inviterUserId: { in: userIds }, level: 1 },
              _count: { _all: true }
            }),
            app.prisma.referralEvent.groupBy({
              by: ["inviterUserId"],
              where: { inviterUserId: { in: userIds }, level: 2 },
              _count: { _all: true }
            })
          ])
        : [[], []];

    const directMap = new Map(directRows.map((row) => [row.inviterUserId, row._count._all]));
    const indirectMap = new Map(indirectRows.map((row) => [row.inviterUserId, row._count._all]));

    return {
      items: items.map((user) => ({
        ...user,
        tier: resolveTierByKick(user.kick),
        directReferrals: directMap.get(user.id) ?? 0,
        indirectReferrals: indirectMap.get(user.id) ?? 0
      })),
      total,
      tierStats: buildTierStats(allUsersForStats)
    };
  });

  app.patch(
    "/api/v1/users/:id/status",
    { preHandler: app.requirePermission("users.manage") },
    async (request) => {
      const id = z.object({ id: z.string().min(1) }).parse(request.params).id;
      const body = statusSchema.parse(request.body);
      const before = await app.prisma.appUser.findUnique({ where: { id } });
      if (!before) {
        throw app.httpErrors.notFound("User not found");
      }
      const after = await app.prisma.appUser.update({
        where: { id },
        data: { status: body.status }
      });
      await writeAudit(app.prisma, {
        actorId: request.auth.sub,
        actorRole: request.auth.role,
        action: "user.status.update",
        module: "users",
        targetType: "app_user",
        targetId: id,
        before,
        after,
        ipAddress: request.ip
      });
      return after;
    }
  );
};
