import { BadRequestException } from '@nestjs/common';
import { sanitizeOriginalFilename } from './sanitize-original-filename';

describe('sanitizeOriginalFilename', () => {
  it('keeps a simple basename', () => {
    expect(sanitizeOriginalFilename('report.pdf')).toBe('report.pdf');
  });

  it('strips directory components', () => {
    expect(sanitizeOriginalFilename('../../etc/passwd')).toBe('passwd');
    expect(sanitizeOriginalFilename('foo/bar/baz.xlsx')).toBe('baz.xlsx');
  });

  it('rejects empty and control characters', () => {
    expect(() => sanitizeOriginalFilename('')).toThrow(BadRequestException);
    expect(() => sanitizeOriginalFilename('..')).toThrow(BadRequestException);
    expect(() => sanitizeOriginalFilename('evil\0.pdf')).toThrow(
      BadRequestException,
    );
  });

  it('truncates long names', () => {
    const long = `${'a'.repeat(300)}.pdf`;
    expect(sanitizeOriginalFilename(long).length).toBe(255);
  });
});
