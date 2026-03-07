<script lang="ts">
  import { onMount } from "svelte";
  import type { AppPage, InfoTab } from "../stores/ui.store";
  import {
    MATCH_GROUP_FILTERS,
    MATCH_GROUPS,
    MATCH_KNOCKOUT_FILTERS,
    MATCH_KNOCKOUT_ROUNDS
  } from "../modules/match/data";
  import { hotSignalsStore } from "../stores/hot-signals.store";
  import { languageStore } from "../stores/language.store";
  import { updatedLabel } from "../modules/news/utils";
  import HotSignalsFeed from "../components/HotSignalsFeed.svelte";
  import { PIQUE_PRESETS, resolvePiqueReply } from "../modules/info/pique";
  import { fetchAppRules } from "../modules/rules/api";
  import { renderMarkdownToHtml } from "../modules/rules/markdown";
  import type { AppRulesResponse } from "../modules/rules/types";
  import type { AppLanguageCode } from "../modules/i18n/types";

  export let activeTab: InfoTab = "match";
  export let onChangeTab: (tab: InfoTab) => void = () => {};
  export let onNavigate: (page: AppPage) => void = () => {};

  const tabItems: Array<{ key: InfoTab; label: string }> = [
    { key: "match", label: "🏟️ Match Hub" },
    { key: "pulse", label: "📡 Hot Signals" },
    { key: "rules", label: "📋 Rules" },
    { key: "ai", label: "🤖 PIQUE" }
  ];

  const ALL_MATCH_FILTER = "ALL";
  const DEFAULT_RULES_TITLE = "📋 Game Rules & Airdrop Overview";
  const DEFAULT_RULES_CONTENT = [
    "## 1. Token Framework & Pools",
    "- **KICK** is an off-chain participation point used for ranking and eligibility.",
    "- **WC26** is the on-chain token allocated by official conversion events.",
    "- Mini Games Conversion Pool remains fixed at 10,000,000 WC26 in current policy.",
    "",
    "## 2. Eligibility Snapshot Basics",
    "- At least 10,000 KICK.",
    "- At least 7 active days.",
    "- Pass Anti-Sybil and compliance checks.",
    "",
    "Full legal rulebook and governance updates remain in Admin-managed announcement flows."
  ].join("\n");

  let selectedMatchFilter = ALL_MATCH_FILTER;
  let aiInput = "";
  let aiReply = resolvePiqueReply("");
  let rulesTitle = DEFAULT_RULES_TITLE;
  let rulesContent = DEFAULT_RULES_CONTENT;
  let rulesHtml = renderMarkdownToHtml(DEFAULT_RULES_CONTENT);
  let rulesUpdatedAt: string | null = null;
  let rulesLoading = false;
  let rulesError = "";
  let rulesLanguage = "en";
  let rulesFallbackLanguage: string | null = null;
  let rulesRequestId = 0;
  const rulesCache = new Map<string, AppRulesResponse>();

  $: isKnockoutFilter = selectedMatchFilter.startsWith("KO:");
  $: selectedGroupCode = selectedMatchFilter.startsWith("GROUP:")
    ? selectedMatchFilter.slice(6)
    : null;
  $: selectedKnockoutRoundId = selectedMatchFilter.startsWith("KO:")
    ? selectedMatchFilter.slice(3)
    : null;

  $: visibleGroups = selectedMatchFilter === ALL_MATCH_FILTER
    ? MATCH_GROUPS
    : selectedGroupCode
      ? MATCH_GROUPS.filter((group) => group.code === selectedGroupCode)
      : MATCH_GROUPS;

  $: visibleKnockoutRounds = selectedMatchFilter === ALL_MATCH_FILTER
    ? MATCH_KNOCKOUT_ROUNDS
    : selectedKnockoutRoundId
      ? MATCH_KNOCKOUT_ROUNDS.filter((round) => round.id === selectedKnockoutRoundId)
      : MATCH_KNOCKOUT_ROUNDS;

  $: if (activeTab === "pulse") {
    void hotSignalsStore.refresh(5, false, $languageStore.current);
  }

  $: if (activeTab === "rules") {
    void loadRulesForLanguage($languageStore.current);
  }

  $: pulseUpdatedText = updatedLabel($hotSignalsStore.lastUpdatedAt);
  $: rulesHtml = renderMarkdownToHtml(rulesContent);

  onMount(() => {
    if (activeTab === "rules") {
      void loadRulesForLanguage($languageStore.current);
    }
  });

  function sendAi(input: string): void {
    aiReply = resolvePiqueReply(input);
  }

  function applyRulesPayload(payload: AppRulesResponse): void {
    const nextTitle = payload.title.trim();
    const nextContent = payload.content.trim();
    rulesTitle = nextTitle || DEFAULT_RULES_TITLE;
    rulesContent = nextContent || DEFAULT_RULES_CONTENT;
    rulesUpdatedAt = payload.updatedAt;
    rulesLanguage = payload.language || "en";
    rulesFallbackLanguage = payload.fallbackLanguage;
  }

  function toRulesErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message.trim().length > 0) {
      return error.message;
    }
    return "Failed to load latest rules.";
  }

  async function loadRulesForLanguage(language: AppLanguageCode): Promise<void> {
    const normalized = String(language).trim().toLowerCase() || "en";
    const cached = rulesCache.get(normalized);
    if (cached) {
      applyRulesPayload(cached);
      rulesError = "";
      return;
    }

    const requestId = ++rulesRequestId;
    rulesLoading = true;
    rulesError = "";

    try {
      const payload = await fetchAppRules(normalized);
      rulesCache.set(normalized, payload);
      if (requestId !== rulesRequestId) return;
      applyRulesPayload(payload);
    } catch (error) {
      if (requestId !== rulesRequestId) return;
      rulesError = toRulesErrorMessage(error);
    } finally {
      if (requestId === rulesRequestId) {
        rulesLoading = false;
      }
    }
  }
</script>

<div id="page-info" class="pg on">
  <div class="info-top">
    <div class="earn-title">ℹ️ INFO HUB</div>
    <div class="earn-sub">Match Hub · Hot Signals · Rules · Leaderboards · AI</div>
  </div>

  <div class="info-tab-row">
    {#each tabItems as tab}
      <button
        type="button"
        class={`info-tab-btn ${activeTab === tab.key ? "active" : ""}`}
        on:click={() => onChangeTab(tab.key)}
      >
        {tab.label}
      </button>
    {/each}
  </div>

  {#if activeTab === "match"}
    <div class="card acc-b info-sec info-section">
      <div class="info-head">🏟️ Groups & Fixtures</div>

      <div class="group-pills">
        <button
          type="button"
          class={`group-pill ${selectedMatchFilter === ALL_MATCH_FILTER ? "active" : ""}`}
          on:click={() => (selectedMatchFilter = ALL_MATCH_FILTER)}
        >
          All
        </button>

        {#each MATCH_GROUP_FILTERS as filter}
          <button
            type="button"
            class={`group-pill ${selectedMatchFilter === filter.id ? "active" : ""}`}
            on:click={() => (selectedMatchFilter = filter.id)}
          >
            {filter.label}
          </button>
        {/each}

        {#each MATCH_KNOCKOUT_FILTERS as filter}
          <button
            type="button"
            class={`group-pill knockout ${selectedMatchFilter === filter.id ? "active" : ""}`}
            on:click={() => (selectedMatchFilter = filter.id)}
          >
            {filter.label}
          </button>
        {/each}
      </div>

      {#if !isKnockoutFilter}
        {#each visibleGroups as group (group.code)}
          <div class="group-card">
            <div class="group-header">{group.badge} {group.name}</div>

            {#each group.teams as team}
              <div class="group-team">
                <span class="group-team-flag">{team.flag}</span>
                <span class="group-team-name">
                  {team.name}{team.host ? " 🏠" : ""}{team.tbd ? " (TBD)" : ""}
                </span>
                <span class="group-team-rank">{team.rank === "—" ? "—" : `FIFA #${team.rank}`}</span>
              </div>
            {/each}

            <div class="group-fixtures">
              <div class="group-fixtures-head">MATCH SCHEDULE (ET)</div>
              {#each group.matches as fixture}
                <div class="group-fixture-row">
                  <span class="group-fixture-time">{fixture.date} {fixture.time}</span>
                  <span class="group-fixture-game">{fixture.home} <span class="muted">vs</span> {fixture.away}</span>
                  <span class="group-fixture-venue">{fixture.venue}</span>
                </div>
              {/each}
            </div>
          </div>
        {/each}
      {:else}
        {#each visibleKnockoutRounds as round (round.id)}
          <div class="knockout-card ko-visible">
            <div class="knockout-header">
              <div class="knockout-badge">{round.badge}</div>
              {round.label}
            </div>

            {#each round.matches as fixture}
              <div class="knockout-match">
                <span class="ko-slot">{fixture.slot}</span>
                <span class="ko-teams">
                  {#if fixture.home === "TBD" && fixture.away === "TBD"}
                    <span class="tbd">{fixture.home} vs {fixture.away}</span>
                  {:else}
                    {fixture.home} <span class="muted">vs</span> {fixture.away}
                  {/if}
                </span>
                <span class="ko-info">
                  <span class="ko-date">{fixture.date} {fixture.time}</span>
                  <span class="ko-venue">{fixture.venue}</span>
                </span>
              </div>
            {/each}
          </div>
        {/each}
      {/if}

      <div class="info-lead-links">
        <div class="info-head">🏆 Leaderboards</div>
        <div class="info-list">
          <div class="info-item">Nation WAR ranking and country momentum updates.</div>
          <div class="info-item">Global and national standings with contribution points.</div>
        </div>
        <div class="info-actions-grid">
          <button class="btn b-g" type="button" on:click={() => onNavigate("wars")}>NATION WARS</button>
          <button class="btn b-gh" type="button" on:click={() => onNavigate("home")}>HOME RANKS</button>
        </div>
      </div>
    </div>
  {/if}

  {#if activeTab === "pulse"}
    <div class="card acc-g info-sec info-section">
      <div class="info-head">📡 Hot Signals</div>
      <div class="home-hot-sub">{pulseUpdatedText}</div>
      <HotSignalsFeed items={$hotSignalsStore.items} />
      <button class="btn b-b" type="button" style="margin-top:8px" on:click={() => onNavigate("home")}>BACK HOME →</button>
    </div>
  {/if}

  {#if activeTab === "rules"}
    <div class="card acc-y info-sec info-section">
      <div class="info-head">{rulesTitle}</div>
      <div class="rules-doc info-rules-wrap">
        {#if rulesLoading}
          <div class="rules-note">Loading latest rules...</div>
        {/if}
        {#if rulesError}
          <div class="rules-note">{rulesError}</div>
        {/if}
        <div class="rules-markdown">{@html rulesHtml}</div>
        {#if rulesFallbackLanguage}
          <div class="rules-note">Language fallback: {rulesLanguage.toUpperCase()}</div>
        {/if}
        {#if rulesUpdatedAt}
          <div class="rules-note">Updated: {new Date(rulesUpdatedAt).toLocaleString()}</div>
        {/if}
      </div>
      <button class="btn b-y" type="button" style="margin-top:8px" on:click={() => onNavigate("earn")}>OPEN EARN →</button>
    </div>
  {/if}

  {#if activeTab === "ai"}
    <div class="card acc-r info-sec info-section">
      <div class="ai-bot-box">
        <div class="ai-bot-title">🤖 Ask PIQUE AI</div>
        <div class="ai-bot-sub">Tap a quick question, or type your own prompt below.</div>

        <div class="pique-quick-wrap">
          {#each PIQUE_PRESETS as preset}
            <button type="button" class="pique-q-btn" on:click={() => sendAi(preset.prompt)}>{preset.label}</button>
          {/each}
        </div>

        <div class="ai-input-row">
          <input
            class="ai-input"
            bind:value={aiInput}
            placeholder="Ask PIQUE about teams, rules, rewards..."
            on:keydown={(event) => {
              if (event.key === "Enter") sendAi(aiInput);
            }}
          />
          <button class="btn b-b ai-send" type="button" on:click={() => sendAi(aiInput)}>SEND</button>
        </div>

        <div class="ai-response show">{aiReply}</div>
      </div>
    </div>
  {/if}
</div>
