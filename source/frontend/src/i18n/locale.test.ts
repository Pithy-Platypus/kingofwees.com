import { describe, expect, it } from 'vitest';
import { directionOf, resolveLocale } from './locale';

describe('resolveLocale', () => {
  it('uses a supported ?locale= query over browser preferences', () => {
    expect(resolveLocale('?locale=en-XA', ['en-US'])).toBe('en-XA');
  });

  it('ignores an unsupported ?locale= query and falls back to browser preferences', () => {
    expect(resolveLocale('?locale=xx-YY', ['en-US'])).toBe('en-US');
  });

  it('matches a browser preference by base language', () => {
    expect(resolveLocale('', ['fr-FR', 'en-GB'])).toBe('en-US');
  });

  it('defaults to en-US when nothing matches', () => {
    expect(resolveLocale('', ['fr-FR'])).toBe('en-US');
  });

  it('never selects the pseudo-locale from browser preferences alone', () => {
    expect(resolveLocale('', ['en-XA'])).toBe('en-US');
  });
});

describe('directionOf', () => {
  it('is ltr for English', () => {
    expect(directionOf('en-US')).toBe('ltr');
  });

  it('is rtl for Hebrew and Arabic', () => {
    expect(directionOf('he-IL')).toBe('rtl');
    expect(directionOf('ar')).toBe('rtl');
    expect(directionOf('fa-IR')).toBe('rtl');
    expect(directionOf('ur')).toBe('rtl');
  });
});
