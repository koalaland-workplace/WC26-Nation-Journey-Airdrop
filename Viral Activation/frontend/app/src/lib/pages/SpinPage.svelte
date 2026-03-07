<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { MAX_DAILY_SPIN_CAP, SPIN_SEGMENT_ORDER } from "../modules/spin/constants";
  import {
    formatSpinResult,
    formatSpinSubtitle,
    formatUnlockMessage,
    getSpinTargetAngle
  } from "../modules/spin/utils";
  import type { SpinRewardId, SpinRollResponse, SpinUnlockType } from "../modules/spin/types";
  import { sessionStore } from "../stores/session.store";
  import { spinStore } from "../stores/spin.store";

  interface SpinSegmentTheme {
    labelTop: string;
    labelBottom: string;
    display: string;
    color: string;
    rim: string;
    text: string;
    icon: string;
    striped: boolean;
    desc: string;
  }

  interface SpinParticle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    color: string;
    size: number;
    life: number;
    decay: number;
    rot: number;
    rotSpeed: number;
    square: boolean;
  }

  interface SpinModalState {
    visible: boolean;
    icon: string;
    amount: string;
    desc: string;
    accent: string;
    buttonLabel: string;
    miss: boolean;
  }

  const MISS_MESSAGES = [
    "No luck this time. Champions try again.",
    "The pitch is calling. Spin once more.",
    "So close. Next one is yours.",
    "Keep going. The trophy is near.",
    "Missed this turn. KICK awaits the persistent."
  ];

  const SPIN_SEGMENT_THEME: Record<SpinRewardId, SpinSegmentTheme> = {
    k50: {
      labelTop: "50",
      labelBottom: "KICK",
      display: "50 KICK",
      color: "#0b4025",
      rim: "#1FBF6A",
      text: "#b0ffd8",
      icon: "⚡",
      striped: true,
      desc: "50 KICK in your wallet."
    },
    k100: {
      labelTop: "100",
      labelBottom: "KICK",
      display: "100 KICK",
      color: "#5a0a0a",
      rim: "#E53935",
      text: "#ffc4c4",
      icon: "⚽",
      striped: false,
      desc: "100 KICK. What a strike."
    },
    nothing: {
      labelTop: "NO",
      labelBottom: "LUCK",
      display: "NO LUCK",
      color: "#0a0a0a",
      rim: "#444444",
      text: "#666666",
      icon: "🥅",
      striped: false,
      desc: ""
    },
    k200: {
      labelTop: "200",
      labelBottom: "KICK",
      display: "200 KICK",
      color: "#4a3200",
      rim: "#F5C542",
      text: "#fff0a0",
      icon: "🏆",
      striped: true,
      desc: "200 KICK. GRAND PRIZE."
    },
    q2x: {
      labelTop: "2x",
      labelBottom: "QUIZ",
      display: "2x QUIZ",
      color: "#08275a",
      rim: "#1E88E5",
      text: "#a8d8ff",
      icon: "📋",
      striped: false,
      desc: "Quiz doubled today."
    },
    r3x: {
      labelTop: "3x",
      labelBottom: "REF",
      display: "3x REF",
      color: "#350870",
      rim: "#9333ea",
      text: "#e0aaff",
      icon: "👕",
      striped: true,
      desc: "Referral tripled today."
    },
    ticket: {
      labelTop: "RISING",
      labelBottom: "BOX",
      display: "RISING BOX",
      color: "#501e00",
      rim: "#FF6B35",
      text: "#ffd0b0",
      icon: "🎆",
      striped: false,
      desc: "Rising Box Ticket earned."
    }
  };

  let animationFrameId: number | null = null;
  let particleFrameId: number | null = null;
  let spinCanvas: HTMLCanvasElement | null = null;
  let particleCanvas: HTMLCanvasElement | null = null;
  let particles: SpinParticle[] = [];
  let audioCtx: AudioContext | null = null;
  let soundOn = true;
  let lastTickMod = 0;

  let modal: SpinModalState = {
    visible: false,
    icon: "🎁",
    amount: "",
    desc: "",
    accent: "#1FBF6A",
    buttonLabel: "COLLECT",
    miss: false
  };

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

  $: disableRoll = !sessionId || $spinStore.isRolling || spinState.left <= 0;
  $: primarySpinText = !sessionId
    ? "CONNECTING..."
    : $spinStore.isRolling
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

  function toggleSound(): void {
    soundOn = !soundOn;
    if (soundOn) {
      void ensureAudioContext();
    }
  }

  function ensureAudioContext(): AudioContext | null {
    if (!soundOn || typeof window === "undefined") return null;
    if (!audioCtx) {
      const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return null;
      audioCtx = new Ctx();
    }
    if (audioCtx.state === "suspended") {
      void audioCtx.resume();
    }
    return audioCtx;
  }

  function playOsc(
    frequency: number,
    type: OscillatorType,
    durationSec: number,
    volume: number,
    delaySec = 0
  ): void {
    const ctx = ensureAudioContext();
    if (!ctx) return;
    try {
      const startAt = ctx.currentTime + delaySec;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(volume, startAt);
      gain.gain.linearRampToValueAtTime(0, startAt + durationSec);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startAt);
      osc.stop(startAt + durationSec + 0.02);
    } catch {
      // Ignore transient audio errors.
    }
  }

  function playNoise(
    durationSec: number,
    freqStart: number,
    freqEnd: number,
    gainStart: number,
    gainEnd: number,
    filterType: BiquadFilterType = "bandpass"
  ): void {
    const ctx = ensureAudioContext();
    if (!ctx) return;
    try {
      const length = Math.max(1, Math.floor(ctx.sampleRate * durationSec));
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let index = 0; index < data.length; index += 1) {
        data[index] = (Math.random() * 2 - 1) * 0.04;
      }
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const bp = ctx.createBiquadFilter();
      bp.type = filterType;
      bp.frequency.setValueAtTime(freqStart, ctx.currentTime);
      bp.frequency.linearRampToValueAtTime(freqEnd, ctx.currentTime + durationSec);
      bp.Q.value = 1.5;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(gainStart, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(gainEnd, ctx.currentTime + durationSec);
      src.connect(bp);
      bp.connect(gain);
      gain.connect(ctx.destination);
      src.start(ctx.currentTime);
      src.stop(ctx.currentTime + durationSec);
    } catch {
      // Ignore transient audio errors.
    }
  }

  function playWhir(durationSec: number): void {
    playNoise(durationSec, 1600, 90, 0.9, 0.02);
  }

  function playTick(frequency = 380): void {
    playOsc(frequency, "square", 0.04, 0.055);
  }

  function playWhistle(): void {
    const cues: Array<[number, number, number]> = [
      [0, 0.28, 0.22],
      [0.36, 0.18, 0.2],
      [0.56, 0.18, 0.18]
    ];
    for (const [delaySec, durationSec, volume] of cues) {
      playOsc(2950, "sine", durationSec, volume, delaySec);
    }
  }

  function playCrowd(): void {
    const ctx = ensureAudioContext();
    if (!ctx) return;
    try {
      for (let index = 0; index < 10; index += 1) {
        const startAt = ctx.currentTime + index * 0.17 + Math.random() * 0.04;
        const burstLength = Math.max(1, Math.floor(ctx.sampleRate * 0.12));
        const burst = ctx.createBuffer(1, burstLength, ctx.sampleRate);
        const data = burst.getChannelData(0);
        for (let j = 0; j < data.length; j += 1) {
          data[j] = (Math.random() * 2 - 1) * Math.exp(-j / (data.length * 0.3));
        }
        const src = ctx.createBufferSource();
        src.buffer = burst;
        const hp = ctx.createBiquadFilter();
        hp.type = "highpass";
        hp.frequency.value = 1100;
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 7000;
        const gain = ctx.createGain();
        const level = index < 4 ? 0.11 + index * 0.04 : 0.25 - index * 0.016;
        gain.gain.setValueAtTime(Math.max(0.05, level), startAt);
        gain.gain.linearRampToValueAtTime(0, startAt + 0.14);
        src.connect(hp);
        hp.connect(lp);
        lp.connect(gain);
        gain.connect(ctx.destination);
        src.start(startAt);
        src.stop(startAt + 0.17);
      }
      playNoise(2.6, 750, 750, 0.3, 0, "lowpass");
    } catch {
      // Ignore transient audio errors.
    }
  }

  function playWin(kind: "nothing" | "win" | "grand"): void {
    if (kind === "nothing") {
      playOsc(370, "sawtooth", 0.26, 0.08, 0);
      playOsc(311, "sawtooth", 0.26, 0.08, 0.18);
      playOsc(262, "sawtooth", 0.26, 0.08, 0.36);
      return;
    }
    if (kind === "grand") {
      const tones: Array<[number, number]> = [
        [523, 0],
        [659, 0.1],
        [784, 0.2],
        [1047, 0.32],
        [1319, 0.46],
        [1568, 0.9]
      ];
      for (const [frequency, delaySec] of tones) {
        playOsc(frequency, "triangle", 0.22, 0.2, delaySec);
      }
      playNoise(2.4, 400, 200, 0, 0.3, "lowpass");
      setTimeout(() => {
        playCrowd();
      }, 180);
      return;
    }
    const normalTones: Array<[number, number]> = [
      [523, 0],
      [659, 0.12],
      [784, 0.26],
      [1047, 0.4]
    ];
    for (const [frequency, delaySec] of normalTones) {
      playOsc(frequency, "triangle", 0.22, 0.16, delaySec);
    }
  }

  function easeOutQuint(t: number): number {
    return 1 - (1 - t) ** 5;
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
    const innerRadius = 42;
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

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, outerRadius, start, end);
      ctx.closePath();
      ctx.clip();

      ctx.fillStyle = segment.color;
      ctx.fillRect(0, 0, width, height);

      if (segment.striped) {
        ctx.save();
        ctx.globalAlpha = 0.12;
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 3;
        const stripeStep = 11;
        for (let offset = -outerRadius * 2; offset <= outerRadius * 2; offset += stripeStep) {
          ctx.beginPath();
          ctx.moveTo(centerX + offset - outerRadius, centerY - outerRadius);
          ctx.lineTo(centerX + offset + outerRadius, centerY + outerRadius);
          ctx.stroke();
        }
        ctx.restore();
      }

      const vignette = ctx.createRadialGradient(
        centerX + Math.cos(mid) * outerRadius * 0.78,
        centerY + Math.sin(mid) * outerRadius * 0.78,
        0,
        centerX,
        centerY,
        outerRadius
      );
      vignette.addColorStop(0, "rgba(255,255,255,.08)");
      vignette.addColorStop(0.55, "rgba(0,0,0,0)");
      vignette.addColorStop(1, "rgba(0,0,0,.4)");
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();

      ctx.beginPath();
      ctx.arc(centerX, centerY, outerRadius, start, end);
      ctx.strokeStyle = segment.rim;
      ctx.lineWidth = 2.8;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(
        centerX + outerRadius * Math.cos(start),
        centerY + outerRadius * Math.sin(start)
      );
      ctx.strokeStyle = "rgba(0,0,0,.58)";
      ctx.lineWidth = 1.2;
      ctx.stroke();

      const iconDistance = outerRadius * 0.56;
      const textDistance = outerRadius * 0.69;
      const iconX = centerX + Math.cos(mid) * iconDistance;
      const iconY = centerY + Math.sin(mid) * iconDistance;
      const textX = centerX + Math.cos(mid) * textDistance;
      const textY = centerY + Math.sin(mid) * textDistance;

      ctx.save();
      ctx.translate(iconX, iconY);
      ctx.rotate(mid + Math.PI / 2);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = '700 15px "Montserrat", sans-serif';
      ctx.fillStyle = "#ffffff";
      ctx.shadowColor = segment.rim;
      ctx.shadowBlur = 6;
      ctx.fillText(segment.icon, 0, 0);
      ctx.restore();

      ctx.save();
      ctx.translate(textX, textY);
      ctx.rotate(mid + Math.PI / 2);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(0,0,0,.85)";
      ctx.shadowBlur = 3;
      ctx.fillStyle = segment.text;
      if (/^\d+$/.test(segment.labelTop) || segment.labelTop.includes("x")) {
        ctx.font = '700 16px "JetBrains Mono", monospace';
        ctx.fillText(segment.labelTop, 0, -5);
        ctx.font = '700 8px "Montserrat", sans-serif';
        ctx.fillStyle = "rgba(255,255,255,.7)";
        ctx.fillText(segment.labelBottom, 0, 8);
      } else {
        ctx.font = '700 10px "Montserrat", sans-serif';
        ctx.fillText(segment.labelTop, 0, -4);
        if (segment.labelBottom) {
          ctx.fillText(segment.labelBottom, 0, 8);
        }
      }
      ctx.restore();
    }

    const ringGradient = ctx.createLinearGradient(0, 0, width, height);
    ringGradient.addColorStop(0, "rgba(255,255,255,.5)");
    ringGradient.addColorStop(0.3, "rgba(245,197,66,.3)");
    ringGradient.addColorStop(0.7, "rgba(255,255,255,.1)");
    ringGradient.addColorStop(1, "rgba(0,0,0,.1)");
    ctx.beginPath();
    ctx.arc(centerX, centerY, outerRadius, 0, Math.PI * 2);
    ctx.strokeStyle = ringGradient;
    ctx.lineWidth = 7;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(centerX, centerY, innerRadius, 0, Math.PI * 2);
    ctx.fillStyle = "#050d08";
    ctx.fill();
    ctx.strokeStyle = "rgba(245,197,66,.35)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();
  }

  function resizeParticleCanvas(): void {
    const canvas = particleCanvas;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }

  function animateParticles(): void {
    const canvas = particleCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(dpr, dpr);

    particles = particles.filter((particle) => particle.life > 0);

    for (const particle of particles) {
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.vy += 0.26;
      particle.life -= particle.decay;
      particle.rot += particle.rotSpeed;

      ctx.save();
      ctx.globalAlpha = Math.max(0, particle.life);
      ctx.fillStyle = particle.color;
      ctx.translate(particle.x, particle.y);
      ctx.rotate((particle.rot * Math.PI) / 180);
      if (particle.square) {
        ctx.fillRect(-particle.size / 2, -particle.size / 3, particle.size, particle.size * 0.62);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, particle.size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    if (particles.length > 0) {
      particleFrameId = requestAnimationFrame(animateParticles);
    } else {
      particleFrameId = null;
    }
  }

  function launchParticles(accentColor: string, grand: boolean): void {
    resizeParticleCanvas();
    const canvas = particleCanvas;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const originX = rect.width / 2;
    const originY = rect.height * 0.42;
    const count = grand ? 140 : 80;
    const sizeScale = 0.75;
    const palette = [accentColor, "#F5C542", "#ffffff", "#1FBF6A", "#E53935", "#1E88E5", "#9333ea", "#FF6B35"];

    for (let index = 0; index < count; index += 1) {
      particles.push({
        x: originX,
        y: originY,
        vx: (Math.random() - 0.5) * (grand ? 22 : 14),
        vy: (Math.random() - 2.1) * (grand ? 15 : 10),
        color: palette[index % palette.length],
        size: (2.5 + Math.random() * 5.5) * sizeScale,
        life: 1,
        decay: 0.009 + Math.random() * 0.012,
        rot: Math.random() * 360,
        rotSpeed: (Math.random() - 0.5) * 16,
        square: Math.random() > 0.45
      });
    }

    if (particleFrameId !== null) {
      cancelAnimationFrame(particleFrameId);
    }
    particleFrameId = requestAnimationFrame(animateParticles);
    // Keep TypeScript aware that dpr is intentionally used in the resize path.
    void dpr;
  }

  function closeResultModal(): void {
    modal = { ...modal, visible: false };
  }

  function showResultModal(roll: SpinRollResponse, message: string): void {
    const theme = SPIN_SEGMENT_THEME[roll.reward.id];
    if (roll.reward.type === "none" || roll.reward.id === "nothing") {
      modal = {
        visible: true,
        icon: theme.icon,
        amount: "MISSED",
        desc: MISS_MESSAGES[Math.floor(Math.random() * MISS_MESSAGES.length)],
        accent: "#666666",
        buttonLabel: "TRY AGAIN",
        miss: true
      };
      return;
    }

    const isGrand = roll.reward.type === "kick" && roll.reward.value >= 200;
    modal = {
      visible: true,
      icon: theme.icon,
      amount: theme.display,
      desc: isGrand ? theme.desc : message || theme.desc,
      accent: theme.rim,
      buttonLabel: isGrand ? "CLAIM GRAND PRIZE" : "COLLECT REWARD",
      miss: false
    };
  }

  async function animateWheel(targetAngle: number, durationMs = 4400): Promise<void> {
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }

    const from = $spinStore.wheelAngle;
    const startAt = performance.now();
    const segmentDeg = 360 / SPIN_SEGMENT_ORDER.length;
    lastTickMod = 0;
    playWhir(durationMs / 1000);

    await new Promise<void>((resolve) => {
      const tick = (now: number) => {
        const progress = Math.min(1, (now - startAt) / durationMs);
        const eased = easeOutQuint(progress);
        const currentAngle = from + (targetAngle - from) * eased;
        spinStore.setWheelAngle(currentAngle);

        const speed = ((targetAngle - currentAngle) / durationMs) * 1000;
        if (speed > 20) {
          const mod = ((currentAngle % segmentDeg) + segmentDeg) % segmentDeg;
          if (Math.abs(mod - lastTickMod) > 2.8) {
            playTick(200 + Math.min(speed * 0.9, 600));
            lastTickMod = mod;
          }
        }

        if (progress < 1) {
          animationFrameId = requestAnimationFrame(tick);
          return;
        }

        animationFrameId = null;
        spinStore.setWheelAngle(targetAngle);
        playWhistle();
        resolve();
      };

      animationFrameId = requestAnimationFrame(tick);
    });
  }

  async function unlockSpin(type: SpinUnlockType): Promise<void> {
    if ($spinStore.isRolling || capReached) return;

    let activeSessionId = sessionId;
    if (!activeSessionId) {
      activeSessionId = await sessionStore.init(true);
      if (!activeSessionId) {
        const message = "Session is not ready. Please reopen the app and try again.";
        spinStore.setError(message);
        spinStore.setResult(message, false);
        return;
      }
    }

    spinStore.setError(null);

    try {
      const unlock = await spinStore.unlock(activeSessionId, type);
      if (type === "invite") {
        if (unlock.inviteBonus?.verified) {
          spinStore.setResult(formatUnlockMessage(type), true);
        } else {
          spinStore.setResult("Invite verification pending. Reward unlocks after F1 registration.", false);
        }
      } else {
        spinStore.setResult(formatUnlockMessage(type), true);
      }
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : "Unable to unlock extra spin.";
      const message =
        rawMessage === "invite_not_verified"
          ? "Invite bonus is locked until 1 referred user completes registration."
          : rawMessage;
      spinStore.setError(message);
      spinStore.setResult(message, false);
    }
  }

  async function rollNow(): Promise<void> {
    if ($spinStore.isRolling) return;

    let activeSessionId = sessionId;
    if (!activeSessionId) {
      activeSessionId = await sessionStore.init(true);
      if (!activeSessionId) {
        const message = "Session is not ready. Please reopen the app and try again.";
        spinStore.setResult(message, false);
        spinStore.setError(message);
        return;
      }
      await spinStore.refresh(activeSessionId, true);
    }

    if (spinState.left <= 0) {
      const message = "No spins left for today.";
      spinStore.setResult(message, false);
      return;
    }

    spinStore.setRolling(true);
    spinStore.setError(null);
    spinStore.setResult("Spinning...", false);
    closeResultModal();

    try {
      const roll = await spinStore.roll(activeSessionId, false);
      const targetAngle = getSpinTargetAngle($spinStore.wheelAngle, roll.reward.id, 7);

      await animateWheel(targetAngle, 4700);
      spinStore.applyRoll(roll);

      const result = formatSpinResult(roll.reward, roll.deltaApplied);
      spinStore.setResult(result.message, result.good);

      const isGrand = roll.reward.type === "kick" && roll.reward.value >= 200;
      if (roll.reward.type === "none" || roll.reward.id === "nothing") {
        playWin("nothing");
      } else if (isGrand) {
        playWin("grand");
        launchParticles(SPIN_SEGMENT_THEME[roll.reward.id].rim, true);
      } else {
        playWin("win");
        launchParticles(SPIN_SEGMENT_THEME[roll.reward.id].rim, false);
      }

      showResultModal(roll, result.message);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Spin failed.";
      spinStore.setResult(message, false);
      spinStore.setError(message);
    } finally {
      spinStore.setRolling(false);
    }
  }

  onMount(() => {
    const handleResize = (): void => {
      drawSpinWheel($spinStore.wheelAngle);
      resizeParticleCanvas();
    };

    window.addEventListener("resize", handleResize);
    handleResize();

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  });

  onDestroy(() => {
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    if (particleFrameId !== null) {
      cancelAnimationFrame(particleFrameId);
      particleFrameId = null;
    }
  });
</script>

<div id="page-spin" class="pg on">
  <div class="spin-page-wrap">
    <button
      class={`spin-snd-btn ${soundOn ? "" : "off"}`}
      type="button"
      aria-label={soundOn ? "Mute spin sound" : "Unmute spin sound"}
      on:click={toggleSound}
    >
      {soundOn ? "🔊" : "🔇"}
    </button>

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
      <canvas class="spin-particle-canvas" bind:this={particleCanvas} aria-hidden="true" />
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

  <div class={`spin-result-overlay ${modal.visible ? "show" : ""}`}>
    <button class="spin-result-backdrop" type="button" aria-label="Close reward modal" on:click={closeResultModal}></button>
    <div class={`spin-result-sheet ${modal.miss ? "miss" : ""}`} style={`--spin-accent:${modal.accent};`}>
      <div class="spin-result-drag"></div>
      <div class="spin-result-icon">{modal.icon}</div>
      <div class="spin-result-amount">{modal.amount}</div>
      <div class="spin-result-desc">{modal.desc}</div>
      <button class="spin-result-btn" type="button" on:click={closeResultModal}>{modal.buttonLabel}</button>
    </div>
  </div>
</div>
