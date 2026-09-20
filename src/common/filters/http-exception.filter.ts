import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { MulterError } from 'multer';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

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

    response.status(mapped.status).json({
      statusCode: mapped.status,
      message: mapped.message,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }

  private mapException(exception: unknown): {
    status: number;
    message: string;
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
      return { status, message };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    };
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
