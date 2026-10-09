import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * 429 that knows how long the client must wait. `HttpExceptionFilter`
 * turns `retryAfterSeconds` into the `Retry-After` response header.
 */
export class TooManyRequestsException extends HttpException {
  readonly retryAfterSeconds: number;

  constructor(message: string, retryAfterSeconds: number) {
    super(message, HttpStatus.TOO_MANY_REQUESTS);
    this.retryAfterSeconds = Math.max(1, Math.ceil(retryAfterSeconds));
  }
}
