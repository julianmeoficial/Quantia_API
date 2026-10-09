import {
  VERCEL_PREVIEW_ORIGIN_RE,
  createHttpCorsOptions,
  isAllowedCorsOrigin,
  parseCorsOrigins,
} from './cors.util';

describe('cors.util', () => {
  const allowlist = ['http://localhost:3000', 'https://quantia.example.com'];

  it('builds HTTP CORS options that expose Retry-After with credentials', () => {
    const options = createHttpCorsOptions(allowlist, false);
    expect(options.credentials).toBe(true);
    expect(options.exposedHeaders).toEqual(['Retry-After']);
    expect(typeof options.origin).toBe('function');
  });

  it('HTTP CORS options keep the allowlist (never wildcard)', () => {
    const options = createHttpCorsOptions(allowlist, false);
    const origin = options.origin as (
      origin: string | undefined,
      cb: (err: Error | null, allow?: boolean) => void,
    ) => void;
    const results: Array<boolean | undefined> = [];
    origin('https://quantia.example.com', (_e, allow) => results.push(allow));
    origin('https://evil.example.com', (_e, allow) => results.push(allow));
    expect(results).toEqual([true, false]);
  });

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
