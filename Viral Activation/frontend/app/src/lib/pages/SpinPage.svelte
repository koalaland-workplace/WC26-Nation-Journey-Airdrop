<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { MAX_DAILY_SPIN_CAP, SPIN_SEGMENT_ORDER } from "../modules/spin/constants";
  import {
    formatSpinResult,
    formatSpinSubtitle,
    formatUnlockMessage,
    getSpinTargetAngle
  } from "../modules/spin/utils";
  import type { SpinRewardId, SpinUnlockType } from "../modules/spin/types";
  import { sessionStore } from "../stores/session.store";
  import { spinStore } from "../stores/spin.store";

  interface SpinFxItem {
    id: number;
    icon: string;
    x: number;
    y: number;
    rot: number;
    delay: number;
  }

  const SPIN_FX_ICONS = ["🎁", "🎉", "✨", "💰", "🎟️"];

  interface SpinSegmentTheme {
    text1: string;
    text2: string;
    color1: string;
    color2: string;
    text: string;
    glow: string;
  }

  const SPIN_SEGMENT_THEME: Record<SpinRewardId, SpinSegmentTheme> = {
    k50: {
      text1: "50",
      text2: "KICK",
      color1: "#2a1a00",
      color2: "#E5A020",
      text: "#f7d165",
      glow: "#E5A020"
    },
    k100: {
      text1: "100",
      text2: "KICK",
      color1: "#0d4a20",
      color2: "#1FBF6A",
      text: "#9df6c2",
      glow: "#1FBF6A"
    },
    k200: {
      text1: "200",
      text2: "KICK",
      color1: "#4a2e00",
      color2: "#F5C542",
      text: "#ffe69b",
      glow: "#F5C542"
    },
    q2x: {
      text1: "2x QUIZ",
      text2: "TODAY",
      color1: "#0a1a3a",
      color2: "#1E88E5",
      text: "#9fd1ff",
      glow: "#1E88E5"
    },
    r3x: {
      text1: "3x REF",
      text2: "TODAY",
      color1: "#2a0a3a",
      color2: "#AB47BC",
      text: "#d7a9ff",
      glow: "#AB47BC"
    },
    ticket: {
      text1: "BOX",
      text2: "TICKET",
      color1: "#0a2a3a",
      color2: "#26C6DA",
      text: "#9defff",
      glow: "#26C6DA"
    },
    nothing: {
      text1: "NOTHING",
      text2: "",
      color1: "#0a0a0a",
      color2: "#1a1a2a",
      text: "#9aa4b1",
      glow: "#7f8a96"
    }
  };

  let popupMessage = "Reward ready.";
  let popupVisible = false;
  let popupGood = false;
  let popupTimer: ReturnType<typeof setTimeout> | null = null;
  let fxItems: SpinFxItem[] = [];
  let fxCounter = 0;
  let animationFrameId: number | null = null;
  let spinCanvas: HTMLCanvasElement | null = null;

  $: sessionId = $sessionStore.sessionId;
  $: spinState = $spinStore.spin;
  $: spinBoosts = $spinStore.boosts;
  $: spinSubtitle = formatSpinSubtitle(spinState.left);

  $: capReached = spinState.cap >= MAX_DAILY_SPIN_CAP;
  $: inviteLabel = capReached ? "MAX 10/10" : `+1 SPIN · ${spinState.invite}`;
  $: shareLabel = capReached ? "MAX 10/10" : `+1 SPIN · ${spinState.share}`;

  $: quizBoostLabel =
    spinBoosts.quizBoostMult > 1 ? `Active · ${spinBoosts.quizBoostMult}x` : "Inactive";
  $: refBoostLabel =
    spinBoosts.refBoostMult > 1 ? `Active · ${spinBoosts.refBoostMult}x` : "Inactive";

  $: disableRoll = $spinStore.isRolling || spinState.left <= 0;
  $: primarySpinText = $spinStore.isRolling
    ? "SPINNING..."
    : spinState.left > 0
      ? "SPIN NOW"
      : "COME BACK TOMORROW";

  $: if (sessionId && $spinStore.status === "idle") {
    void spinStore.refresh(sessionId);
  }

  $: if (spinCanvas) {
    drawSpinWheel($spinStore.wheelAngle);
  }

  function popup(message: string, good: boolean): void {
    popupMessage = message;
    popupGood = good;
    popupVisible = true;

    if (popupTimer) {
      clearTimeout(popupTimer);
    }

    popupTimer = setTimeout(() => {
      popupVisible = false;
    }, 1600);
  }

  function burstFx(count = 8): void {
    const safeCount = Math.max(4, Math.min(16, count));
    const nextItems: SpinFxItem[] = [];

    for (let index = 0; index < safeCount; index += 1) {
      fxCounter += 1;
      nextItems.push({
        id: fxCounter,
        icon: SPIN_FX_ICONS[Math.floor(Math.random() * SPIN_FX_ICONS.length)],
        x: Math.random() * 220 - 110,
        y: 130 + Math.random() * 120,
        rot: Math.random() * 140 - 70,
        delay: Number((Math.random() * 0.25).toFixed(2))
      });
    }

    fxItems = [...fxItems, ...nextItems];

    setTimeout(() => {
      const ids = new Set(nextItems.map((item) => item.id));
      fxItems = fxItems.filter((item) => !ids.has(item.id));
    }, 1700);
  }

  function easeOutCubic(t: number): number {
    return 1 - (1 - t) ** 3;
  }

  function drawSpinWheel(rotationDeg: number): void {
    const canvas = spinCanvas;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const cssWidth = canvas.clientWidth || 290;
    const cssHeight = canvas.clientHeight || 290;
    const renderWidth = Math.round(cssWidth * dpr);
    const renderHeight = Math.round(cssHeight * dpr);

    if (canvas.width !== renderWidth || canvas.height !== renderHeight) {
      canvas.width = renderWidth;
      canvas.height = renderHeight;
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(dpr, dpr);

    const width = cssWidth;
    const height = cssHeight;
    const centerX = width / 2;
    const centerY = height / 2;
    const outerRadius = Math.min(width, height) / 2 - 8;
    const innerRadius = 40;
    const segmentCount = SPIN_SEGMENT_ORDER.length;
    const segmentArc = (Math.PI * 2) / segmentCount;

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate((rotationDeg * Math.PI) / 180);
    ctx.translate(-centerX, -centerY);

    for (let index = 0; index < segmentCount; index += 1) {
      const rewardId = SPIN_SEGMENT_ORDER[index];
      const segment = SPIN_SEGMENT_THEME[rewardId];
      const start = index * segmentArc - Math.PI / 2;
      const end = start + segmentArc;
      const mid = start + segmentArc / 2;

      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, outerRadius, start, end);
      ctx.closePath();

      const gradientX = centerX + Math.cos(mid) * outerRadius * 0.45;
      const gradientY = centerY + Math.sin(mid) * outerRadius * 0.45;
      const segmentGradient = ctx.createRadialGradient(
        centerX,
        centerY,
        innerRadius,
        gradientX,
        gradientY,
        outerRadius * 0.9
      );
      segmentGradient.addColorStop(0, segment.color1);
      segmentGradient.addColorStop(1, `${segment.color2}cc`);
      ctx.fillStyle = segmentGradient;
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(
        centerX + outerRadius * Math.cos(start),
        centerY + outerRadius * Math.sin(start)
      );
      ctx.strokeStyle = "rgba(0,0,0,.55)";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(centerX, centerY, outerRadius - 1, start, end);
      ctx.strokeStyle = `${segment.glow}99`;
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(mid);
      const textDistance = (outerRadius + innerRadius) / 2 + 8;

      ctx.fillStyle = segment.text;
      ctx.shadowColor = segment.glow;
      ctx.shadowBlur = 8;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      ctx.font = '700 11px "JetBrains Mono", monospace';
      ctx.fillText(segment.text1, textDistance, segment.text2 ? -7 : 0);
      if (segment.text2) {
        ctx.font = '700 9px "Inter", sans-serif';
        ctx.fillText(segment.text2, textDistance, 7);
      }
      ctx.restore();
    }

    const ringGradient = ctx.createRadialGradient(
      centerX,
      centerY,
      outerRadius - 6,
      centerX,
      centerY,
      outerRadius + 6
    );
    ringGradient.addColorStop(0, "rgba(40,40,50,.8)");
    ringGradient.addColorStop(0.5, "rgba(80,80,90,.6)");
    ringGradient.addColorStop(1, "rgba(20,20,30,.9)");
    ctx.beginPath();
    ctx.arc(centerX, centerY, outerRadius + 3, 0, Math.PI * 2);
    ctx.arc(centerX, centerY, outerRadius - 3, 0, Math.PI * 2, true);
    ctx.fillStyle = ringGradient;
    ctx.fill();

    for (let index = 0; index < segmentCount; index += 1) {
      const angle = index * segmentArc - Math.PI / 2;
      const screwX = centerX + outerRadius * Math.cos(angle);
      const screwY = centerY + outerRadius * Math.sin(angle);
      ctx.beginPath();
      ctx.arc(screwX, screwY, 4, 0, Math.PI * 2);
      const screwGradient = ctx.createRadialGradient(
        screwX - 1,
        screwY - 1,
        0,
        screwX,
        screwY,
        4
      );
      screwGradient.addColorStop(0, "#ddd");
      screwGradient.addColorStop(1, "#555");
      ctx.fillStyle = screwGradient;
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(centerX, centerY, innerRadius + 2, 0, Math.PI * 2);
    const centerGradient = ctx.createRadialGradient(
      centerX - 8,
      centerY - 8,
      0,
      centerX,
      centerY,
      innerRadius + 2
    );
    centerGradient.addColorStop(0, "#1a2a1a");
    centerGradient.addColorStop(1, "#050e08");
    ctx.fillStyle = centerGradient;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(centerX, centerY, innerRadius + 2, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(31,191,106,.4)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();
  }

  async function animateWheel(targetAngle: number, durationMs = 4200): Promise<void> {
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }

    const from = $spinStore.wheelAngle;
    const startAt = performance.now();

    await new Promise<void>((resolve) => {
      const tick = (now: number) => {
        const progress = Math.min(1, (now - startAt) / durationMs);
        const currentAngle = from + (targetAngle - from) * easeOutCubic(progress);
        spinStore.setWheelAngle(currentAngle);

        if (progress < 1) {
          animationFrameId = requestAnimationFrame(tick);
          return;
        }

        animationFrameId = null;
        spinStore.setWheelAngle(targetAngle);
        resolve();
      };

      animationFrameId = requestAnimationFrame(tick);
    });
  }

  async function unlockSpin(type: SpinUnlockType): Promise<void> {
    if (!sessionId || $spinStore.isRolling || capReached) return;

    spinStore.setError(null);

    try {
      const unlock = await spinStore.unlock(sessionId, type);
      if (type === "invite") {
        if (unlock.inviteBonus?.verified) {
          popup(formatUnlockMessage(type), true);
        } else {
          popup("👥 Invite verification pending. Reward is unlocked after F1 registration.", false);
        }
      } else {
        popup(formatUnlockMessage(type), true);
      }
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : "Unable to unlock extra spin.";
      const message =
        rawMessage === "invite_not_verified"
          ? "Invite bonus is locked until 1 referred user completes registration."
          : rawMessage;
      spinStore.setError(message);
      popup(message, false);
    }
  }

  async function rollNow(): Promise<void> {
    if (!sessionId || $spinStore.isRolling) return;

    if (spinState.left <= 0) {
      const message = "No spins left for today.";
      spinStore.setResult(message, false);
      popup(message, false);
      return;
    }

    spinStore.setRolling(true);
    spinStore.setError(null);
    spinStore.setResult("Spinning...", false);

    try {
      const roll = await spinStore.roll(sessionId, false);
      const targetAngle = getSpinTargetAngle($spinStore.wheelAngle, roll.reward.id, 6);

      await animateWheel(targetAngle, 4200);
      spinStore.applyRoll(roll);

      const result = formatSpinResult(roll.reward, roll.deltaApplied);
      spinStore.setResult(result.message, result.good);
      popup(result.message, result.good);

      if (result.good) {
        const burstCount = roll.reward.type === "kick" && roll.reward.value >= 200 ? 12 : 8;
        burstFx(burstCount);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Spin failed.";
      spinStore.setResult(message, false);
      spinStore.setError(message);
      popup(message, false);
    } finally {
      spinStore.setRolling(false);
    }
  }

  onMount(() => {
    const handleResize = (): void => {
      drawSpinWheel($spinStore.wheelAngle);
    };

    window.addEventListener("resize", handleResize);
    handleResize();

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  });

  onDestroy(() => {
    if (popupTimer) {
      clearTimeout(popupTimer);
      popupTimer = null;
    }

    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
  });
</script>

<div id="page-spin" class="pg on">
  <div class="spin-page-wrap">
    <div class={`spin-pop ${popupVisible ? "on" : ""} ${popupGood ? "good" : ""}`}>{popupMessage}</div>

    <div class="spin-fx" aria-hidden="true">
      {#each fxItems as fx (fx.id)}
        <span
          class="spin-gift"
          style={`--x:${fx.x}px; --y:${fx.y}px; --rot:${fx.rot}deg; animation-delay:${fx.delay}s;`}
          >{fx.icon}</span
        >
      {/each}
    </div>

    <div class="spin-page-title">⚡ Daily Lucky Spin</div>
    <div class="spin-page-sub">
      <span class="spin-live-dot" />
      <span>{spinSubtitle}</span>
    </div>

    <div class="spin-stats-strip">
      <div class="spin-stat-pill">
        <div class="spin-stat-pill-num">{spinState.left}</div>
        <div class="spin-stat-pill-lbl">Spins Left</div>
      </div>
      <div class="spin-stat-pill">
        <div class="spin-stat-pill-num">{spinState.cap}</div>
        <div class="spin-stat-pill-lbl">Today Cap</div>
      </div>
      <div class="spin-stat-pill">
        <div class="spin-stat-pill-num">{spinState.tickets}</div>
        <div class="spin-stat-pill-lbl">Rising Tickets</div>
      </div>
    </div>

    <div class="spin-stage">
      <div class="spin-outer-ring" />
      <div class="spin-outer-ring-mask" />

      <canvas
        id="spinCanvas"
        bind:this={spinCanvas}
        width="290"
        height="290"
        aria-label="Spin wheel"
        class:disabled={disableRoll}
        on:click={rollNow}
      />

      <div class="spin-pointer-arrow" />

      <div class="spin-center-zone">
        <div class="spin-center-box">
          <button
            class={`spin-ball-btn ${disableRoll ? "" : "spin-ball-pulse"}`}
            id="spinBallBtn"
            type="button"
            aria-label="Tap to spin"
            on:click={rollNow}
            disabled={disableRoll}
          />
        </div>
      </div>
    </div>

    <button
      class={`spin-big-btn ${disableRoll ? "disabled" : ""}`}
      type="button"
      on:click={rollNow}
      disabled={disableRoll}
    >
      <span class="spin-big-btn-ico">⚽</span>
      <span id="spinBigBtnTxt">{primarySpinText}</span>
    </button>

    <div class={`spin-result-msg ${$spinStore.resultGood ? "good" : ""}`}>{$spinStore.resultMessage}</div>

    {#if $spinStore.errorMessage}
      <div class="spin-error">{$spinStore.errorMessage}</div>
    {/if}
  </div>

  <div class="spin-boost-row">
    <div class="spin-boost-title">🚀 Unlock More Spins Today</div>

    <div class="spin-boost-item">
      <span class="spin-boost-lbl">👥 Invite 1 verified F1 (+1 spin +250 KICK)</span>
      <button
        class={`spin-boost-status ${capReached ? "sbs-done" : "sbs-todo"}`}
        type="button"
        on:click={() => unlockSpin("invite")}
        disabled={capReached || $spinStore.isRolling}
      >
        {inviteLabel}
      </button>
    </div>

    <div class="spin-boost-item">
      <span class="spin-boost-lbl">📣 Share WAR ranking</span>
      <button
        class={`spin-boost-status ${capReached ? "sbs-done" : "sbs-todo"}`}
        type="button"
        on:click={() => unlockSpin("share")}
        disabled={capReached || $spinStore.isRolling}
      >
        {shareLabel}
      </button>
    </div>

    <div class="spin-boost-item">
      <span class="spin-boost-lbl">❓ Quiz Boost</span>
      <span class="spin-boost-status sbs-done">{quizBoostLabel}</span>
    </div>

    <div class="spin-boost-item">
      <span class="spin-boost-lbl">👥 Referral Boost</span>
      <span class="spin-boost-status sbs-done">{refBoostLabel}</span>
    </div>
  </div>
</div>
