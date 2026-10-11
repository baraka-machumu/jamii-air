import { resolveLanguage } from '.';
import en from './en.json';
import sw from './sw.json';

function keys(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]);
}

function values(obj: object): string[] {
  return Object.values(obj).flatMap((v) => (typeof v === 'object' && v !== null ? values(v) : [String(v)]));
}

describe('translations', () => {
  it('has every English key in Swahili and no extra ones', () => {
    expect(keys(sw).sort()).toEqual(keys(en).sort());
  });

  it('has no empty strings', () => {
    expect([...values(en), ...values(sw)].filter((v) => v.trim() === '')).toEqual([]);
  });

  it('uses the chosen language, else the phone language', () => {
    expect(resolveLanguage('sw')).toBe('sw');
    expect(resolveLanguage('en')).toBe('en');
    expect(['en', 'sw']).toContain(resolveLanguage('system'));
  });
});
