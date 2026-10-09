import { HttpStatus, NotFoundException } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Prisma } from '@prisma/client';
import { MulterError } from 'multer';
import { TooManyRequestsException } from '../exceptions/too-many-requests.exception';
import { SecurityMetricsService } from '../security-metrics.service';
import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter', () => {
  const recordHttpStatus = jest.fn().mockResolvedValue(undefined);
  const metrics = {
    recordHttpStatus,
  } as unknown as SecurityMetricsService;
  const filter = new HttpExceptionFilter(metrics);

  function run(exception: unknown): {
    status: number;
    body: Record<string, unknown>;
  } {
    let statusCode = 0;
    let body: Record<string, unknown> = {};
    const response = {
      status: (code: number) => {
        statusCode = code;
        return {
          json: (payload: Record<string, unknown>) => {
            body = payload;
          },
        };
      },
    };
    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => ({ method: 'POST', url: '/api/v1/test' }),
      }),
    };
    filter.catch(exception, host as never);
    return { status: statusCode, body };
  }

  beforeEach(() => {
    recordHttpStatus.mockClear();
  });

  it('maps Multer LIMIT_FILE_SIZE to 413', () => {
    const { status, body } = run(new MulterError('LIMIT_FILE_SIZE'));
    expect(status).toBe(HttpStatus.PAYLOAD_TOO_LARGE);
    expect(body.message).toBe('File too large');
    expect(body).not.toHaveProperty('stack');
    expect(recordHttpStatus).toHaveBeenCalledWith(HttpStatus.PAYLOAD_TOO_LARGE);
  });

  it('maps Prisma unique conflict without leaking meta', () => {
    const err = new Prisma.PrismaClientKnownRequestError('Unique', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['users_email_key'] },
    });
    const { status, body } = run(err);
    expect(status).toBe(HttpStatus.CONFLICT);
    expect(body.message).toBe('Resource already exists');
    expect(JSON.stringify(body)).not.toContain('users_email_key');
  });

  describe('429 Retry-After normalisation', () => {
    function run429(
      exception: unknown,
      preset: Record<string, string> = {},
    ): { status: number; headers: Record<string, string> } {
      let statusCode = 0;
      const headers = new Map<string, string>(Object.entries(preset));
      const response = {
        getHeaders: () => Object.fromEntries(headers),
        setHeader: (name: string, value: string) => {
          headers.set(name, value);
        },
        status: (code: number) => {
          statusCode = code;
          return { json: () => undefined };
        },
      };
      const host = {
        switchToHttp: () => ({
          getResponse: () => response,
          getRequest: () => ({ method: 'POST', url: '/api/v1/auth/login' }),
        }),
      };
      filter.catch(exception, host as never);
      return { status: statusCode, headers: Object.fromEntries(headers) };
    }

    it('uses retryAfterSeconds from TooManyRequestsException', () => {
      const { status, headers } = run429(
        new TooManyRequestsException('Too many attempts', 42),
      );
      expect(status).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect(headers['Retry-After']).toBe('42');
    });

    it('collapses named throttler headers into plain Retry-After', () => {
      const { headers } = run429(new ThrottlerException(), {
        'retry-after-auth': '17',
      });
      expect(headers['Retry-After']).toBe('17');
    });

    it('keeps the longest wait when several limiters fired', () => {
      const { headers } = run429(new ThrottlerException(), {
        'retry-after': '5',
        'retry-after-reports': '50',
      });
      expect(headers['Retry-After']).toBe('50');
    });

    it('ignores non-numeric values and does not set the header', () => {
      const { headers } = run429(new ThrottlerException(), {
        'retry-after-auth': 'soon',
      });
      expect(headers['Retry-After']).toBeUndefined();
    });

    it('does not touch Retry-After for non-429 errors', () => {
      const { status, headers } = run429(new NotFoundException(), {
        'retry-after-auth': '9',
      });
      expect(status).toBe(HttpStatus.NOT_FOUND);
      expect(headers['Retry-After']).toBeUndefined();
    });
  });

  it('maps unknown errors to generic 500', () => {
    const { status, body } = run(new Error('relation "secret_table" boom'));
    expect(status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(body.message).toBe('Internal server error');
    expect(JSON.stringify(body)).not.toContain('secret_table');
    expect(body).not.toHaveProperty('stack');
  });
});
