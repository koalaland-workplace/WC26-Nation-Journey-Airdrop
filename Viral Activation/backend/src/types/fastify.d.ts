import type { PrismaClient } from "@prisma/client";
import type { AdminRole } from "@prisma/client";
import type { AuthContext } from "../modules/common/types.js";
import type { PendingStore } from "../plugins/pending-store.js";

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
    pendingStore: PendingStore;
    appConfig: {
      port: number;
      host: string;
      corsOrigin: string;
      jwtAccessSecret: string;
      jwtRefreshSecret: string;
      telegramBotToken: string;
      googleTranslateApiKey: string;
      requireTelegramSignature: boolean;
      cookieSecure: boolean;
      redisUrl: string | null;
    };
  }

  interface FastifyRequest {
    auth: AuthContext;
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: {
      sub: string;
      telegramId: string;
      username: string;
      role: AdminRole;
    };
    user: {
      sub: string;
      telegramId: string;
      username: string;
      role: AdminRole;
    };
  }
}
