import type { ConfigService } from '@nestjs/config';
import type { JwtSignOptions, JwtVerifyOptions } from '@nestjs/jwt';
import type { EnvConfig } from '../config/env.schema';

/** Only HS256 — rejects `alg: none` and algorithm confusion. */
export const JWT_ACCESS_ALGORITHM = 'HS256' as const;

export function getJwtIssuer(config: ConfigService<EnvConfig, true>): string {
  return config.get('JWT_ISSUER', { infer: true });
}

export function getJwtAudience(config: ConfigService<EnvConfig, true>): string {
  return config.get('JWT_AUDIENCE', { infer: true });
}

export function buildAccessSignOptions(
  config: ConfigService<EnvConfig, true>,
): JwtSignOptions {
  const expiresIn = config.get('JWT_ACCESS_TTL', { infer: true });
  return {
    secret: config.get('JWT_ACCESS_SECRET', { infer: true }),
    algorithm: JWT_ACCESS_ALGORITHM,
    issuer: getJwtIssuer(config),
    audience: getJwtAudience(config),
    expiresIn: expiresIn as `${number}${'s' | 'm' | 'h' | 'd'}`,
  };
}

export function buildAccessVerifyOptions(
  config: ConfigService<EnvConfig, true>,
): JwtVerifyOptions {
  return {
    secret: config.get('JWT_ACCESS_SECRET', { infer: true }),
    algorithms: [JWT_ACCESS_ALGORITHM],
    issuer: getJwtIssuer(config),
    audience: getJwtAudience(config),
  };
}
