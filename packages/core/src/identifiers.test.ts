import { describe, expect, it } from 'vitest';
import { createId } from './identifiers';

describe('createId', () => {
  it('generates unique ids', () => {
    const a = createId();
    const b = createId();
    expect(a).not.toBe(b);
  });

  it('applies an optional prefix', () => {
    expect(createId('project')).toMatch(/^project_[0-9a-f-]{36}$/i);
  });

  it('omits the separator when no prefix is given', () => {
    expect(createId()).toMatch(/^[0-9a-f-]{36}$/i);
  });
});
