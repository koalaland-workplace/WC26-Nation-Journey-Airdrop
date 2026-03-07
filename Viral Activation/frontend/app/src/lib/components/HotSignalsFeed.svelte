<script lang="ts">
  import type { HotSignal } from "../modules/news/types";
  import { timeAgo } from "../modules/news/utils";

  export let items: HotSignal[] = [];
</script>

<div class="pulse-feed">
  {#each items.slice(0, 5) as item (item.id)}
    <article class="pulse-post">
      <div class="pulse-head">
        <div class="pulse-avatar sig">📡</div>
        <div class="pulse-meta">
          <div class="pulse-name">
            WC26 Hot Signal
            <span class="pulse-handle">@wc26_hotdesk</span>
            <span class="pulse-dot">·</span>
            <span class="pulse-time">{timeAgo(item.publishedAt)}</span>
          </div>
          <div class="pulse-tag">{item.sourceName ?? "Live feed"}</div>
        </div>
      </div>

      <div class="pulse-main">
        <div class="pulse-body">
          <span class="pulse-alert-icon" aria-hidden="true">🚨</span>
          <span>{item.title}</span>
        </div>
        {#if item.imageUrl}
          <div class="pulse-media-wrap">
            <img class="pulse-media" src={item.imageUrl} alt={item.title} loading="lazy" />
          </div>
        {/if}
        {#if item.summary}
          <div class="pulse-hot-meta">{item.summary}</div>
        {/if}
        <div class="pulse-actions" aria-label="Signal actions">
          <span class="pulse-action"><span aria-hidden="true">♡</span> Like</span>
          <span class="pulse-action"><span aria-hidden="true">↗</span> Share</span>
          <span class="pulse-action"><span aria-hidden="true">💬</span> Comments</span>
        </div>
      </div>
    </article>
  {/each}
</div>
