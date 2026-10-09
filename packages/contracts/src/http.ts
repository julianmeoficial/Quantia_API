/**
 * Response headers readable by browser clients (CORS `exposedHeaders`).
 * Every 429 carries `Retry-After` in whole seconds, whatever limiter fired.
 */
export const HttpHeader = {
  RETRY_AFTER: 'Retry-After',
} as const;
export type HttpHeader = (typeof HttpHeader)[keyof typeof HttpHeader];

export const CORS_EXPOSED_HEADERS: readonly HttpHeader[] = [
  HttpHeader.RETRY_AFTER,
];
