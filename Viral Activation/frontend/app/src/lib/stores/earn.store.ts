import { get, writable } from "svelte/store";
import { claimEarnTask, fetchEarnCatalog, fetchEarnState, verifyEarnTask } from "../modules/earn/api";
import { EARN_TASK_CAP } from "../modules/earn/data";
import { activateReferralBoost, fetchReferralState } from "../modules/referral/api";
import type { EarnChannelItem, EarnClaimResult, EarnTask, EarnTaskCategory } from "../modules/earn/types";
import type { ReferralState } from "../modules/referral/types";
import { sessionStore } from "./session.store";

export type EarnStatus = "idle" | "loading" | "ready" | "error";

export interface EarnState {
  status: EarnStatus;
  taskCap: number;
  categories: EarnTaskCategory[];
  tasks: EarnTask[];
  channels: EarnChannelItem[];
  claimedTaskIds: string[];
  verifiedTaskIds: string[];
  claimedKick: number;
  referral: ReferralState;
  isBoosting: boolean;
  errorMessage: string | null;
}

const DEFAULT_REFERRAL_STATE: ReferralState = {
  boostMult: 1,
  f1Registered: 0,
  f1Active7: 0,
  f2Registered: 0,
  f2Active7: 0
};

const initialState: EarnState = {
  status: "idle",
  taskCap: EARN_TASK_CAP,
  categories: [],
  tasks: [],
  channels: [],
  claimedTaskIds: [],
  verifiedTaskIds: [],
  claimedKick: 0,
  referral: DEFAULT_REFERRAL_STATE,
  isBoosting: false,
  errorMessage: null
};

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return "Earn service unavailable.";
}

function normalizeReferral(referral: ReferralState): ReferralState {
  return {
    boostMult: Math.max(1, Math.floor(Number(referral.boostMult) || 1)),
    f1Registered: Math.max(0, Math.floor(Number(referral.f1Registered) || 0)),
    f1Active7: Math.max(0, Math.floor(Number(referral.f1Active7) || 0)),
    f2Registered: Math.max(0, Math.floor(Number(referral.f2Registered) || 0)),
    f2Active7: Math.max(0, Math.floor(Number(referral.f2Active7) || 0))
  };
}

function normalizeTask(task: EarnTask): EarnTask {
  const points = Math.max(0, Math.floor(Number(task.points) || 0));
  const tone = task.tone === "y" || task.tone === "b" || task.tone === "r" ? task.tone : "g";
  const channel =
    task.channel && typeof task.channel === "object"
      ? {
          id: String(task.channel.id || ""),
          name: String(task.channel.name || ""),
          platform: String(task.channel.platform || ""),
          url: String(task.channel.url || "#"),
          icon: String(task.channel.icon || "🔗"),
          isActive: task.channel.isActive !== false
        }
      : null;
  return {
    ...task,
    id: String(task.id),
    categoryId: String(task.categoryId || "daily"),
    icon: String(task.icon || "🎯"),
    name: String(task.name || "Task"),
    description: String(task.description || ""),
    points,
    actionLabel: String(task.actionLabel || "CLAIM"),
    tone,
    isActive: task.isActive !== false,
    requiresVerification: Boolean(task.requiresVerification),
    verificationHint: typeof task.verificationHint === "string" ? task.verificationHint : null,
    channel
  };
}

function normalizeCategory(category: EarnTaskCategory): EarnTaskCategory {
  const tone = category.tone === "y" || category.tone === "b" || category.tone === "r" ? category.tone : "g";
  return {
    id: String(category.id || "daily"),
    icon: String(category.icon || "🎯"),
    title: String(category.title || "Tasks"),
    totalLabel: String(category.totalLabel || "+0 KICK"),
    tone
  };
}

function normalizeChannel(channel: EarnChannelItem): EarnChannelItem {
  return {
    id: String(channel.id || ""),
    platform: String(channel.platform || "Channel"),
    name: String(channel.name || "Unnamed channel"),
    url: String(channel.url || "#"),
    icon: String(channel.icon || "🔗"),
    tasks: Math.max(0, Math.floor(Number(channel.tasks) || 0)),
    kick: Math.max(0, Math.floor(Number(channel.kick) || 0)),
    isActive: channel.isActive !== false
  };
}

function sanitizeTaskIdList(taskIds: string[], tasks: EarnTask[]): string[] {
  const allowed = new Set(tasks.map((task) => task.id));
  return taskIds.filter((taskId) => typeof taskId === "string" && allowed.has(taskId));
}

function createEarnStore() {
  const { subscribe, set, update } = writable<EarnState>(initialState);
  let initPromise: Promise<void> | null = null;

  async function init(sessionId: string | null, force = false): Promise<void> {
    if (initPromise && !force) return initPromise;

    const run = (async () => {
      update((state) => ({ ...state, status: "loading", errorMessage: null }));

      if (!sessionId) {
        try {
          const catalogPayload = await fetchEarnCatalog();
          const tasks = catalogPayload.tasks.map(normalizeTask);
          update((state) => ({
            ...state,
            status: "ready",
            categories: catalogPayload.categories.map(normalizeCategory),
            tasks,
            channels: (catalogPayload.channels ?? []).map(normalizeChannel),
            verifiedTaskIds: [],
            claimedTaskIds: sanitizeTaskIdList(state.claimedTaskIds, tasks),
            errorMessage: null
          }));
        } catch {
          update((state) => ({ ...state, status: "ready", errorMessage: null }));
        }
        return;
      }

      const [earnPayload, referralPayload, catalogPayload] = await Promise.all([
        fetchEarnState(sessionId),
        fetchReferralState(sessionId),
        fetchEarnCatalog()
      ]);

      sessionStore.sync({ economy: earnPayload.economy });
      const tasks = catalogPayload.tasks.map(normalizeTask);
      const claimedTaskIds = sanitizeTaskIdList(earnPayload.earn.claimedTaskIds, tasks);
      const verifiedTaskIds = sanitizeTaskIdList(earnPayload.earn.verifiedTaskIds ?? [], tasks);

      update((state) => ({
        ...state,
        status: "ready",
        taskCap: Math.max(0, Math.floor(Number(earnPayload.earn.taskCap) || EARN_TASK_CAP)),
        categories: catalogPayload.categories.map(normalizeCategory),
        tasks,
        channels: (catalogPayload.channels ?? []).map(normalizeChannel),
        claimedKick: Math.max(0, Math.floor(Number(earnPayload.earn.claimedKick) || 0)),
        claimedTaskIds,
        verifiedTaskIds,
        referral: normalizeReferral(referralPayload.referral),
        errorMessage: null
      }));
    })()
      .catch((error) => {
        update((state) => ({
          ...state,
          status: "error",
          errorMessage: toErrorMessage(error)
        }));
      })
      .finally(() => {
        initPromise = null;
      });

    initPromise = run;
    return run;
  }

  async function claimTask(sessionId: string | null, task: EarnTask): Promise<EarnClaimResult> {
    if (!sessionId) {
      return {
        taskId: task.id,
        appliedKick: 0,
        message: "Session chưa sẵn sàng."
      };
    }
    if (task.isActive === false) {
      return {
        taskId: task.id,
        appliedKick: 0,
        message: "Task is inactive."
      };
    }

    const snapshot = get({ subscribe });
    const isVerified = snapshot.verifiedTaskIds.includes(task.id);
    if (task.requiresVerification && !isVerified) {
      return {
        taskId: task.id,
        appliedKick: 0,
        message: "Verify task first."
      };
    }

    try {
      const payload = await claimEarnTask({
        sessionId,
        taskId: task.id,
        points: task.points
      });

      sessionStore.sync({ economy: payload.economy });

      update((state) => ({
        ...state,
        taskCap: Math.max(0, Math.floor(Number(payload.earn.taskCap) || state.taskCap)),
        claimedKick: Math.max(0, Math.floor(Number(payload.earn.claimedKick) || state.claimedKick)),
        claimedTaskIds: sanitizeTaskIdList(payload.earn.claimedTaskIds, state.tasks),
        verifiedTaskIds: sanitizeTaskIdList(payload.earn.verifiedTaskIds ?? [], state.tasks),
        errorMessage: null
      }));

      const message = payload.alreadyClaimed
        ? "Task already completed."
        : payload.appliedKick > 0
          ? `✅ ${task.name} completed (+${payload.appliedKick.toLocaleString("en-US")} KICK)`
          : "✅ Task completed, but task cap reached.";

      return {
        taskId: task.id,
        appliedKick: payload.appliedKick,
        message
      };
    } catch (error) {
      const message = toErrorMessage(error);
      update((state) => ({ ...state, errorMessage: message }));
      return {
        taskId: task.id,
        appliedKick: 0,
        message
      };
    }
  }

  async function verifyTask(sessionId: string | null, task: EarnTask, proof: string): Promise<EarnClaimResult> {
    if (!sessionId) {
      return {
        taskId: task.id,
        appliedKick: 0,
        message: "Session chưa sẵn sàng."
      };
    }
    if (task.isActive === false) {
      return {
        taskId: task.id,
        appliedKick: 0,
        message: "Task is inactive."
      };
    }
    if (!task.requiresVerification) {
      return {
        taskId: task.id,
        appliedKick: 0,
        message: "Task does not require verification."
      };
    }

    try {
      const payload = await verifyEarnTask({
        sessionId,
        taskId: task.id,
        proof
      });

      sessionStore.sync({ economy: payload.economy });
      update((state) => ({
        ...state,
        taskCap: Math.max(0, Math.floor(Number(payload.earn.taskCap) || state.taskCap)),
        claimedKick: Math.max(0, Math.floor(Number(payload.earn.claimedKick) || state.claimedKick)),
        claimedTaskIds: sanitizeTaskIdList(payload.earn.claimedTaskIds, state.tasks),
        verifiedTaskIds: sanitizeTaskIdList(payload.earn.verifiedTaskIds ?? [], state.tasks),
        errorMessage: null
      }));

      return {
        taskId: task.id,
        appliedKick: 0,
        message: payload.message || "Task verified."
      };
    } catch (error) {
      const message = toErrorMessage(error);
      update((state) => ({ ...state, errorMessage: message }));
      return {
        taskId: task.id,
        appliedKick: 0,
        message
      };
    }
  }

  async function boostReferral(sessionId: string | null, mult = 3): Promise<void> {
    if (!sessionId) return;

    update((state) => ({ ...state, isBoosting: true, errorMessage: null }));

    try {
      const payload = await activateReferralBoost({ sessionId, mult });
      const referral = normalizeReferral(payload.referral);

      update((state) => ({
        ...state,
        referral,
        isBoosting: false,
        errorMessage: null
      }));

      const session = get(sessionStore);
      sessionStore.sync({
        boosts: {
          quizBoostMult: session.quizBoostMult,
          refBoostMult: referral.boostMult
        }
      });
    } catch (error) {
      update((state) => ({
        ...state,
        isBoosting: false,
        errorMessage: toErrorMessage(error)
      }));
    }
  }

  return {
    subscribe,
    init,
    claimTask,
    verifyTask,
    boostReferral,
    reset: () => set(initialState)
  };
}

export const earnStore = createEarnStore();
