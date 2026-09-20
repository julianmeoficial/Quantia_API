import { BadRequestException } from '@nestjs/common';
import { basename } from 'path';

const MAX_ORIGINAL_NAME_LENGTH = 255;

function hasControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 32 || code === 127) {
      return true;
    }
  }
  return false;
}

/**
 * Normalize multipart original filenames for safe storage/display metadata.
 * Does not affect the Storage key (always UUID-based).
 */
export function sanitizeOriginalFilename(raw: string | undefined): string {
  const base = basename((raw ?? '').replace(/\\/g, '/')).trim();
  if (!base || base === '.' || base === '..' || hasControlChars(base)) {
    throw new BadRequestException('Invalid file name');
  }
  if (base.includes('..')) {
    throw new BadRequestException('Invalid file name');
  }
  return base.slice(0, MAX_ORIGINAL_NAME_LENGTH);
}
