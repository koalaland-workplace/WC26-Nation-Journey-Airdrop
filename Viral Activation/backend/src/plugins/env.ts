import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().default(8787),
  HOST: z.string().default("0.0.0.0"),
  CORS_ORIGIN: z.string().default("*"),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  TELEGRAM_BOT_TOKEN: z.string().default(""),
  GOOGLE_TRANSLATE_API_KEY: z.string().default(""),
  REQUIRE_TELEGRAM_SIGNATURE: z
    .string()
    .default("false")
    .transform((v) => v.toLowerCase() === "true"),
  COOKIE_SECURE: z
    .string()
    .default("false")
    .transform((v) => v.toLowerCase() === "true"),
  REDIS_URL: z.string().optional(),
  DATABASE_URL: z.string().min(1)
});

export type AppConfig = {
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

export function loadConfig(): AppConfig {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid env: ${parsed.error.message}`);
  }
  return {
    port: parsed.data.PORT,
    host: parsed.data.HOST,
    corsOrigin: parsed.data.CORS_ORIGIN,
    jwtAccessSecret: parsed.data.JWT_ACCESS_SECRET,
    jwtRefreshSecret: parsed.data.JWT_REFRESH_SECRET,
    telegramBotToken: parsed.data.TELEGRAM_BOT_TOKEN,
    googleTranslateApiKey: parsed.data.GOOGLE_TRANSLATE_API_KEY,
    requireTelegramSignature: parsed.data.REQUIRE_TELEGRAM_SIGNATURE,
    cookieSecure: parsed.data.COOKIE_SECURE,
    redisUrl: parsed.data.REDIS_URL ?? null
  };
}
