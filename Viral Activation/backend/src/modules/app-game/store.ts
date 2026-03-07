import { randomUUID } from "node:crypto";
import type { AppUser, Prisma, PrismaClient } from "@prisma/client";
import { createDefaultState, mergePersistedState, type AppGameState } from "./state.js";

const SESSION_ID_MAX_LENGTH = 128;

export interface LoadedGameSession {
  user: AppUser;
  state: AppGameState;
}

type PrismaStoreClient = Pick<
  PrismaClient,
  "appGameState" | "appUser" | "referralEvent" | "kickLedger"
>;

interface LedgerWrite {
  delta: number;
  reason: string;
  source: string;
}

function sanitizeSessionId(value: unknown): string | null {
  const sessionId = String(value ?? "").trim();
  if (sessionId.length < 8) return null;
  if (sessionId.length > SESSION_ID_MAX_LENGTH) return null;
  return sessionId;
}

function createGuestUsername(sessionId: string): string {
  return `guest_${sessionId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10) || "wc26"}`;
}

async function linkReferralOnCreate(
  tx: PrismaStoreClient,
  invitedUser: AppUser,
  referralSessionId?: string
): Promise<void> {
  const inviterSessionId = sanitizeSessionId(referralSessionId);
  if (!inviterSessionId) return;

  const inviterState = await tx.appGameState.findUnique({
    where: { sessionId: inviterSessionId },
    include: { user: true }
  });
  if (!inviterState) return;
  if (inviterState.user.id === invitedUser.id) return;

  const level1Exists = await tx.referralEvent.findFirst({
    where: {
      inviterUserId: inviterState.user.id,
      invitedUserId: invitedUser.id,
      level: 1
    },
    select: { id: true }
  });
  if (!level1Exists) {
    await tx.referralEvent.create({
      data: {
        inviterUserId: inviterState.user.id,
        invitedUserId: invitedUser.id,
        level: 1,
        status: "registered"
      }
    });
  }

  const parentReferral = await tx.referralEvent.findFirst({
    where: {
      invitedUserId: inviterState.user.id,
      level: 1
    },
    orderBy: { createdAt: "desc" },
    select: {
      inviterUserId: true
    }
  });
  if (!parentReferral) return;
  if (parentReferral.inviterUserId === invitedUser.id) return;

  const level2Exists = await tx.referralEvent.findFirst({
    where: {
      inviterUserId: parentReferral.inviterUserId,
      invitedUserId: invitedUser.id,
      level: 2
    },
    select: { id: true }
  });
  if (level2Exists) return;

  await tx.referralEvent.create({
    data: {
      inviterUserId: parentReferral.inviterUserId,
      invitedUserId: invitedUser.id,
      level: 2,
      status: "registered"
    }
  });
}

async function buildSessionFromRow(
  prisma: PrismaStoreClient,
  row: { sessionId: string; state: Prisma.JsonValue; user: AppUser }
): Promise<LoadedGameSession> {
  const state = mergePersistedState(row.state, row.sessionId, row.user.kick);
  await syncReferralCounters(prisma, row.user.id, state);
  return {
    user: row.user,
    state
  };
}

async function createFreshSession(
  tx: PrismaStoreClient,
  preferredSessionId?: string,
  referralSessionId?: string
): Promise<LoadedGameSession> {
  const sessionId = preferredSessionId ?? randomUUID();
  const user = await tx.appUser.create({
    data: {
      username: createGuestUsername(sessionId),
      nationCode: "VN"
    }
  });
  const state = createDefaultState(sessionId, user.kick);
  await tx.appGameState.create({
    data: {
      userId: user.id,
      sessionId,
      state: state as unknown as Prisma.InputJsonValue
    }
  });
  await linkReferralOnCreate(tx, user, referralSessionId);
  return { user, state };
}

export async function getOrCreateGameSession(
  prisma: PrismaClient,
  requestedSessionId?: string | null,
  referralSessionId?: string | null
): Promise<LoadedGameSession> {
  const sessionId = sanitizeSessionId(requestedSessionId);
  if (sessionId) {
    const existing = await prisma.appGameState.findUnique({
      where: { sessionId },
      include: { user: true }
    });
    if (existing) {
      return buildSessionFromRow(prisma, existing);
    }
  }

  return prisma.$transaction(async (tx) =>
    createFreshSession(tx, sessionId ?? undefined, referralSessionId ?? undefined)
  );
}

export async function persistGameSessionWithClient(
  client: PrismaStoreClient,
  session: LoadedGameSession,
  ledger?: LedgerWrite
): Promise<void> {
  await client.appUser.update({
    where: { id: session.user.id },
    data: {
      kick: Math.max(0, Math.floor(Number(session.state.kick) || 0)),
      mysteryTickets: Math.max(0, Math.floor(Number(session.state.spin.tickets) || 0))
    }
  });

  await client.appGameState.upsert({
    where: { userId: session.user.id },
    update: {
      sessionId: session.state.sessionId,
      state: session.state as unknown as Prisma.InputJsonValue
    },
    create: {
      userId: session.user.id,
      sessionId: session.state.sessionId,
      state: session.state as unknown as Prisma.InputJsonValue
    }
  });

  if (ledger && Number.isFinite(ledger.delta) && ledger.delta !== 0) {
    await client.kickLedger.create({
      data: {
        userId: session.user.id,
        delta: Math.floor(ledger.delta),
        reason: ledger.reason,
        source: ledger.source
      }
    });
  }
}

export async function persistGameSession(
  prisma: PrismaClient,
  session: LoadedGameSession,
  ledger?: LedgerWrite
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await persistGameSessionWithClient(tx, session, ledger);
  });
  session.user.kick = session.state.kick;
}

export async function syncReferralCounters(
  prisma: PrismaStoreClient,
  userId: string,
  state: AppGameState
): Promise<void> {
  const [f1Registered, f1Active7, f2Registered, f2Active7] = await Promise.all([
    prisma.referralEvent.count({
      where: { inviterUserId: userId, level: 1 }
    }),
    prisma.referralEvent.count({
      where: { inviterUserId: userId, level: 1, status: "active_7d" }
    }),
    prisma.referralEvent.count({
      where: { inviterUserId: userId, level: 2 }
    }),
    prisma.referralEvent.count({
      where: { inviterUserId: userId, level: 2, status: "active_7d" }
    })
  ]);

  state.referral.f1Registered = f1Registered;
  state.referral.f1Active7 = f1Active7;
  state.referral.f2Registered = f2Registered;
  state.referral.f2Active7 = f2Active7;
}
