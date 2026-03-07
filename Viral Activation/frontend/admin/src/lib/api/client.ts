export type AdminRole = "owner" | "admin" | "moderator" | "support" | "analyst";
export type UserStatus = "active" | "banned" | "vip";
export type UserTier = "rookie" | "starter" | "pro" | "champion" | "master" | "legend";

export interface Profile {
  id: string;
  telegramId: string;
  username: string;
  role: AdminRole;
}

export interface LoginResponse {
  pendingToken?: string;
  requiresTotp: boolean;
  accessToken?: string;
  refreshToken?: string;
  profile?: Profile;
}

export const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8787";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers ?? {});
  const hasBody = init?.body !== undefined && init?.body !== null;
  const isFormData = typeof FormData !== "undefined" && init?.body instanceof FormData;
  if (hasBody && !isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...init
    ,
    headers
  });
  if (!res.ok) {
    const text = await res.text();
    let message = text || `HTTP ${res.status}`;
    try {
      const parsed = JSON.parse(text) as { message?: unknown };
      if (typeof parsed.message === "string" && parsed.message.trim().length > 0) {
        message = parsed.message;
      }
    } catch {
      // Non-JSON error response
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

async function requestBlob(path: string, init?: RequestInit): Promise<Blob> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...init
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.blob();
}

function authedHeaders(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

export async function loginWithTelegram(payload: {
  id: string;
  username: string;
  firstName?: string;
  lastName?: string;
  authDate: number;
  hash: string;
}): Promise<LoginResponse> {
  return request<LoginResponse>("/api/v1/auth/telegram/login", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function verifyTotp(payload: {
  pendingToken: string;
  code: string;
}): Promise<LoginResponse> {
  return request<LoginResponse>("/api/v1/auth/totp/verify", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function getDashboard(accessToken: string): Promise<{
  totalUsers: number;
  onlineUsers: number;
  totalKick: number;
  pendingReviews: number;
}> {
  return request("/api/v1/dashboard/metrics", {
    headers: authedHeaders(accessToken)
  });
}

export async function refreshSession(payload: { refreshToken: string }): Promise<{
  accessToken: string;
  refreshToken: string;
  profile: Profile;
}> {
  return request("/api/v1/auth/refresh", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function logoutSession(payload: { refreshToken: string }): Promise<{ ok: boolean }> {
  return request("/api/v1/auth/logout", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export interface AppUser {
  id: string;
  telegramId: string | null;
  username: string | null;
  nationCode: string;
  status: UserStatus;
  kick: number;
  tier: UserTier;
  directReferrals: number;
  indirectReferrals: number;
  mysteryTickets?: number;
  createdAt: string;
}

export interface UserTierStatItem {
  tier: UserTier;
  minKick: number;
  maxKick: number | null;
  totalUsers: number;
  activeUsers: number;
  vipUsers: number;
  bannedUsers: number;
  totalKick: number;
}

export async function listUsers(
  accessToken: string,
  query: { q?: string; status?: UserStatus; tier?: UserTier; limit?: number; offset?: number } = {}
): Promise<{ items: AppUser[]; total: number; tierStats: UserTierStatItem[] }> {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.status) params.set("status", query.status);
  if (query.tier) params.set("tier", query.tier);
  if (query.limit) params.set("limit", String(query.limit));
  if (query.offset) params.set("offset", String(query.offset));
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  return request(`/api/v1/users${suffix}`, {
    headers: authedHeaders(accessToken)
  });
}

export interface KickLeaderboardItem {
  rank: number;
  userId: string;
  telegramId: string | null;
  username: string | null;
  nationCode: string;
  kick: number;
  status: UserStatus;
}

export interface ReferrerLeaderboardItem {
  rank: number;
  inviterUserId: string;
  telegramId: string | null;
  username: string;
  nationCode: string;
  inviterKick: number;
  inviterStatus: UserStatus;
  totalReferrals: number;
  f1Referrals: number;
  active7dCount: number;
  totalKickAwarded: number;
  flaggedCount: number;
}

export interface NationLeaderboardItem {
  rank: number;
  nationCode: string;
  totalKick: number;
  totalUsers: number;
  eligibleUsers: number;
  warPoints: number;
  topUsername: string;
  topKick: number;
}

export async function listKickLeaderboard(
  accessToken: string,
  query: { limit?: number; offset?: number } = {}
): Promise<{ items: KickLeaderboardItem[]; total: number }> {
  const params = new URLSearchParams();
  if (query.limit) params.set("limit", String(query.limit));
  if (query.offset) params.set("offset", String(query.offset));
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  return request(`/api/v1/leaderboard/kick${suffix}`, {
    headers: authedHeaders(accessToken)
  });
}

export async function listReferrersLeaderboard(
  accessToken: string,
  query: { limit?: number; offset?: number } = {}
): Promise<{ items: ReferrerLeaderboardItem[]; total: number }> {
  const params = new URLSearchParams();
  if (query.limit) params.set("limit", String(query.limit));
  if (query.offset) params.set("offset", String(query.offset));
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  return request(`/api/v1/leaderboard/referrers${suffix}`, {
    headers: authedHeaders(accessToken)
  });
}

export async function listNationsLeaderboard(
  accessToken: string,
  query: { limit?: number; offset?: number } = {}
): Promise<{ items: NationLeaderboardItem[]; total: number }> {
  const params = new URLSearchParams();
  if (query.limit) params.set("limit", String(query.limit));
  if (query.offset) params.set("offset", String(query.offset));
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  return request(`/api/v1/leaderboard/nations${suffix}`, {
    headers: authedHeaders(accessToken)
  });
}

export async function updateUserStatus(
  accessToken: string,
  payload: { id: string; status: UserStatus }
): Promise<AppUser> {
  return request(`/api/v1/users/${payload.id}/status`, {
    method: "PATCH",
    headers: authedHeaders(accessToken),
    body: JSON.stringify({ status: payload.status })
  });
}

export interface KickLedgerItem {
  id: string;
  userId: string;
  delta: number;
  reason: string;
  source: string;
  actorId: string | null;
  createdAt: string;
  user: AppUser;
  actor: Profile | null;
}

export async function listKickLedger(
  accessToken: string,
  query: { userId?: string; limit?: number; offset?: number } = {}
): Promise<{ items: KickLedgerItem[]; total: number }> {
  const params = new URLSearchParams();
  if (query.userId) params.set("userId", query.userId);
  if (query.limit) params.set("limit", String(query.limit));
  if (query.offset) params.set("offset", String(query.offset));
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  return request(`/api/v1/kick-ledger${suffix}`, {
    headers: authedHeaders(accessToken)
  });
}

export async function adjustKick(
  accessToken: string,
  payload: { userId: string; delta: number; reason: string; source?: string }
): Promise<unknown> {
  return request("/api/v1/kick-ledger/adjust", {
    method: "POST",
    headers: authedHeaders(accessToken),
    body: JSON.stringify(payload)
  });
}

export interface SpinGrantResponse {
  ok: boolean;
  userId: string;
  username: string | null;
  requested: number;
  granted: number;
  reason: string;
  source: string;
  spin: {
    day: string;
    used: number;
    invite: number;
    share: number;
    tickets: number;
    cap: number;
    left: number;
  };
}

export async function grantSpins(
  accessToken: string,
  payload: { userId: string; amount: number; reason: string; source?: string }
): Promise<SpinGrantResponse> {
  return request("/api/v1/spin/grant", {
    method: "POST",
    headers: authedHeaders(accessToken),
    body: JSON.stringify(payload)
  });
}

export interface FeatureConfig {
  key: string;
  value: Record<string, unknown>;
  updatedBy?: string | null;
  updatedAt?: string;
}

export async function getConfig(
  accessToken: string,
  key: "spin" | "penalty" | "missions" | "settings" | "api" | "rules" | "wc26token"
) {
  return request<FeatureConfig>(`/api/v1/config/${key}`, {
    headers: authedHeaders(accessToken)
  });
}

export async function updateConfig(
  accessToken: string,
  key: "spin" | "penalty" | "missions" | "settings" | "api" | "rules" | "wc26token",
  value: Record<string, unknown>
) {
  return request<FeatureConfig>(`/api/v1/config/${key}`, {
    method: "PUT",
    headers: authedHeaders(accessToken),
    body: JSON.stringify({ value })
  });
}

export interface Announcement {
  id: string;
  title: string;
  message: string;
  target: string;
  createdById: string | null;
  createdAt: string;
  publishedAt: string | null;
}

export async function listAnnouncements(accessToken: string): Promise<Announcement[]> {
  return request("/api/v1/announcements", {
    headers: authedHeaders(accessToken)
  });
}

export async function createAnnouncement(
  accessToken: string,
  payload: { title: string; message: string; target: string; publishNow?: boolean }
): Promise<Announcement> {
  return request("/api/v1/announcements", {
    method: "POST",
    headers: authedHeaders(accessToken),
    body: JSON.stringify(payload)
  });
}

export async function updateAnnouncement(
  accessToken: string,
  payload: { id: string; title?: string; message?: string; target?: string; publishNow?: boolean }
): Promise<Announcement> {
  return request(`/api/v1/announcements/${payload.id}`, {
    method: "PUT",
    headers: authedHeaders(accessToken),
    body: JSON.stringify({
      title: payload.title,
      message: payload.message,
      target: payload.target,
      publishNow: payload.publishNow
    })
  });
}

export async function deleteAnnouncement(
  accessToken: string,
  id: string
): Promise<{ ok: boolean; id: string }> {
  return request(`/api/v1/announcements/${id}`, {
    method: "DELETE",
    headers: authedHeaders(accessToken)
  });
}

export interface BoardMember {
  id: string;
  telegramId: string;
  username: string;
  displayName: string;
  role: AdminRole;
  requiresTotp: boolean;
  totpSecret: string | null;
  isActive: boolean;
  createdAt: string;
}

export async function listBoardMembers(accessToken: string): Promise<{ items: BoardMember[] }> {
  return request("/api/v1/board-members", {
    headers: authedHeaders(accessToken)
  });
}

export async function upsertBoardMember(
  accessToken: string,
  payload: {
    telegramId: string;
    username: string;
    displayName: string;
    role: AdminRole;
    requiresTotp?: boolean;
    totpSecret?: string;
    isActive?: boolean;
  }
): Promise<BoardMember> {
  return request("/api/v1/board-members/upsert", {
    method: "POST",
    headers: authedHeaders(accessToken),
    body: JSON.stringify(payload)
  });
}

export interface PiqueConversation {
  id: string;
  appUserId: string | null;
  telegramId: string | null;
  username: string | null;
  prompt: string;
  reply: string;
  sentimentFlag: string | null;
  createdAt: string;
}

export async function listPiqueConversations(
  accessToken: string,
  query: {
    telegramId?: string;
    username?: string;
    keyword?: string;
    sentiment?: string;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
  } = {}
): Promise<{ items: PiqueConversation[]; total: number }> {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") {
      params.set(k, String(v));
    }
  });
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  return request(`/api/v1/pique/conversations${suffix}`, {
    headers: authedHeaders(accessToken)
  });
}

export interface AuditLogItem {
  id: string;
  actorId: string | null;
  actorRole: AdminRole | null;
  action: string;
  module: string;
  targetType: string | null;
  targetId: string | null;
  before: unknown;
  after: unknown;
  ipAddress: string | null;
  createdAt: string;
  actor:
    | {
        id: string;
        username: string;
        displayName: string;
        role: AdminRole;
      }
    | null;
}

export async function listAuditLogs(
  accessToken: string,
  query: {
    module?: string;
    action?: string;
    actorId?: string;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
  } = {}
): Promise<{ items: AuditLogItem[]; total: number }> {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") {
      params.set(k, String(v));
    }
  });
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  return request(`/api/v1/audit-logs${suffix}`, {
    headers: authedHeaders(accessToken)
  });
}

export interface SystemHealthSnapshot {
  at: string;
  uptimeSec: number;
  services: {
    api: { status: string; latencyMs: number };
    database: { status: string; latencyMs: number };
    sessionStore: { mode: "memory" | "redis"; status: string; latencyMs: number };
  };
}

export interface SystemQueueSnapshot {
  at: string;
  pendingCompliance: number;
  pendingAnnouncements: number;
  highRiskPique: number;
  bannedUsers: number;
}

export async function getSystemHealth(accessToken: string): Promise<SystemHealthSnapshot> {
  return request("/api/v1/system/health", {
    headers: authedHeaders(accessToken)
  });
}

export async function getSystemQueue(accessToken: string): Promise<SystemQueueSnapshot> {
  return request("/api/v1/system/queue", {
    headers: authedHeaders(accessToken)
  });
}

export async function installFreeNewsApiPack(
  accessToken: string,
  payload: { setActive?: boolean; activeProvider?: string } = {}
): Promise<{
  ok: boolean;
  profiles: Array<{ id: string; name: string; provider: string; enabled: boolean }>;
  activeProfileId: string | null;
}> {
  return request("/api/v1/system/news/free-pack/install", {
    method: "POST",
    headers: authedHeaders(accessToken),
    body: JSON.stringify(payload)
  });
}

export async function downloadKickLedgerCsv(
  accessToken: string,
  query: { userId?: string; source?: string; from?: string; to?: string; limit?: number } = {}
): Promise<Blob> {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") {
      params.set(k, String(v));
    }
  });
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  return requestBlob(`/api/v1/reports/kick-ledger/export.csv${suffix}`, {
    headers: authedHeaders(accessToken)
  });
}

export async function downloadAuditLogsCsv(
  accessToken: string,
  query: {
    module?: string;
    action?: string;
    actorId?: string;
    from?: string;
    to?: string;
    limit?: number;
  } = {}
): Promise<Blob> {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") {
      params.set(k, String(v));
    }
  });
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  return requestBlob(`/api/v1/reports/audit-logs/export.csv${suffix}`, {
    headers: authedHeaders(accessToken)
  });
}

export type FeedSnapshotPayload = {
  at: string;
  metrics: {
    totalUsers: number;
    onlineUsers: number;
    totalKick: number;
    pendingReviews: number;
  };
  activities: Array<{
    id: string;
    action: string;
    module: string;
    at: string;
    actor: string;
    role: string;
  }>;
};

export function openSseStream(
  path: "/api/v1/realtime/feed" | "/api/v1/realtime/health" | "/api/v1/realtime/queue",
  _accessToken: string
): EventSource {
  const es = new EventSource(`${API_BASE}${path}`, { withCredentials: true });
  return es;
}

export interface ReferralsMetrics {
  totalRefs: number;
  activeChains: number;
  avgBoost: number;
  flagged: number;
}

export interface ReferralChain {
  inviterUserId: string;
  inviterUsername: string;
  f1Count: number;
  f2Count: number;
  active7dCount: number;
  totalKickAwarded: number;
  flaggedCount: number;
}

export interface ReferralFlaggedItem {
  id: string;
  inviterUserId: string;
  invitedUserId: string | null;
  level: number;
  status: string;
  season: string;
  kickAward: number;
  riskScore: number;
  createdAt: string;
  inviter: AppUser;
  invited: AppUser | null;
}

export interface ReferralConfig {
  f1Register: number;
  f1Active7d: number;
  f2Register: number;
  f2Active7d: number;
  maxF1PerSeason: number;
}

export async function getReferralsMetrics(accessToken: string): Promise<ReferralsMetrics> {
  return request("/api/v1/referrals/metrics", {
    headers: authedHeaders(accessToken)
  });
}

export async function listReferralChains(
  accessToken: string,
  query: { limit?: number; offset?: number } = {}
): Promise<{ items: ReferralChain[]; total: number }> {
  const params = new URLSearchParams();
  if (query.limit) params.set("limit", String(query.limit));
  if (query.offset) params.set("offset", String(query.offset));
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  return request(`/api/v1/referrals/chains${suffix}`, {
    headers: authedHeaders(accessToken)
  });
}

export async function listReferralFlagged(
  accessToken: string,
  query: { limit?: number; offset?: number } = {}
): Promise<{ items: ReferralFlaggedItem[]; total: number }> {
  const params = new URLSearchParams();
  if (query.limit) params.set("limit", String(query.limit));
  if (query.offset) params.set("offset", String(query.offset));
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  return request(`/api/v1/referrals/flagged${suffix}`, {
    headers: authedHeaders(accessToken)
  });
}

export async function getReferralsConfig(accessToken: string): Promise<{ key: string; value: ReferralConfig }> {
  return request("/api/v1/referrals/config", {
    headers: authedHeaders(accessToken)
  });
}

export async function updateReferralsConfig(
  accessToken: string,
  value: ReferralConfig
): Promise<{ key: string; value: ReferralConfig }> {
  return request("/api/v1/referrals/config", {
    method: "PUT",
    headers: authedHeaders(accessToken),
    body: JSON.stringify(value)
  });
}

export interface MatchFixture {
  id: string;
  groupCode: string;
  homeNation: string;
  awayNation: string;
  stadium: string;
  city: string | null;
  kickoffAt: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  highlight: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MatchUpsertPayload {
  id?: string;
  groupCode: string;
  homeNation: string;
  awayNation: string;
  stadium: string;
  city?: string;
  kickoffAt: string;
  status?: string;
  homeScore?: number;
  awayScore?: number;
  highlight?: string;
}

export interface MatchStatusPayload {
  id: string;
  status: string;
  homeScore?: number;
  awayScore?: number;
  highlight?: string;
}

export async function listMatches(
  accessToken: string,
  query: { groupCode?: string; status?: string; from?: string; to?: string; limit?: number; offset?: number } = {}
): Promise<{ items: MatchFixture[]; total: number }> {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  });
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  return request(`/api/v1/matches${suffix}`, {
    headers: authedHeaders(accessToken)
  });
}

export async function upsertMatch(accessToken: string, payload: MatchUpsertPayload): Promise<MatchFixture> {
  return request("/api/v1/matches/upsert", {
    method: "POST",
    headers: authedHeaders(accessToken),
    body: JSON.stringify(payload)
  });
}

export async function updateMatchStatus(accessToken: string, payload: MatchStatusPayload): Promise<MatchFixture> {
  return request(`/api/v1/matches/${payload.id}/status`, {
    method: "PATCH",
    headers: authedHeaders(accessToken),
    body: JSON.stringify({
      status: payload.status,
      homeScore: payload.homeScore,
      awayScore: payload.awayScore,
      highlight: payload.highlight
    })
  });
}

export interface MissionItem {
  id: string;
  code: string;
  name: string;
  phase: string;
  category: string;
  channelId: string | null;
  channel:
    | {
        id: string;
        platform: string;
        name: string;
        url: string;
        icon: string | null;
        isActive: boolean;
      }
    | null;
  rewardKick: number;
  isActive: boolean;
  capPerDay: number | null;
  stats: {
    completions: number;
    awardedKick: number;
  };
}

export interface MissionUpsertPayload {
  id?: string;
  code: string;
  name: string;
  phase?: string;
  category?: string;
  channelId?: string | null;
  rewardKick: number;
  capPerDay?: number;
  isActive?: boolean;
}

export interface MissionMutationResult {
  id: string;
  code: string;
  name: string;
  phase: string;
  category: string;
  channelId: string | null;
  channel:
    | {
        id: string;
        platform: string;
        name: string;
        url: string;
        icon: string | null;
        isActive: boolean;
      }
    | null;
  rewardKick: number;
  capPerDay: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export async function listMissions(
  accessToken: string,
  query: { active?: boolean; category?: string; limit?: number; offset?: number } = {}
): Promise<{ items: MissionItem[]; total: number }> {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  });
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  return request(`/api/v1/missions${suffix}`, {
    headers: authedHeaders(accessToken)
  });
}

export async function upsertMission(
  accessToken: string,
  payload: MissionUpsertPayload
): Promise<MissionMutationResult> {
  return request("/api/v1/missions/upsert", {
    method: "POST",
    headers: authedHeaders(accessToken),
    body: JSON.stringify(payload)
  });
}

export async function toggleMission(
  accessToken: string,
  payload: { id: string; isActive: boolean }
): Promise<MissionMutationResult> {
  return request(`/api/v1/missions/${payload.id}/toggle`, {
    method: "PATCH",
    headers: authedHeaders(accessToken),
    body: JSON.stringify({ isActive: payload.isActive })
  });
}

export interface SocialChannelItem {
  id: string;
  platform: string;
  name: string;
  url: string;
  icon: string | null;
  tasks: number;
  kick: number;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SocialChannelUpsertPayload {
  id?: string;
  platform: string;
  name: string;
  url: string;
  icon?: string;
  tasks: number;
  kick: number;
  sortOrder: number;
  isActive?: boolean;
}

export async function listSocialChannels(
  accessToken: string,
  query: { active?: boolean; platform?: string; limit?: number; offset?: number } = {}
): Promise<{ items: SocialChannelItem[]; total: number }> {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  });
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  return request(`/api/v1/social/channels${suffix}`, {
    headers: authedHeaders(accessToken)
  });
}

export async function upsertSocialChannel(
  accessToken: string,
  payload: SocialChannelUpsertPayload
): Promise<SocialChannelItem> {
  return request("/api/v1/social/channels/upsert", {
    method: "POST",
    headers: authedHeaders(accessToken),
    body: JSON.stringify(payload)
  });
}

export async function toggleSocialChannel(
  accessToken: string,
  payload: { id: string; isActive: boolean }
): Promise<SocialChannelItem> {
  return request(`/api/v1/social/channels/${payload.id}/toggle`, {
    method: "PATCH",
    headers: authedHeaders(accessToken),
    body: JSON.stringify({ isActive: payload.isActive })
  });
}

export async function deleteSocialChannel(accessToken: string, id: string): Promise<{ ok: boolean }> {
  return request(`/api/v1/social/channels/${id}`, {
    method: "DELETE",
    headers: authedHeaders(accessToken)
  });
}

export type MysteryBoxTier = UserTier;

export interface MysteryBoxAllocationItem {
  tier: MysteryBoxTier;
  totalBoxes: number;
  minKick: number;
  maxPerUser: number;
  isActive: boolean;
}

export interface MysteryBoxAllocationConfig {
  allocations: MysteryBoxAllocationItem[];
  requireActiveDays: number;
  requireSybilPass: boolean;
  snapshotAt: string | null;
}

export interface MysteryBoxTicketUser extends AppUser {
  mysteryTickets: number;
  eligibleTier: MysteryBoxTier | null;
}

export async function getMysteryBoxAllocations(accessToken: string): Promise<{
  key: string;
  value: MysteryBoxAllocationConfig;
  updatedAt: string | null;
  updatedBy: string | null;
}> {
  return request("/api/v1/mystery-box/allocations", {
    headers: authedHeaders(accessToken)
  });
}

export async function updateMysteryBoxAllocations(
  accessToken: string,
  payload: MysteryBoxAllocationConfig
): Promise<{ key: string; value: MysteryBoxAllocationConfig; updatedAt: string; updatedBy: string | null }> {
  return request("/api/v1/mystery-box/allocations", {
    method: "PUT",
    headers: authedHeaders(accessToken),
    body: JSON.stringify(payload)
  });
}

export async function listMysteryBoxTicketUsers(
  accessToken: string,
  query: { q?: string; tier?: MysteryBoxTier; limit?: number; offset?: number } = {}
): Promise<{ items: MysteryBoxTicketUser[]; total: number; totalTickets: number }> {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  });
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  return request(`/api/v1/mystery-box/tickets${suffix}`, {
    headers: authedHeaders(accessToken)
  });
}

export async function adjustMysteryBoxTickets(
  accessToken: string,
  payload: { userId: string; delta: number; reason: string }
): Promise<{ ok: boolean; userId: string; mysteryTickets: number }> {
  return request("/api/v1/mystery-box/tickets/adjust", {
    method: "POST",
    headers: authedHeaders(accessToken),
    body: JSON.stringify(payload)
  });
}
