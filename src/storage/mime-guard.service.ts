import {
  BadRequestException,
  Injectable,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../config/env.schema';

const MIME_PDF = 'application/pdf';
const MIME_PNG = 'image/png';
const MIME_JPEG = 'image/jpeg';
const MIME_XLSX =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@Injectable()
export class MimeGuardService {
  constructor(private readonly config: ConfigService<EnvConfig, true>) {}

  /**
   * Detects MIME from magic bytes and rejects disallowed types / oversized payloads.
   * Returns the detected MIME type.
   */
  assertAllowed(buffer: Buffer, declaredMime?: string): string {
    const maxBytes = this.config.get('STORAGE_MAX_UPLOAD_BYTES', {
      infer: true,
    });
    if (buffer.length > maxBytes) {
      throw new PayloadTooLargeException(
        `File exceeds maximum size of ${maxBytes} bytes`,
      );
    }

    const detected = this.detectMime(buffer);
    if (!detected) {
      throw new BadRequestException('Unrecognized or unsupported file type');
    }

    const allowed = this.allowedMimeSet();
    if (!allowed.has(detected)) {
      throw new BadRequestException(`MIME type not allowed: ${detected}`);
    }

    if (declaredMime && declaredMime !== detected) {
      throw new BadRequestException(
        `Declared MIME ${declaredMime} does not match detected ${detected}`,
      );
    }

    return detected;
  }

  detectMime(buffer: Buffer): string | null {
    if (
      buffer.length >= 4 &&
      buffer.subarray(0, 4).toString('ascii') === '%PDF'
    ) {
      return MIME_PDF;
    }

    if (
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    ) {
      return MIME_PNG;
    }

    if (
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
    ) {
      return MIME_JPEG;
    }

    if (this.isXlsxZip(buffer)) {
      return MIME_XLSX;
    }

    return null;
  }

  private isXlsxZip(buffer: Buffer): boolean {
    // ZIP local file header
    if (
      buffer.length < 4 ||
      buffer[0] !== 0x50 ||
      buffer[1] !== 0x4b ||
      buffer[2] !== 0x03 ||
      buffer[3] !== 0x04
    ) {
      return false;
    }

    const asLatin1 = buffer.toString('latin1');
    const hasContentTypes = asLatin1.includes('[Content_Types].xml');
    const hasWorkbook =
      asLatin1.includes('xl/workbook.xml') || asLatin1.includes('xl/');
    return hasContentTypes && hasWorkbook;
  }

  private allowedMimeSet(): Set<string> {
    const raw = this.config.get('STORAGE_ALLOWED_MIME', { infer: true });
    return new Set(
      raw
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean),
    );
  }
}
