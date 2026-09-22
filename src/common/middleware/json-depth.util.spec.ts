import { assertJsonDepth, jsonDepth } from './json-depth.util';

describe('jsonDepth', () => {
  it('returns 0 for primitives', () => {
    expect(jsonDepth('x', 10)).toBe(0);
    expect(jsonDepth(1, 10)).toBe(0);
    expect(jsonDepth(null, 10)).toBe(0);
  });

  it('measures nested object depth', () => {
    const deep = { a: { b: { c: { d: 1 } } } };
    expect(jsonDepth(deep, 10)).toBe(4);
  });

  it('assertJsonDepth rejects deeper than max', () => {
    let nest: Record<string, unknown> = { v: 1 };
    for (let i = 0; i < 12; i += 1) {
      nest = { child: nest };
    }
    expect(assertJsonDepth(nest, 10)).toBe(false);
    expect(assertJsonDepth({ a: 1 }, 10)).toBe(true);
  });
});
