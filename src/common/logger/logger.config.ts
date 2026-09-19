import { randomUUID } from 'crypto';
import type { IncomingMessage, ServerResponse } from 'http';
import type { Params } from 'nestjs-pino';

const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.body.password',
  'req.body.refreshToken',
  'req.body.accessToken',
  'req.body.token',
  'req.body.verification_token',
  'res.headers["set-cookie"]',
];

function resolveRequestId(req: IncomingMessage, res: ServerResponse): string {
  const header = req.headers['x-request-id'];
  const fromHeader = Array.isArray(header) ? header[0] : header;
  const id =
    typeof fromHeader === 'string' && fromHeader.trim().length > 0
      ? fromHeader.trim()
      : randomUUID();
  res.setHeader('X-Request-Id', id);
  return id;
}

export function buildPinoParams(_nodeEnv: string): Params {
  // Always structured JSON (Railway / Hobby retention consumes stdout JSON).
  void _nodeEnv;
  return {
    pinoHttp: {
      genReqId: resolveRequestId,
      customProps: () => ({
        commitSha:
          process.env.RAILWAY_GIT_COMMIT_SHA ??
          process.env.GIT_COMMIT_SHA ??
          undefined,
      }),
      redact: {
        paths: REDACT_PATHS,
        censor: '[Redacted]',
      },
      serializers: {
        req: (req: {
          id?: string;
          method?: string;
          url?: string;
          headers?: Record<string, unknown>;
          remoteAddress?: string;
        }) => ({
          id: req.id,
          method: req.method,
          url: req.url,
          remoteAddress: req.remoteAddress,
          // Never dump full headers (may contain Authorization).
          userAgent: req.headers?.['user-agent'],
        }),
      },
      autoLogging: {
        ignore: (req: IncomingMessage) =>
          req.url === '/api/v1/health' || req.url === '/api/v1/health/',
      },
      quietReqLogger: true,
    },
  };
}

/** Exported for unit tests — paths that must stay redacted. */
export const LOGGER_REDACT_PATHS = REDACT_PATHS;
