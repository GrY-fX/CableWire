<script lang="ts">
  import { onMount } from 'svelte';
  import { FONT_FAMILY } from '@cablewire/render';
  import fontUrl from '@cablewire/render/assets/osifont.woff?url';
  import { Library } from './library/library.svelte.ts';
  import SchemaWorkspace from './schema/SchemaWorkspace.svelte';
  import SymbolWorkspace from './symbols/SymbolWorkspace.svelte';

  type Tab = 'schema' | 'symbols';
  const tabs: { id: Tab; label: string }[] = [
    { id: 'schema', label: 'Schema' },
    { id: 'symbols', label: 'Simboli' },
  ];
  let tab = $state<Tab>(location.hash === '#simboli' ? 'symbols' : 'schema');

  /** Shared by both workspaces, so a symbol saved in Simboli is ready to place in Schema. */
  const library = new Library();

  function open(next: Tab) {
    tab = next;
    history.replaceState(null, '', next === 'symbols' ? '#simboli' : '#schema');
  }

  onMount(() => {
    new FontFace(FONT_FAMILY, `url(${fontUrl})`).load().then((font) => document.fonts.add(font));
    void library.open();
    return () => library.close();
  });
</script>

<div class="app">
  <header>
    <strong>CableWire</strong>
    <nav>
      {#each tabs as t (t.id)}
        <button class:active={tab === t.id} onclick={() => open(t.id)}>{t.label}</button>
      {/each}
    </nav>
  </header>
  <!-- Both workspaces stay mounted so switching tab keeps their state. -->
  <div class="content" hidden={tab !== 'schema'}>
    <SchemaWorkspace active={tab === 'schema'} {library} />
  </div>
  <div class="content" hidden={tab !== 'symbols'}>
    <SymbolWorkspace active={tab === 'symbols'} {library} />
  </div>
</div>

<style>
  :global(:root) {
    --bg: #e9ecef;
    --panel: #fff;
    --border: #cfd4da;
    --muted: #667;
    --accent: #1d6fe0;
    --error: #c62828;
    --warning: #a15c00;
  }
  :global(html, body) {
    margin: 0;
    height: 100%;
    font-family: system-ui, sans-serif;
    font-size: 14px;
    color: #1d2329;
  }
  :global(button, input, select) {
    font: inherit;
  }
  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: var(--bg);
  }
  header {
    display: flex;
    align-items: center;
    gap: 1.5rem;
    padding: 0 1rem;
    height: 2.75rem;
    background: var(--panel);
    border-bottom: 1px solid var(--border);
  }
  nav {
    display: flex;
    gap: 0.25rem;
    height: 100%;
  }
  nav button {
    border: none;
    background: none;
    padding: 0 0.9rem;
    border-bottom: 2px solid transparent;
    cursor: pointer;
  }
  nav button.active {
    border-bottom-color: var(--accent);
    color: var(--accent);
    font-weight: 600;
  }
  .content {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
  .content[hidden] {
    display: none;
  }
</style>
