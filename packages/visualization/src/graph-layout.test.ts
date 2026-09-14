import { describe, expect, it } from 'vitest';
import { getLayoutOptions } from './graph-layout';

describe('getLayoutOptions', () => {
  it('uses the registered elk layout, top-to-bottom', () => {
    const options = getLayoutOptions() as unknown as {
      name: string;
      elk: { algorithm: string; 'elk.direction': string };
    };
    expect(options.name).toBe('elk');
    expect(options.elk.algorithm).toBe('layered');
    expect(options.elk['elk.direction']).toBe('DOWN');
  });
});
