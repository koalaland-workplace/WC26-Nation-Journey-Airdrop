<script lang="ts">
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import AppHeader from "./lib/components/AppHeader.svelte";
  import BottomNav from "./lib/components/BottomNav.svelte";
  import HomePage from "./lib/pages/HomePage.svelte";
  import InfoPage from "./lib/pages/InfoPage.svelte";
  import SpinPage from "./lib/pages/SpinPage.svelte";
  import QuizPage from "./lib/pages/QuizPage.svelte";
  import WarsPage from "./lib/pages/WarsPage.svelte";
  import EarnPage from "./lib/pages/EarnPage.svelte";
  import { uiStore, type AppPage, type InfoTab } from "./lib/stores/ui.store";
  import { hotSignalsStore } from "./lib/stores/hot-signals.store";
  import { languageStore } from "./lib/stores/language.store";
  import { sessionStore } from "./lib/stores/session.store";
  import { spinStore } from "./lib/stores/spin.store";
  import {
    applyDomTranslations,
    destroyDomTranslationObserver,
    initDomTranslationObserver,
    queueDomTranslations
  } from "./lib/modules/i18n/runtime";

  function navigate(page: AppPage): void {
    uiStore.navigate(page);
  }

  function openInfoTab(tab: InfoTab): void {
    uiStore.openInfoTab(tab);
  }

  function setInfoTab(tab: InfoTab): void {
    uiStore.setInfoTab(tab);
  }

  onMount(() => {
    const telegram = (window as typeof window & {
      Telegram?: { WebApp?: { ready?: () => void; expand?: () => void } };
    }).Telegram?.WebApp;
    telegram?.ready?.();
    telegram?.expand?.();

    languageStore.init();
    const unsubscribeLanguage = languageStore.subscribe((state) => {
      applyDomTranslations(state.current);
    });

    initDomTranslationObserver(() => get(languageStore).current);
    queueDomTranslations(get(languageStore).current);

    void hotSignalsStore.refresh(5);
    void (async () => {
      const sessionId = await sessionStore.init();
      spinStore.hydrateFromSession(get(sessionStore));
      if (sessionId) {
        await spinStore.refresh(sessionId, true);
      }
    })();

    return () => {
      unsubscribeLanguage();
      destroyDomTranslationObserver();
    };
  });
</script>

<div class="app-root">
  <AppHeader />

  {#if $uiStore.page === "home"}
    <HomePage onNavigate={navigate} onOpenInfoTab={openInfoTab} />
  {:else if $uiStore.page === "info"}
    <InfoPage activeTab={$uiStore.infoTab} onChangeTab={setInfoTab} onNavigate={navigate} />
  {:else if $uiStore.page === "wars"}
    <WarsPage view="wars" onNavigate={navigate} />
  {:else if $uiStore.page === "penalty"}
    <WarsPage view="penalty" onNavigate={navigate} />
  {:else if $uiStore.page === "spin"}
    <SpinPage />
  {:else if $uiStore.page === "quiz"}
    <QuizPage onNavigate={navigate} />
  {:else}
    <EarnPage onNavigate={navigate} />
  {/if}

  <BottomNav
    currentPage={$uiStore.page}
    currentInfoTab={$uiStore.infoTab}
    onNavigate={navigate}
    onOpenInfoTab={openInfoTab}
  />
</div>
