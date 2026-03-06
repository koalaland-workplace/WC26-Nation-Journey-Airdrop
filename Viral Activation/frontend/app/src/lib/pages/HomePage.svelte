<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import type { AppPage, InfoTab } from "../stores/ui.store";
  import { HOME_HERO_SNAPSHOT, HOME_TOP_NATIONS } from "../modules/home/data";
  import { daysUntilKickoff, formatFans } from "../modules/home/utils";
  import { fetchReferralState } from "../modules/referral/api";
  import { resolveRankLine } from "../modules/session/utils";
  import { TIER_POLICY } from "../modules/tier/policy";
  import { hotSignalsStore } from "../stores/hot-signals.store";
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

  onMount(() => {
    ticker = setInterval(() => {
      countdownDays = daysUntilKickoff();
    }, 60_000);
  });

  onDestroy(() => {
    if (ticker) clearInterval(ticker);
  });

  $: hotSignals = $hotSignalsStore.items.slice(0, 5);
  $: homeHotUpdated = updatedLabel($hotSignalsStore.lastUpdatedAt);
  $: spinLeft = $spinStore.spin.left;
  $: sessionId = $sessionStore.sessionId;
  $: totalMickEarned = $sessionStore.kick;
  $: currentRankLine = resolveRankLine(totalMickEarned);
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

  <div class="card acc-b home-tier-card">
    <div class="home-tier-title">Users Tracking</div>
    <div class="home-tier-row">
      <div class="home-tier-row-head">Direct Referral (F1)</div>
      <div class="home-tier-row-desc">{directReferralF1.toLocaleString("en-US")}</div>
    </div>
    <div class="home-tier-row">
      <div class="home-tier-row-head">Indirect Referral (F2)</div>
      <div class="home-tier-row-desc">{indirectReferralF2.toLocaleString("en-US")}</div>
    </div>
    <div class="home-tier-row">
      <div class="home-tier-row-head">Current Rank</div>
      <div class="home-tier-row-desc">{currentRankLine}</div>
    </div>
    <div class="home-tier-row">
      <div class="home-tier-row-head">Total MICK Earned</div>
      <div class="home-tier-row-desc">{totalMickEarned.toLocaleString("en-US")}</div>
    </div>
  </div>

  <div class="card acc-y home-tier-card">
    <div class="home-tier-title">2.4 Tiers & Benefits</div>
    <div class="home-tier-sub">Your total KICK at snapshot determines your Tier and Benefits:</div>
    {#each TIER_POLICY as tier}
      <div class="home-tier-row">
        <div class="home-tier-row-head">{tier.label}</div>
        <div class="home-tier-row-desc">Requirements: {tier.kickLabel}</div>
        <div class="home-tier-row-desc">Benefits: {tier.rewardsLabel}</div>
        {#if tier.bonusLabel.trim()}
          <div class="home-tier-row-desc">Upgrade Bonus: {tier.bonusLabel}</div>
        {/if}
        <div class="home-tier-row-desc">{tier.rightsLabel}</div>
        <div class="home-tier-row-desc">{tier.gameplayLabel}</div>
      </div>
    {/each}
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
</div>
