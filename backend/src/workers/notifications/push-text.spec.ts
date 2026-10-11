import { pushLanguage, pushText } from './push-text.js';

describe('push text', () => {
  it('prefers the device language, then the account language, else English', () => {
    expect(pushLanguage('sw', 'en')).toBe('sw');
    expect(pushLanguage('en', 'sw')).toBe('en');
    expect(pushLanguage(null, 'sw')).toBe('sw');
    expect(pushLanguage('sw-TZ', null)).toBe('sw');
    expect(pushLanguage('fr', null)).toBe('en');
    expect(pushLanguage(null, null)).toBe('en');
  });

  it('names the actor in every type and language', () => {
    for (const lang of ['en', 'sw'] as const) {
      for (const type of ['LIKE', 'COMMENT', 'FOLLOW'] as const) {
        const text = pushText(type, 'amina', lang);
        expect(text.title).toBe('Jamii Air');
        expect(text.body).toMatch(/^amina /);
      }
    }
    expect(pushText('FOLLOW', 'neema', 'sw').body).toBe('neema ameanza kukufuata');
  });
});
