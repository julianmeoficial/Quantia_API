import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { HttpHeader } from '@quantia/contracts';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { MulterError } from 'multer';
import { TooManyRequestsException } from '../exceptions/too-many-requests.exception';
import { SecurityMetricsService } from '../security-metrics.service';

const RETRY_AFTER_LOWER = HttpHeader.RETRY_AFTER.toLowerCase();
const RETRY_AFTER_PREFIX = `${RETRY_AFTER_LOWER}-`;
const TOO_MANY_REQUESTS: number = HttpStatus.TOO_MANY_REQUESTS;

@Catch()
@Injectable()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  constructor(private readonly securityMetrics: SecurityMetricsService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const mapped = this.mapException(exception);
    if (mapped.status >= 500) {
      const stack =
        exception instanceof Error ? exception.stack : String(exception);
      this.logger.error(
        `Unhandled error on ${request.method} ${request.url}`,
        stack,
      );
    }

    void this.securityMetrics.recordHttpStatus(mapped.status);

    if (mapped.status === TOO_MANY_REQUESTS) {
      this.applyRetryAfter(exception, response);
    }

    response.status(mapped.status).json({
      statusCode: mapped.status,
      message: mapped.message,
      // Optional stable machine-readable code (e.g. AVATAR_REQUIRED); additive.
      ...(mapped.code ? { code: mapped.code } : {}),
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }

  private mapException(exception: unknown): {
    status: number;
    message: string;
    code?: string;
  } {
    if (exception instanceof MulterError) {
      if (exception.code === 'LIMIT_FILE_SIZE') {
        return {
          status: HttpStatus.PAYLOAD_TOO_LARGE,
          message: 'File too large',
        };
      }
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Invalid upload',
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.mapPrismaError(exception);
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      let message = 'Request failed';
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (
        exceptionResponse &&
        typeof exceptionResponse === 'object' &&
        'message' in exceptionResponse
      ) {
        const rawMessage = (exceptionResponse as { message: string | string[] })
          .message;
        message = Array.isArray(rawMessage)
          ? rawMessage.join(', ')
          : rawMessage;
      }
      const code =
        exceptionResponse &&
        typeof exceptionResponse === 'object' &&
        'code' in exceptionResponse &&
        typeof exceptionResponse.code === 'string'
          ? (exceptionResponse as { code: string }).code
          : undefined;
      return { status, message, code };
    }

    // express body-parser entity too large
    if (
      exception &&
      typeof exception === 'object' &&
      'type' in exception &&
      (exception as { type?: string }).type === 'entity.too.large'
    ) {
      return {
        status: HttpStatus.PAYLOAD_TOO_LARGE,
        message: 'Request body too large',
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    };
  }

  /**
   * @nestjs/throttler only writes plain `Retry-After` for the `default`
   * limiter; named limiters write `Retry-After-<name>`. Browsers can read a
   * single, CORS-exposed `Retry-After`, so collapse them to the longest wait.
   */
  private applyRetryAfter(exception: unknown, response: Response): void {
    const candidates: number[] = [];

    if (exception instanceof TooManyRequestsException) {
      candidates.push(exception.retryAfterSeconds);
    }

    const headers =
      typeof response.getHeaders === 'function' ? response.getHeaders() : {};
    for (const [name, value] of Object.entries(headers)) {
      const lower = name.toLowerCase();
      if (
        lower !== RETRY_AFTER_LOWER &&
        !lower.startsWith(RETRY_AFTER_PREFIX)
      ) {
        continue;
      }
      const seconds = Number(Array.isArray(value) ? value[0] : value);
      if (Number.isFinite(seconds) && seconds > 0) {
        candidates.push(Math.ceil(seconds));
      }
    }

    if (candidates.length > 0) {
      response.setHeader(
        HttpHeader.RETRY_AFTER,
        String(Math.max(...candidates)),
      );
    }
  }

  private mapPrismaError(error: Prisma.PrismaClientKnownRequestError): {
    status: number;
    message: string;
  } {
    switch (error.code) {
      case 'P2002':
        return {
          status: HttpStatus.CONFLICT,
          message: 'Resource already exists',
        };
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          message: 'Resource not found',
        };
      default:
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Invalid data',
        };
    }
  }
}
