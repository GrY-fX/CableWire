// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { moveItems, setElementInfo } from '@cablewire/core';
import { buildScene } from './build.ts';
import { DomRenderer } from './dom.ts';
import { toSvgString } from './svg-string.ts';
import { fixture, K1, K2, must, W1 } from './fixture.test-utils.ts';

describe('toSvgString', () => {
  it('produces a well-formed, real-size SVG without screen-only marks', () => {
    const { store, sheet, split } = fixture();
    split();
    const svg = toSvgString(buildScene(store.doc, sheet));
    const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml');
    expect(parsed.querySelector('parsererror')).toBeNull();
    expect(svg).toMatch(/^<svg [^>]*width="420mm" height="297mm" viewBox="0 0 420 297"/);
    expect(svg).not.toContain('terminal-mark');
    expect(toSvgString(buildScene(store.doc, sheet), { screen: true })).toContain('terminal-mark');
    expect(svg).toMatchSnapshot();
  });

  it('escapes texts', () => {
    const { store, sheet } = fixture();
    must(store, setElementInfo, { id: K1, set: { label: '<K&1>' } });
    expect(toSvgString(buildScene(store.doc, sheet))).toContain('&lt;K&amp;1&gt;');
  });
});

describe('DomRenderer', () => {
  function mount() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    document.body.append(svg);
    return { svg, renderer: new DomRenderer(svg) };
  }

  it('renders items as keyed groups in layers', () => {
    const { store, sheet } = fixture();
    const { svg, renderer } = mount();
    renderer.render(buildScene(store.doc, sheet));
    expect(svg.getAttribute('viewBox')).toBe('0 0 420 297');
    const keys = [...svg.querySelectorAll('[data-key]')].map((g) => g.getAttribute('data-key'));
    expect(keys).toEqual(['frame', `wire:${W1}`, `element:${K1}`, `element:${K2}`]);
  });

  it('replaces only the groups whose drawing changed', () => {
    const { store, sheet } = fixture();
    const { svg, renderer } = mount();
    renderer.render(buildScene(store.doc, sheet));
    const group = (key: string) => svg.querySelector(`[data-key="${key}"]`)!;
    const before = new Map(
      ['frame', `wire:${W1}`, `element:${K1}`, `element:${K2}`].map((k) => [
        k,
        group(k).firstChild,
      ]),
    );

    must(store, moveItems, { elements: [K1], dx: 5, dy: 0 });
    renderer.render(buildScene(store.doc, sheet));

    expect(group('frame').firstChild).toBe(before.get('frame'));
    expect(group(`element:${K2}`).firstChild).toBe(before.get(`element:${K2}`));
    expect(group(`element:${K1}`).firstChild).not.toBe(before.get(`element:${K1}`));
    expect(group(`wire:${W1}`).firstChild).not.toBe(before.get(`wire:${W1}`));
  });

  it('removes deleted items and applies visual states', () => {
    const { store, sheet } = fixture();
    const { svg, renderer } = mount();
    renderer.render(buildScene(store.doc, sheet));
    renderer.setState({ selected: [`element:${K1}`], highlighted: [`wire:${W1}`] });
    expect(svg.querySelector(`[data-key="element:${K1}"]`)!.getAttribute('class')).toBe(
      'cw-item cw-selected',
    );
    expect(svg.querySelector(`[data-key="wire:${W1}"]`)!.getAttribute('class')).toBe(
      'cw-item cw-highlighted',
    );

    store.undo(); // removes the wire number
    store.undo(); // removes the bends
    store.undo(); // removes the wire
    renderer.render(buildScene(store.doc, sheet));
    expect(svg.querySelector(`[data-key="wire:${W1}"]`)).toBeNull();
    expect(renderer.keyAt(svg.querySelector(`[data-key="element:${K1}"] path`))).toBe(
      `element:${K1}`,
    );
  });
});
