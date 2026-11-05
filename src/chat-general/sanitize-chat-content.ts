/**
 * Normalises chat text before persisting. Content is stored and served as
 * plain text — clients must render it as text, never as HTML.
 *
 * - Unicode NFC (so "é" typed two ways compares equal)
 * - CRLF / CR → LF
 * - strips C0/C1 control chars except `\n` and `\t`, plus bidi overrides
 *   (U+202A–U+202E, U+2066–U+2069) used for spoofing
 * - at most 2 consecutive blank lines
 * - trims surrounding whitespace
 */
export function sanitizeChatContent(raw: string): string {
  return raw
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(
      // eslint-disable-next-line no-control-regex
      /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/g,
      '',
    )
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}
