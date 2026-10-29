<script lang="ts">
  import type { SymbolDef } from '@cablewire/core';
  import { symbolPreviewSvg } from '../symbols/preview.ts';

  let { symbol }: { symbol: SymbolDef } = $props();
  // As an image: cheap for long lists (the system font replaces osifont, fine at this size).
  const src = $derived(
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(symbolPreviewSvg(symbol, 0, 1))}`,
  );
</script>

<img class="thumb" {src} alt="" />

<style>
  .thumb {
    display: block;
    flex: none;
    width: 34px;
    height: 34px;
    background: #fff;
    border: 1px solid var(--border);
    border-radius: 3px;
  }
</style>
