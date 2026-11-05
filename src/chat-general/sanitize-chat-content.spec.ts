import { sanitizeChatContent } from './sanitize-chat-content';

describe('sanitizeChatContent', () => {
  it('normalises line endings and trims', () => {
    expect(sanitizeChatContent('  hola\r\nmundo\r  ')).toBe('hola\nmundo');
  });

  it('strips control and bidi override characters', () => {
    expect(sanitizeChatContent('a\u0000b\u0007c\u202Ed\u2066e')).toBe('abcde');
  });

  it('keeps tabs, newlines and emoji', () => {
    expect(sanitizeChatContent('a\tb\nc 🎉')).toBe('a\tb\nc 🎉');
  });

  it('caps consecutive blank lines', () => {
    expect(sanitizeChatContent('a\n\n\n\n\n\nb')).toBe('a\n\n\nb');
  });

  it('applies NFC normalisation', () => {
    expect(sanitizeChatContent('e\u0301')).toBe('é');
  });

  it('does not touch HTML (stored as plain text)', () => {
    expect(sanitizeChatContent('<b>hi</b>')).toBe('<b>hi</b>');
  });
});
