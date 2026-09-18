import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../config/env.schema';
import { MimeGuardService } from './mime-guard.service';

describe('MimeGuardService', () => {
  const build = (overrides?: { maxBytes?: number; allowed?: string }) => {
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'STORAGE_MAX_UPLOAD_BYTES') {
          return overrides?.maxBytes ?? 1024;
        }
        if (key === 'STORAGE_ALLOWED_MIME') {
          return (
            overrides?.allowed ??
            'application/pdf,image/png,image/jpeg,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          );
        }
        return undefined;
      }),
    } as unknown as ConfigService<EnvConfig, true>;
    return new MimeGuardService(config);
  };

  it('accepts PDF magic bytes', () => {
    const guard = build();
    const buf = Buffer.from('%PDF-1.4 fake content');
    expect(guard.assertAllowed(buf)).toBe('application/pdf');
  });

  it('accepts PNG magic bytes', () => {
    const guard = build();
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(guard.assertAllowed(buf)).toBe('image/png');
  });

  it('accepts JPEG magic bytes', () => {
    const guard = build();
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(guard.assertAllowed(buf)).toBe('image/jpeg');
  });

  it('accepts XLSX zip with content types', () => {
    const guard = build();
    const payload =
      'PK\u0003\u0004....[Content_Types].xml....xl/workbook.xml....';
    const buf = Buffer.from(payload, 'binary');
    expect(guard.assertAllowed(buf)).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
  });

  it('rejects oversized files', () => {
    const guard = build({ maxBytes: 4 });
    const buf = Buffer.from('%PDF-too-big');
    expect(() => guard.assertAllowed(buf)).toThrow(PayloadTooLargeException);
  });

  it('rejects unknown magic', () => {
    const guard = build();
    expect(() => guard.assertAllowed(Buffer.from('hello'))).toThrow(
      BadRequestException,
    );
  });

  it('rejects mime not in allowlist', () => {
    const guard = build({ allowed: 'image/png' });
    const buf = Buffer.from('%PDF-1.4');
    expect(() => guard.assertAllowed(buf)).toThrow(BadRequestException);
  });
});
