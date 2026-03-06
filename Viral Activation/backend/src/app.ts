import Fastify from "fastify";
import fastifyCors from "@fastify/cors";
import fastifySensible from "@fastify/sensible";
import fastifyRateLimit from "@fastify/rate-limit";
import fastifyWebsocket from "@fastify/websocket";
import { ZodError } from "zod";
import { loadConfig } from "./plugins/env.js";
import { prismaPlugin } from "./plugins/prisma.js";
import { pendingStorePlugin } from "./plugins/pending-store.js";
import { authPlugin } from "./plugins/auth.js";
import { authRoutes } from "./modules/auth/routes.js";
import { dashboardRoutes } from "./modules/dashboard/routes.js";
import { userRoutes } from "./modules/users/routes.js";
import { kickLedgerRoutes } from "./modules/kick-ledger/routes.js";
import { configRoutes } from "./modules/config/routes.js";
import { announcementRoutes } from "./modules/announcements/routes.js";
import { boardRoutes } from "./modules/board/routes.js";
import { piqueRoutes } from "./modules/pique/routes.js";
import { reportsRoutes } from "./modules/reports/routes.js";
import { realtimeRoutes } from "./modules/realtime/routes.js";
import { referralsRoutes } from "./modules/referrals/routes.js";
import { matchesRoutes } from "./modules/matches/routes.js";
import { missionsRoutes } from "./modules/missions/routes.js";
import { socialRoutes } from "./modules/social/routes.js";
import { newsRoutes } from "./modules/news/routes.js";

export async function createApp() {
  const config = loadConfig();
  const app = Fastify({ logger: true });
  app.decorate("appConfig", config);
  const corsOrigin =
    config.corsOrigin === "*"
      ? true
      : config.corsOrigin
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean);

  await app.register(fastifySensible);
  await app.register(fastifyCors, {
    origin: corsOrigin,
    credentials: true
  });
  await app.register(fastifyRateLimit, {
    max: 100,
    timeWindow: "1 minute"
  });
  await app.register(fastifyWebsocket);
  await app.register(prismaPlugin);
  await app.register(pendingStorePlugin);
  await app.register(authPlugin);

  app.get("/healthz", async () => ({ ok: true, ts: new Date().toISOString() }));

  await app.register(authRoutes);
  await app.register(dashboardRoutes);
  await app.register(userRoutes);
  await app.register(kickLedgerRoutes);
  await app.register(configRoutes);
  await app.register(announcementRoutes);
  await app.register(boardRoutes);
  await app.register(piqueRoutes);
  await app.register(reportsRoutes);
  await app.register(realtimeRoutes);
  await app.register(referralsRoutes);
  await app.register(matchesRoutes);
  await app.register(missionsRoutes);
  await app.register(socialRoutes);
  await app.register(newsRoutes);

  app.get("/api/v1/ws/feed", { websocket: true }, (connection) => {
    const timer = setInterval(() => {
      connection.send(
        JSON.stringify({
          type: "metrics.pulse",
          at: new Date().toISOString()
        })
      );
    }, 5000);
    connection.on("close", () => clearInterval(timer));
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);
    const isZodError = error instanceof ZodError;
    const statusCode = isZodError
      ? 400
      : typeof error === "object" && error !== null && "statusCode" in error
        ? Number((error as { statusCode?: number }).statusCode ?? 500)
        : 500;
    const message = isZodError
      ? error.issues.map((issue) => `${issue.path.join(".") || "request"}: ${issue.message}`).join("; ")
      : error instanceof Error
        ? error.message
        : "Unexpected error";
    const name = isZodError ? "ValidationError" : error instanceof Error ? error.name : "Error";
    reply.status(statusCode).send({
      statusCode,
      error: name,
      message
    });
  });

  return app;
}
