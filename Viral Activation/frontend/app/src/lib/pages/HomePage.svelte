<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import type { AppPage, InfoTab } from "../stores/ui.store";
  import { fetchLatestAnnouncement } from "../modules/announcements/api";
  import type { AppAnnouncementItem } from "../modules/announcements/types";
  import { HOME_HERO_SNAPSHOT, HOME_TOP_NATIONS } from "../modules/home/data";
  import { daysUntilKickoff, formatFans } from "../modules/home/utils";
  import { fetchReferralState } from "../modules/referral/api";
  import { resolveTierPolicyByKick, TIER_POLICY } from "../modules/tier/policy";
  import { hotSignalsStore } from "../stores/hot-signals.store";
  import { languageStore } from "../stores/language.store";
  import { sessionStore } from "../stores/session.store";
  import { spinStore } from "../stores/spin.store";
  import { updatedLabel } from "../modules/news/utils";
  import HotSignalsCompact from "../components/HotSignalsCompact.svelte";

  export let onNavigate: (page: AppPage) => void = () => {};
  export let onOpenInfoTab: (tab: InfoTab) => void = () => {};

  let countdownDays = daysUntilKickoff();
  let ticker: ReturnType<typeof setInterval> | null = null;
  let directReferralF1 = 0;
  let indirectReferralF2 = 0;
  let syncedReferralSessionId = "";
  let referralRequestId = 0;
  let latestAnnouncement: AppAnnouncementItem | null = null;
  let announcementPopupOpen = false;
  let announcementDontShowAgain = false;
  let announcementRequestId = 0;
  let telegramHandle = "@unknown";
  let telegramHandleResolveTimer: ReturnType<typeof setTimeout> | null = null;
  let telegramHandleResolveAttempts = 0;

  const ANNOUNCEMENT_DISMISS_PREFIX = "wc26_ann_dismiss_v1_";
  const TELEGRAM_HANDLE_RESOLVE_MAX_ATTEMPTS = 20;
  const TELEGRAM_HANDLE_RESOLVE_INTERVAL_MS = 150;

  function announcementDismissKey(id: string): string {
    return `${ANNOUNCEMENT_DISMISS_PREFIX}${id}`;
  }

  function isAnnouncementDismissed(id: string): boolean {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(announcementDismissKey(id)) === "1";
  }

  function openAnnouncementPopup(): void {
    announcementDontShowAgain = false;
    announcementPopupOpen = true;
  }

  function dismissAnnouncementPopup(): void {
    if (latestAnnouncement && announcementDontShowAgain && typeof window !== "undefined") {
      window.localStorage.setItem(announcementDismissKey(latestAnnouncement.id), "1");
    }
    announcementDontShowAgain = false;
    announcementPopupOpen = false;
  }

  function formatAnnouncementPublishedAt(value: string | null): string {
    if (!value) return "-";
    const ms = Date.parse(value);
    if (!Number.isFinite(ms)) return "-";
    return new Date(ms).toLocaleString();
  }

  function resolveTelegramHandle(): string {
    if (typeof window === "undefined") return "@unknown";

    const parseHandleFromUser = (user: unknown): string | null => {
      const profile = typeof user === "object" && user ? (user as { id?: unknown; username?: unknown }) : null;
      const rawUsername = String(profile?.username ?? "").trim().replace(/^@+/, "");
      if (rawUsername.length > 0) return `@${rawUsername}`;
      const rawId = String(profile?.id ?? "").trim();
      if (rawId.length > 0) return `@${rawId}`;
      return null;
    };

    const telegram = (window as typeof window & {
      Telegram?: { WebApp?: { initDataUnsafe?: { user?: { id?: unknown; username?: unknown } } } };
    }).Telegram;
    const directHandle = parseHandleFromUser(telegram?.WebApp?.initDataUnsafe?.user);
    if (directHandle) return directHandle;

    try {
      const url = new URL(window.location.href);
      const hashParams = (() => {
        const rawHash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
        if (!rawHash) return new URLSearchParams();
        const qIndex = rawHash.indexOf("?");
        return qIndex >= 0 ? new URLSearchParams(rawHash.slice(qIndex + 1)) : new URLSearchParams(rawHash);
      })();
      const tgWebAppDataRaw = url.searchParams.get("tgWebAppData") ?? hashParams.get("tgWebAppData") ?? "";
      if (tgWebAppDataRaw.trim().length > 0) {
        const tgParams = new URLSearchParams(tgWebAppDataRaw);
        const userRaw = tgParams.get("user");
        if (userRaw) {
          const parsed = JSON.parse(userRaw);
          const fromUrlHandle = parseHandleFromUser(parsed);
          if (fromUrlHandle) return fromUrlHandle;
        }
      }
    } catch {
      // Ignore URL parsing errors and keep fallback.
    }

    return "@unknown";
  }

  function scheduleTelegramHandleResolve(): void {
    const nextHandle = resolveTelegramHandle();
    telegramHandle = nextHandle;
    if (nextHandle !== "@unknown") return;
    if (telegramHandleResolveAttempts >= TELEGRAM_HANDLE_RESOLVE_MAX_ATTEMPTS) return;
    telegramHandleResolveAttempts += 1;
    telegramHandleResolveTimer = setTimeout(scheduleTelegramHandleResolve, TELEGRAM_HANDLE_RESOLVE_INTERVAL_MS);
  }

  onMount(() => {
    telegramHandleResolveAttempts = 0;
    scheduleTelegramHandleResolve();
    ticker = setInterval(() => {
      countdownDays = daysUntilKickoff();
    }, 60_000);

    const requestId = ++announcementRequestId;
    void (async () => {
      try {
        const payload = await fetchLatestAnnouncement();
        if (requestId !== announcementRequestId) return;
        latestAnnouncement = payload.item;
        if (latestAnnouncement && !isAnnouncementDismissed(latestAnnouncement.id)) {
          openAnnouncementPopup();
        }
      } catch {
        // Ignore transient announcement fetch errors on home page.
      }
    })();

    void hotSignalsStore.refresh(5, true, $languageStore.current);
  });

  onDestroy(() => {
    if (ticker) clearInterval(ticker);
    if (telegramHandleResolveTimer) clearTimeout(telegramHandleResolveTimer);
  });

  $: hotSignals = $hotSignalsStore.items.slice(0, 5);
  $: homeHotUpdated = updatedLabel($hotSignalsStore.lastUpdatedAt);
  $: void hotSignalsStore.refresh(5, false, $languageStore.current);
  $: spinLeft = $spinStore.spin.left;
  $: sessionId = $sessionStore.sessionId;
  $: totalKickEarned = Math.max(0, Math.floor(Number($sessionStore.kick) || 0));
  $: currentTier = resolveTierPolicyByKick(totalKickEarned) ?? TIER_POLICY[0];
  $: nextTier = TIER_POLICY.find((tier) => tier.minKick > totalKickEarned) ?? null;
  $: currentTierLabel = currentTier?.label ?? "Rookie";
  $: nextTierLabel = nextTier ? nextTier.label : "Max Tier Reached";
  $: nextTierKickRequired = nextTier ? nextTier.minKick : (currentTier?.minKick ?? totalKickEarned);
  $: kickProgressValue = nextTier ? Math.min(totalKickEarned, nextTierKickRequired) : nextTierKickRequired;
  $: kickProgressCompact = nextTier
    ? `${kickProgressValue.toLocaleString("en-US")}/${nextTierKickRequired.toLocaleString("en-US")}`
    : "MAX";
  $: risingBoxTicketCount = Math.max(0, Math.floor(Number($sessionStore.spin.tickets) || 0));
  $: eliteBoxTicketCount = "-";
  $: legacyBoxTicketCount = "-";
  $: homeSpinBadge = spinLeft > 0 ? "FREE SPIN READY" : "SPINS USED";
  $: homeSpinSub = spinLeft > 0
    ? `${spinLeft} spin${spinLeft > 1 ? "s" : ""} left today · Win 50-200 KICK`
    : "All spins used today";
  $: homeSpinAction = spinLeft > 0 ? "⚡ SPIN NOW" : "⏰ OPEN SPIN";

  $: if (!sessionId) {
    syncedReferralSessionId = "";
    directReferralF1 = 0;
    indirectReferralF2 = 0;
  }

  $: if (sessionId && sessionId !== syncedReferralSessionId) {
    syncedReferralSessionId = sessionId;
    const currentRequestId = ++referralRequestId;
    void (async () => {
      try {
        const payload = await fetchReferralState(sessionId);
        if (currentRequestId !== referralRequestId) return;
        directReferralF1 = Math.max(0, Math.floor(Number(payload.referral.f1Registered) || 0));
        indirectReferralF2 = Math.max(0, Math.floor(Number(payload.referral.f2Registered) || 0));
      } catch {
        // Ignore transient referral API errors on home widget.
      }
    })();
  }
</script>

<div id="page-home" class="pg on">
  <div class="card acc-r home-hero-banner" id="home-hero-banner">
    <img src="/assets/wc26-logo.png" alt="WC26 watermark" class="home-watermark" />
    <div class="home-h2">🔥 World Cup Countdown</div>
    <div class="home-countdown">{countdownDays} days until Kickoff</div>
    <div class="home-war-live">⚔️ {HOME_HERO_SNAPSHOT.warLive}</div>
    <div class="home-war-delta">{HOME_HERO_SNAPSHOT.warDelta} ↑</div>
    <div class="home-fans">👥 {formatFans(HOME_HERO_SNAPSHOT.liveFans)} fans playing now</div>
  </div>

  {#if latestAnnouncement}
    <div class="card acc-y home-ann-banner">
      <div class="home-ann-row">
        <div class="home-ann-badge">📢 New Announcement</div>
        <button class="home-ann-open" type="button" on:click={openAnnouncementPopup}>Open Announcement</button>
      </div>
      <div class="home-ann-title">{latestAnnouncement.title}</div>
      <div class="home-ann-message">{latestAnnouncement.message}</div>
    </div>
  {/if}

  <button class="spin-cta" type="button" on:click={() => onNavigate("spin")}>
    <div class="spin-cta-inner">
      <div class="spin-mini-wheel" aria-hidden="true">
        <span class="spin-mini-pointer">▼</span>
        <svg class="spin-mini-svg" viewBox="0 0 68 68">
          <defs>
            <clipPath id="homeSpinWheelClip"><circle cx="34" cy="34" r="32" /></clipPath>
          </defs>
          <g clip-path="url(#homeSpinWheelClip)">
            <path d="M34,34 L34.0,2.0 A32,32 0 0,1 59.0,14.0 Z" fill="#1FBF6A" opacity="0.92" stroke="rgba(0,0,0,0.4)" stroke-width="0.8" />
            <path d="M34,34 L59.0,14.0 A32,32 0 0,1 65.2,41.1 Z" fill="#E5A020" opacity="0.92" stroke="rgba(0,0,0,0.4)" stroke-width="0.8" />
            <path d="M34,34 L65.2,41.1 A32,32 0 0,1 47.9,62.8 Z" fill="#1a1a2a" opacity="0.92" stroke="rgba(0,0,0,0.4)" stroke-width="0.8" />
            <path d="M34,34 L47.9,62.8 A32,32 0 0,1 20.1,62.8 Z" fill="#1E88E5" opacity="0.92" stroke="rgba(0,0,0,0.4)" stroke-width="0.8" />
            <path d="M34,34 L20.1,62.8 A32,32 0 0,1 2.8,41.1 Z" fill="#AB47BC" opacity="0.92" stroke="rgba(0,0,0,0.4)" stroke-width="0.8" />
            <path d="M34,34 L2.8,41.1 A32,32 0 0,1 9.0,14.0 Z" fill="#26C6DA" opacity="0.92" stroke="rgba(0,0,0,0.4)" stroke-width="0.8" />
            <path d="M34,34 L9.0,14.0 A32,32 0 0,1 34.0,2.0 Z" fill="#E5A020" opacity="0.92" stroke="rgba(0,0,0,0.4)" stroke-width="0.8" />
          </g>
          <circle cx="34" cy="34" r="32" fill="none" stroke="rgba(245,197,66,0.4)" stroke-width="1.5" />
        </svg>
        <div class="spin-mini-center"><div class="spin-mini-center-dot" /></div>
      </div>
      <div class="spin-cta-text">
        <div class="spin-cta-badge">{homeSpinBadge}</div>
        <div class="spin-cta-title">🎯 Daily Spin</div>
        <div class="spin-cta-sub">{homeSpinSub}</div>
        <div class="spin-cta-btn">{homeSpinAction}</div>
      </div>
    </div>
  </button>

  <div class="home-quick">
    <div class="card acc-g home-quick-card">
      <div class="home-quick-head">⚽ Penalty Challenge</div>
      <div class="home-quick-sub">3 Free Left</div>
      <div class="home-quick-reward">Win up to 2,000 KICK</div>
      <button class="btn b-g" type="button" on:click={() => onNavigate("penalty")}>PLAY PENALTY</button>
    </div>

    <div class="card acc-b home-quick-card">
      <div class="home-quick-head">❓ Daily Quiz</div>
      <div class="home-quick-sub">5/5 Questions Left</div>
      <div class="home-quick-reward">Earn up to 500 KICK</div>
      <button class="btn b-b" type="button" on:click={() => onNavigate("quiz")}>START QUIZ</button>
    </div>
  </div>

  <div class="card acc-b home-journey-card">
    <div class="home-journey-title-row">
      <div class="home-journey-title">🧭 Your Journey Stats</div>
      <div class="home-journey-telegram">{telegramHandle}</div>
    </div>
    <div class="home-journey-table">
      <div class="home-journey-row">
        <div class="home-journey-cell">
          <div class="home-journey-label">Current Tier</div>
          <div class="home-journey-value">{currentTierLabel}</div>
        </div>
        <div class="home-journey-cell">
          <div class="home-journey-topline">
            <span class="home-journey-label">Next Tier</span>
            <span class="home-journey-progress">{kickProgressCompact}</span>
          </div>
          <div class="home-journey-value">{nextTierLabel}</div>
        </div>
      </div>

      <div class="home-journey-row">
        <div class="home-journey-cell">
          <div class="home-journey-label">Direct Referrals (F1)</div>
          <div class="home-journey-value home-journey-mono">{directReferralF1.toLocaleString("en-US")}</div>
        </div>
        <div class="home-journey-cell">
          <div class="home-journey-label">Indirect Referrals (F2)</div>
          <div class="home-journey-value home-journey-mono">{indirectReferralF2.toLocaleString("en-US")}</div>
        </div>
      </div>

      <div class="home-journey-row">
        <div class="home-journey-cell">
          <div class="home-journey-label">Total KICK Earned</div>
          <div class="home-journey-value home-journey-kick">{totalKickEarned.toLocaleString("en-US")}</div>
        </div>
        <div class="home-journey-cell">
          <div class="home-journey-label">Rising Box Ticket</div>
          <div class="home-journey-value home-journey-mono">{risingBoxTicketCount.toLocaleString("en-US")}</div>
        </div>
      </div>

      <div class="home-journey-row">
        <div class="home-journey-cell">
          <div class="home-journey-label">Elite Box Ticket</div>
          <div class="home-journey-value home-journey-mono">{eliteBoxTicketCount}</div>
        </div>
        <div class="home-journey-cell">
          <div class="home-journey-label">Legacy Box Ticket</div>
          <div class="home-journey-value home-journey-mono">{legacyBoxTicketCount}</div>
        </div>
      </div>
    </div>
  </div>

  <button class="card acc-b home-match" type="button" on:click={() => onOpenInfoTab("match")}>
    <div class="home-match-copy">
      <strong>🏟️ World Cup 2026 Groups</strong>
      Match Schedule<br />Latest News
    </div>
    <div class="home-match-cta">OPEN MATCH HUB →</div>
  </button>

  <div class="card acc-g" id="home-nation-mini">
    <div class="home-nations-title">🏆 TOP NATIONS LIVE</div>
    <div>
      {#each HOME_TOP_NATIONS as nation}
        <div class="home-nation-row">
          <div class="home-nation-name">{nation.flag} {nation.name}</div>
          <div class="home-nation-points">{nation.points}</div>
          <div class={`home-nation-delta ${nation.isNegative ? "neg" : ""}`}>{nation.delta}</div>
        </div>
      {/each}
    </div>
    <div class="home-nation-divider" />
    <div class="home-your-nation">🇧🇷 Your Nation Rank: #132 | Contribution: +540 pts</div>
    <button class="btn b-g" type="button" on:click={() => onNavigate("wars")}>NATION WARS →</button>
  </div>

  <div class="card acc-b home-hot-signals">
    <div class="home-hot-head">
      <div class="home-hot-title">📡 HOT SIGNALS</div>
      <button class="home-hot-open" type="button" on:click={() => onOpenInfoTab("pulse")}>OPEN INFO →</button>
    </div>
    <div class="home-hot-sub">{homeHotUpdated}</div>
    <HotSignalsCompact items={hotSignals} />
  </div>

  {#if latestAnnouncement && announcementPopupOpen}
    <div class="home-ann-modal-backdrop">
      <div class="home-ann-modal" role="dialog" aria-modal="true" aria-label="Official Announcement">
        <div class="home-ann-modal-head">
          <div class="home-ann-modal-badge">📢 Official Announcement</div>
          <button class="home-ann-modal-close" type="button" on:click={dismissAnnouncementPopup}>Dismiss</button>
        </div>
        <div class="home-ann-modal-title">{latestAnnouncement.title}</div>
        <div class="home-ann-modal-message">{latestAnnouncement.message}</div>
        <div class="home-ann-modal-published">Published: {formatAnnouncementPublishedAt(latestAnnouncement.publishedAt)}</div>
        <label class="home-ann-modal-check">
          <input type="checkbox" bind:checked={announcementDontShowAgain} />
          <span>Don't show this again</span>
        </label>
        <div class="home-ann-modal-actions">
          <button class="btn b-y" type="button" on:click={dismissAnnouncementPopup}>Dismiss</button>
        </div>
      </div>
    </div>
  {/if}
</div>
