import {
  buildAccessSignOptions,
  buildAccessVerifyOptions,
  JWT_ACCESS_ALGORITHM,
} from './jwt-options';
import type { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../config/env.schema';

describe('jwt-options', () => {
  const config = {
    get: (key: keyof EnvConfig) => {
      const map: Partial<Record<keyof EnvConfig, string>> = {
        JWT_ACCESS_SECRET: 'quantia-test-access-secret-change-me-32',
        JWT_ACCESS_TTL: '15m',
        JWT_ISSUER: 'quantia-api',
        JWT_AUDIENCE: 'quantia-clients',
      };
      return map[key];
    },
  } as unknown as ConfigService<EnvConfig, true>;

  it('signs with HS256 issuer and audience', () => {
    const sign = buildAccessSignOptions(config);
    expect(sign.algorithm).toBe(JWT_ACCESS_ALGORITHM);
    expect(sign.issuer).toBe('quantia-api');
    expect(sign.audience).toBe('quantia-clients');
  });

  it('verifies only HS256 with iss/aud', () => {
    const verify = buildAccessVerifyOptions(config);
    expect(verify.algorithms).toEqual(['HS256']);
    expect(verify.issuer).toBe('quantia-api');
    expect(verify.audience).toBe('quantia-clients');
  });
});
