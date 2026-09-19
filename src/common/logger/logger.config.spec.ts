import { LOGGER_REDACT_PATHS, buildPinoParams } from './logger.config';

describe('logger.config', () => {
  it('redacts authorization, passwords and tokens', () => {
    expect(LOGGER_REDACT_PATHS).toEqual(
      expect.arrayContaining([
        'req.headers.authorization',
        'req.body.password',
        'req.body.refreshToken',
        'req.body.accessToken',
        'req.body.verification_token',
      ]),
    );
  });

  it('emits structured JSON config (no pretty transport)', () => {
    for (const env of ['production', 'development', 'test'] as const) {
      const params = buildPinoParams(env);
      const pinoHttp = params.pinoHttp as { transport?: unknown };
      expect(pinoHttp.transport).toBeUndefined();
    }
  });

  it('exposes genReqId that echoes or creates X-Request-Id', () => {
    const params = buildPinoParams('test');
    const pinoHttp = params.pinoHttp as {
      genReqId: (
        req: { headers: Record<string, string | string[] | undefined> },
        res: { setHeader: (k: string, v: string) => void },
      ) => string;
    };

    const headers: Record<string, string> = {};
    const res = {
      setHeader: (k: string, v: string) => {
        headers[k] = v;
      },
    };

    const echoed = pinoHttp.genReqId(
      { headers: { 'x-request-id': 'client-rid-1' } },
      res,
    );
    expect(echoed).toBe('client-rid-1');
    expect(headers['X-Request-Id']).toBe('client-rid-1');

    const generated = pinoHttp.genReqId({ headers: {} }, res);
    expect(generated).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(headers['X-Request-Id']).toBe(generated);
  });
});
