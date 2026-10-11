import { describe, expect, it } from 'vitest';
import { CODE_ALPHABET, generateCode } from '../src/services/code';

describe('generateCode', () => {
  it('produces 6 character codes from the unambiguous alphabet', () => {
    for (let i = 0; i < 500; i++) {
      const code = generateCode();
      expect(code).toHaveLength(6);
      for (const ch of code) expect(CODE_ALPHABET).toContain(ch);
    }
  });

  it('never uses look-alike characters', () => {
    expect(CODE_ALPHABET).not.toMatch(/[01OIL]/);
  });

  it('does not repeat itself in a realistic batch', () => {
    const codes = new Set(Array.from({ length: 2000 }, () => generateCode()));
    expect(codes.size).toBeGreaterThan(1990);
  });
});
