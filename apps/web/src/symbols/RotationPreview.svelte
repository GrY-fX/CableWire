<script lang="ts">
  import type { Rotation, SymbolDef } from '@cablewire/core';
  import { symbolPreviewSvg } from './preview.ts';

  let { symbol }: { symbol: SymbolDef } = $props();

  const ROTATIONS: Rotation[] = [0, 90, 180, 270];

  let containers: HTMLDivElement[] = $state([]);
  $effect(() => {
    ROTATIONS.forEach((rotation, i) => {
      if (containers[i]) containers[i].innerHTML = symbolPreviewSvg(symbol, rotation);
    });
  });
</script>

<div class="previews">
  {#each ROTATIONS as rotation, i (rotation)}
    <figure>
      <div class="box" bind:this={containers[i]}></div>
      <figcaption>{rotation}°</figcaption>
    </figure>
  {/each}
</div>

<style>
  .previews {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.4rem;
    padding: 0 0.75rem 0.75rem;
  }
  figure {
    margin: 0;
    text-align: center;
  }
  .box {
    aspect-ratio: 1;
    background: #fff;
    border: 1px solid var(--border);
  }
  .box :global(svg) {
    width: 100%;
    height: 100%;
  }
  figcaption {
    font-size: 0.75rem;
    color: var(--muted);
  }
</style>
