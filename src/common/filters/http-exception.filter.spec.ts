import { HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MulterError } from 'multer';
import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter', () => {
  const filter = new HttpExceptionFilter();

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

  it('maps Multer LIMIT_FILE_SIZE to 413', () => {
    const { status, body } = run(new MulterError('LIMIT_FILE_SIZE'));
    expect(status).toBe(HttpStatus.PAYLOAD_TOO_LARGE);
    expect(body.message).toBe('File too large');
    expect(body).not.toHaveProperty('stack');
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

  it('maps unknown errors to generic 500', () => {
    const { status, body } = run(new Error('relation "secret_table" boom'));
    expect(status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(body.message).toBe('Internal server error');
    expect(JSON.stringify(body)).not.toContain('secret_table');
    expect(body).not.toHaveProperty('stack');
  });
});
