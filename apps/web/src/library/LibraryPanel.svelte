<script lang="ts">
  import type { SymbolId } from '@cablewire/core';
  import { groupByCategory, matches } from './logic.ts';
  import type { LibraryItem } from './logic.ts';
  import SymbolThumb from './SymbolThumb.svelte';

  let {
    items,
    currentId,
    onopen,
    onfavorite,
    onremove,
  }: {
    items: LibraryItem[];
    currentId: SymbolId | undefined;
    onopen: (item: LibraryItem) => void;
    onfavorite: (item: LibraryItem) => void;
    onremove: (item: LibraryItem) => void;
  } = $props();

  let query = $state('');
  const found = $derived(items.filter((i) => matches(i.symbol, query)));
  const sections = $derived([
    { title: 'Preferiti', groups: [{ name: '', items: found.filter((i) => i.favorite) }] },
    { title: 'Personali', groups: groupByCategory(found.filter((i) => i.source === 'personal')) },
    { title: 'Base', groups: groupByCategory(found.filter((i) => i.source === 'base')) },
  ]);
</script>

<input class="search" type="search" placeholder="Cerca per nome o categoria" bind:value={query} />

{#each sections as section (section.title)}
  {@const count = section.groups.reduce((n, g) => n + g.items.length, 0)}
  <details open>
    <summary>{section.title} <span class="count">{count}</span></summary>
    {#if count === 0}
      <p class="empty">
        {section.title === 'Preferiti'
          ? 'Clicca ☆ su un simbolo per averlo qui.'
          : section.title === 'Personali' && !query
            ? 'Salva un simbolo per trovarlo qui.'
            : 'Nessun simbolo.'}
      </p>
    {/if}
    {#each section.groups as group (group.name)}
      {#if group.items.length}
        {#if group.name}<h5>{group.name}</h5>{/if}
        <ul>
          {#each group.items as item (item.source + item.symbol.id)}
            <li class:current={item.symbol.id === currentId}>
              <button class="open" title={item.symbol.name} onclick={() => onopen(item)}>
                <SymbolThumb symbol={item.symbol} />
                <span class="name">{item.symbol.name}</span>
              </button>
              <button
                class="icon"
                title={item.favorite ? 'Togli dai preferiti' : 'Aggiungi ai preferiti'}
                onclick={() => onfavorite(item)}>{item.favorite ? '★' : '☆'}</button
              >
              {#if item.source === 'personal'}
                <button class="icon" title="Elimina dalla libreria" onclick={() => onremove(item)}
                  >×</button
                >
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    {/each}
  </details>
{/each}

<style>
  .search {
    width: 100%;
    box-sizing: border-box;
    padding: 0.3rem 0.4rem;
    border: 1px solid var(--border);
    border-radius: 3px;
    margin-bottom: 0.4rem;
  }
  details {
    margin-bottom: 0.4rem;
  }
  summary {
    cursor: pointer;
    font-weight: 600;
    padding: 0.2rem 0;
  }
  .count {
    font-weight: normal;
    color: var(--muted);
    font-size: 0.8rem;
  }
  h5 {
    margin: 0.4rem 0 0.15rem;
    font-size: 0.75rem;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  li {
    display: flex;
    align-items: center;
    border-radius: 3px;
  }
  li:hover {
    background: #f1f3f5;
  }
  li.current {
    background: #e3edfc;
  }
  .open {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.15rem;
    border: none;
    background: none;
    text-align: left;
    cursor: pointer;
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.85rem;
  }
  .icon {
    border: none;
    background: none;
    color: var(--muted);
    cursor: pointer;
    padding: 0 0.2rem;
    font-size: 0.95rem;
  }
  .empty {
    color: var(--muted);
    font-size: 0.8rem;
    margin: 0.2rem 0 0.4rem;
  }
</style>
