<script lang="ts">
  // Drawn padlock: emoji 🔒/🔓 look almost the same at small sizes on Windows.
  let { locked }: { locked: boolean } = $props();
</script>

<svg class="lock-icon" class:locked viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
  {#if locked}
    <path d="M5 7V5a3 3 0 0 1 6 0v2" />
  {:else}
    <!-- Shackle raised and open on the right. -->
    <path d="M5 7V4a3 3 0 0 1 6 0v0.5" />
  {/if}
  <rect x="3" y="7" width="10" height="7" rx="1.5" />
</svg>

<style>
  .lock-icon {
    display: block;
    fill: none;
    stroke: #8a929c;
    stroke-width: 1.6;
    stroke-linecap: round;
  }
  .lock-icon rect {
    fill: #e9ecef;
  }
  .lock-icon.locked {
    stroke: #a15c00;
  }
  .lock-icon.locked rect {
    fill: #ffe2a8;
  }
</style>
