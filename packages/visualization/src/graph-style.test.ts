import type { Css } from 'cytoscape';
import { describe, expect, it } from 'vitest';
import { getStylesheet } from './graph-style';

function nodeStyle(
  sheet: ReturnType<typeof getStylesheet>,
  selector: string,
): Css.Node | undefined {
  const rule = sheet.find((candidate) => candidate.selector === selector);
  if (!rule || !('style' in rule)) {
    return undefined;
  }
  return rule.style as Css.Node;
}

describe('getStylesheet', () => {
  it('styles nodes by their data-driven shape/color rather than a fixed per-type selector', () => {
    const style = nodeStyle(getStylesheet('light'), 'node');
    expect(style?.shape).toBe('data(shape)');
    expect(style?.['border-color']).toBe('data(color)');
  });

  it('flags low-confidence nodes with a dashed border', () => {
    const sheet = getStylesheet('light');
    const rule = sheet.find((r) => r.selector === 'node[?lowConfidence]');
    expect(rule).toBeDefined();
  });

  it('produces distinct node backgrounds for light and dark themes', () => {
    const lightBg = nodeStyle(getStylesheet('light'), 'node')?.['background-color'];
    const darkBg = nodeStyle(getStylesheet('dark'), 'node')?.['background-color'];
    expect(lightBg).not.toBe(darkBg);
  });
});
