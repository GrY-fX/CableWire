<script lang="ts">
  import { symbolBounds } from '@cablewire/core';
  import type { Rotation, SymbolDef } from '@cablewire/core';
  import { buildElementNode, nodeToSvg, PAPER_CSS } from '@cablewire/render';

  let { symbol }: { symbol: SymbolDef } = $props();

  const ROTATIONS: Rotation[] = [0, 90, 180, 270];
  /** Sample values, so placeholders show something realistic. */
  const SAMPLE = { label: 'K1', function: 'Funzione', location: '+Q1', plc_address: 'I0.0' };

  function preview(rotation: Rotation): string {
    const info = { ...symbol.defaultInfo, ...SAMPLE };
    const node = buildElementNode({ x: 0, y: 0, rotation, mirrored: false, info }, symbol);
    const b = symbolBounds(symbol) ?? { minX: -5, minY: -5, maxX: 5, maxY: 5 };
    // Same box for every rotation, with a little room for texts.
    const r = Math.max(Math.abs(b.minX), Math.abs(b.maxX), Math.abs(b.minY), Math.abs(b.maxY)) + 2;
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-r} ${-r} ${2 * r} ${2 * r}">` +
      `<style>${PAPER_CSS}</style>${nodeToSvg(node)}</svg>`
    );
  }

  let containers: HTMLDivElement[] = $state([]);
  $effect(() => {
    ROTATIONS.forEach((rotation, i) => {
      if (containers[i]) containers[i].innerHTML = preview(rotation);
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
