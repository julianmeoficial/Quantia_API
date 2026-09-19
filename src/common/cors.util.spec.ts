import {
  VERCEL_PREVIEW_ORIGIN_RE,
  isAllowedCorsOrigin,
  parseCorsOrigins,
} from './cors.util';

describe('cors.util', () => {
  const allowlist = ['http://localhost:3000', 'https://quantia.example.com'];

  it('parses CSV origins', () => {
    expect(parseCorsOrigins(' http://a.com , https://b.com ')).toEqual([
      'http://a.com',
      'https://b.com',
    ]);
  });

  it('allows missing origin (non-browser)', () => {
    expect(isAllowedCorsOrigin(undefined, allowlist, false)).toBe(true);
  });

  it('allows exact allowlist match', () => {
    expect(
      isAllowedCorsOrigin('https://quantia.example.com', allowlist, false),
    ).toBe(true);
  });

  it('rejects arbitrary origins', () => {
    expect(
      isAllowedCorsOrigin('https://evil.example.com', allowlist, false),
    ).toBe(false);
  });

  it('rejects vercel preview when flag is off', () => {
    expect(
      isAllowedCorsOrigin(
        'https://my-app-git-main-team.vercel.app',
        allowlist,
        false,
      ),
    ).toBe(false);
  });

  it('allows vercel preview when flag is on', () => {
    expect(
      isAllowedCorsOrigin(
        'https://quantia-git-feat-abc123.vercel.app',
        allowlist,
        true,
      ),
    ).toBe(true);
  });

  it('vercel regex rejects lookalikes', () => {
    expect(VERCEL_PREVIEW_ORIGIN_RE.test('https://evil.com')).toBe(false);
    expect(VERCEL_PREVIEW_ORIGIN_RE.test('https://vercel.app')).toBe(false);
    expect(VERCEL_PREVIEW_ORIGIN_RE.test('http://foo.vercel.app')).toBe(false);
    expect(
      VERCEL_PREVIEW_ORIGIN_RE.test('https://foo.vercel.app.evil.com'),
    ).toBe(false);
    expect(VERCEL_PREVIEW_ORIGIN_RE.test('https://foo.vercel.app')).toBe(true);
  });
});
