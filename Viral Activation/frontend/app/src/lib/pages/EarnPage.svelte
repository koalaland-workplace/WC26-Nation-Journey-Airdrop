<script lang="ts">
  import { onDestroy } from "svelte";
  import { EARN_TASK_CAP } from "../modules/earn/data";
  import { toneButtonClass } from "../modules/earn/utils";
  import { earnStore } from "../stores/earn.store";
  import { sessionStore } from "../stores/session.store";
  import type { EarnTask } from "../modules/earn/types";
  import type { AppPage } from "../stores/ui.store";

  const DEFAULT_TELEGRAM_BOT_USERNAME = "wc26viral_bot";
  const DEFAULT_TELEGRAM_APP_SHORT_NAME = "wc26airdrop";
  const DEFAULT_REFERRAL_SESSION_ID = "b61ddaac-82a3-4424-bef9-4cb9d7b80f6b";

  export let onNavigate: (page: AppPage) => void = () => {};

  let flashMessage = "";
  let flashTimer: ReturnType<typeof setTimeout> | null = null;
  let initSessionToken = "";
  let inviteLinkField: HTMLTextAreaElement | null = null;

  $: sessionId = $sessionStore.sessionId;
  $: {
    const token = sessionId ?? "guest";
    if (token !== initSessionToken) {
      initSessionToken = token;
      void earnStore.init(sessionId, true);
    }
  }

  $: claimedTaskSet = new Set($earnStore.claimedTaskIds);
  $: verifiedTaskSet = new Set($earnStore.verifiedTaskIds);
  $: taskDoneCount = $earnStore.claimedTaskIds.length;
  $: taskTotal = $earnStore.tasks.length;
  $: progressPct = taskTotal > 0 ? Math.round((taskDoneCount / taskTotal) * 100) : 0;
  $: earnRingOffset = 220 * (1 - Math.min(100, progressPct) / 100);
  $: inviteLink = buildInviteLink(sessionId);
  $: inviteLinkDisplay = inviteLink ?? "Invite link unavailable";
  $: copyInviteDisabled = !inviteLink;

  $: groupedTasks = $earnStore.categories
    .map((category) => ({
      ...category,
      tasks: $earnStore.tasks.filter((task) => task.categoryId === category.id)
    }))
    .filter((group) => group.tasks.length > 0);

  function showFlash(message: string): void {
    flashMessage = message;
    if (flashTimer) {
      clearTimeout(flashTimer);
    }
    flashTimer = setTimeout(() => {
      flashMessage = "";
    }, 1800);
  }

  async function claim(task: EarnTask): Promise<void> {
    const result = await earnStore.claimTask(sessionId, task);
    showFlash(result.message);
  }

  async function verify(task: EarnTask): Promise<void> {
    const hint = task.verificationHint || "Paste proof link for this mission.";
    const proof = window.prompt(`Verify "${task.name}"\n${hint}`, "");
    if (proof === null) return;
    const result = await earnStore.verifyTask(sessionId, task, proof);
    showFlash(result.message);
  }

  async function activateRefBoost(): Promise<void> {
    await earnStore.boostReferral(sessionId, 3);
    showFlash("🚀 Referral boost synced.");
  }

  function canOpenTaskChannel(task: EarnTask): boolean {
    return Boolean(task.isActive !== false && task.channel?.isActive && task.channel.url);
  }

  function normalizeTelegramValue(value: unknown): string | null {
    const text = String(value ?? "")
      .trim()
      .replace(/^@+/, "")
      .replace(/[^a-zA-Z0-9_]/g, "");
    return text.length > 0 ? text : null;
  }

  function buildInviteLink(currentSessionId: string | null): string | null {
    const cleanSessionId = String(currentSessionId ?? "").trim();
    const fallbackSessionId = String(import.meta.env.VITE_DEFAULT_REFERRAL_SESSION_ID ?? DEFAULT_REFERRAL_SESSION_ID).trim();
    const startAppSessionId = cleanSessionId || fallbackSessionId;
    if (!startAppSessionId) return null;

    const botUsername =
      normalizeTelegramValue(import.meta.env.VITE_TELEGRAM_BOT_USERNAME) ?? DEFAULT_TELEGRAM_BOT_USERNAME;
    const appShortName =
      normalizeTelegramValue(import.meta.env.VITE_TELEGRAM_APP_SHORT_NAME) ?? DEFAULT_TELEGRAM_APP_SHORT_NAME;

    return `https://t.me/${botUsername}/${appShortName}?startapp=${encodeURIComponent(startAppSessionId)}`;
  }

  function legacyCopyToClipboard(text: string): boolean {
    const input = document.createElement("textarea");
    input.value = text;
    input.setAttribute("readonly", "");
    input.style.position = "fixed";
    input.style.left = "-9999px";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.focus();
    input.select();
    input.setSelectionRange(0, input.value.length);
    const copied = document.execCommand("copy");
    document.body.removeChild(input);
    return copied;
  }

  function copyFromInviteField(): boolean {
    if (!inviteLinkField) return false;
    try {
      inviteLinkField.focus();
      inviteLinkField.select();
      inviteLinkField.setSelectionRange(0, inviteLinkField.value.length);
      return document.execCommand("copy");
    } catch {
      return false;
    }
  }

  function focusInviteFieldForManualCopy(): void {
    if (!inviteLinkField) return;
    inviteLinkField.focus();
    inviteLinkField.select();
    inviteLinkField.setSelectionRange(0, inviteLinkField.value.length);
  }

  async function copyInviteLink(): Promise<void> {
    if (!inviteLink) {
      showFlash("Invite link is not ready yet.");
      return;
    }

    let copied = copyFromInviteField();

    try {
      if (!copied && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(inviteLink);
        copied = true;
      }
    } catch {
      copied = copied || false;
    }

    if (!copied) {
      copied = legacyCopyToClipboard(inviteLink);
    }

    if (copied) {
      showFlash("✅ Invite link copied.");
      return;
    }

    focusInviteFieldForManualCopy();
    const manual = window.prompt("Copy invite link:", inviteLink);
    if (manual !== null) {
      showFlash("📋 Invite link ready to copy.");
      return;
    }

    showFlash("❌ Unable to copy invite link.");
  }

  function openTaskChannel(task: EarnTask): void {
    if (!canOpenTaskChannel(task)) return;
    window.open(task.channel!.url, "_blank", "noopener,noreferrer");
  }

  function onTaskKeyDown(event: KeyboardEvent, task: EarnTask): void {
    if (!canOpenTaskChannel(task)) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    openTaskChannel(task);
  }

  onDestroy(() => {
    if (flashTimer) {
      clearTimeout(flashTimer);
      flashTimer = null;
    }
  });
</script>

<div id="page-earn" class="pg on">
  <div class="earn-top">
    <div class="earn-title">🎁 Engage & Earn</div>
    <div class="earn-sub">Like. Share. Dominate. Earn KICK. Unlock allocation. Claim game rewards.</div>
  </div>

  <div style="text-align:center">
    <div style="position:relative;width:84px;height:84px;margin:9px auto 4px">
      <svg width="84" height="84" viewBox="0 0 84 84" style="transform:rotate(-90deg)">
        <circle cx="42" cy="42" r="35" fill="none" stroke="#172635" stroke-width="6" />
        <circle
          cx="42"
          cy="42"
          r="35"
          fill="none"
          stroke="url(#earng)"
          stroke-width="6"
          stroke-dasharray="220"
          stroke-dashoffset={earnRingOffset}
          stroke-linecap="round"
        />
        <defs>
          <linearGradient id="earng" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#F5C542" />
            <stop offset="100%" stop-color="#1FBF6A" />
          </linearGradient>
        </defs>
      </svg>
      <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column">
        <div style="font-family:'Montserrat',sans-serif;font-weight:800;font-size:18px;color:var(--y)">{progressPct}%</div>
        <div style="font-size:7px;color:var(--gr)">complete</div>
      </div>
    </div>

    <div style="font-size:10.5px;color:var(--gr);margin-bottom:11px">
      <span>{taskDoneCount}</span> of <span>{taskTotal}</span> tasks ·
      <span style="color:var(--y);font-family:'JetBrains Mono',monospace">{Math.min(EARN_TASK_CAP, $earnStore.claimedKick).toLocaleString("en-US")} / {EARN_TASK_CAP.toLocaleString("en-US")} KICK</span>
    </div>
  </div>

  <div class="card acc-g">
    <div class="info-head">🎮 Daily Games</div>
    <div class="info-list">
      <div class="info-item">
        <strong style="color:var(--pw)">⚽ Penalty Challenge</strong><br />
        3 free/day, then 500 KICK per extra match. Win up to 2,000 KICK.
      </div>
      <div class="info-item">
        <strong style="color:var(--pw)">🎯 Extra Spin Unlock</strong><br />
        1 free spin/day. Invite 1 verified F1 to claim +1 spin +250 KICK and Referral Champion Pool eligibility.
      </div>
    </div>
    <div class="info-actions-grid">
      <button class="btn b-g" type="button" on:click={() => onNavigate("wars")}>OPEN WARS</button>
      <button class="btn b-y" type="button" on:click={() => onNavigate("spin")}>OPEN SPIN</button>
    </div>
  </div>

  <div class="ref-box" id="earn-ref-box">
    <div class="ref-title">👥 Referral Box</div>
    <div class="ref-sub">Invite friends to increase your nation momentum and unlock more daily spins.</div>
    <div class="ref-stats">
      <div class="rs"><div class="rv">{$earnStore.referral.boostMult}x</div><div class="rl">Referral Boost</div></div>
      <div class="rs"><div class="rv">{$sessionStore.spin.left}</div><div class="rl">Spin Left</div></div>
    </div>
    <div class="info-actions-grid">
      <button class="btn b-gh" type="button" on:click={activateRefBoost} disabled={$earnStore.isBoosting}>
        {$earnStore.isBoosting ? "SYNCING..." : "ACTIVATE 3X"}
      </button>
      <button class="btn b-g" type="button" on:click={() => onNavigate("spin")}>GO TO SPIN</button>
    </div>
    <div class="ref-invite-wrap">
      <div class="ref-invite-label">Your Invite Link</div>
      <textarea
        class="ref-invite-link"
        title={inviteLinkDisplay}
        bind:this={inviteLinkField}
        readonly
        rows="2"
        value={inviteLinkDisplay}
      ></textarea>
      <button class="btn b-y ref-copy-btn" type="button" on:click={copyInviteLink} disabled={copyInviteDisabled}>
        COPY INVITE LINK
      </button>
    </div>
  </div>

  {#each groupedTasks as category}
    <div class="tcat">
      <div class="tcat-hdr">
        <div class={`tci tc${category.tone}`}>{category.icon}</div>
        <div class="tcn">{category.title}</div>
        <div class="tcp">{category.totalLabel}</div>
      </div>

      {#each category.tasks as task}
        <div
          class={`task ${claimedTaskSet.has(task.id) ? "done" : ""} ${task.isActive === false ? "inactive" : ""} ${canOpenTaskChannel(task) ? "has-link" : ""}`}
          role={canOpenTaskChannel(task) ? "button" : undefined}
          tabindex={canOpenTaskChannel(task) ? 0 : undefined}
          on:click={() => openTaskChannel(task)}
          on:keydown={(event) => onTaskKeyDown(event, task)}
        >
          <div class="task-ic">{task.icon}</div>
          <div class="task-info">
            <div class="task-nm">{task.name}</div>
            <div class="task-ds">
              {task.description}
              {#if task.requiresVerification}
                · verification required
              {/if}
            </div>
            {#if task.channel}
              <div class={`task-ch ${task.channel.isActive ? "" : "off"}`}>
                <span class="task-ch-icon">{task.channel.icon}</span>
                <span class="task-ch-name">{task.channel.name}</span>
                <span class="task-ch-platform">{task.channel.platform}</span>
              </div>
            {/if}
          </div>
          <div class="task-r">
            <div class="task-pts">+{task.points.toLocaleString("en-US")}</div>
            {#if task.requiresVerification && verifiedTaskSet.has(task.id) && !claimedTaskSet.has(task.id)}
              <div class="task-vf">VERIFIED</div>
            {/if}
            {#if claimedTaskSet.has(task.id)}
              <div class="task-di">✅</div>
            {:else if task.isActive === false}
              <button class="tbtn tbi" type="button" disabled>
                INACTIVE
              </button>
            {:else if task.requiresVerification && !verifiedTaskSet.has(task.id)}
              <button class={`tbtn ${toneButtonClass(task.tone)}`} type="button" on:click|stopPropagation={() => verify(task)}>
                VERIFY
              </button>
            {:else}
              <button class={`tbtn ${toneButtonClass(task.tone)}`} type="button" on:click|stopPropagation={() => claim(task)}>
                {task.actionLabel}
              </button>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/each}

  {#if flashMessage}
    <div class="earn-flash">{flashMessage}</div>
  {/if}

  {#if $earnStore.errorMessage}
    <div class="earn-error">{$earnStore.errorMessage}</div>
  {/if}
</div>
