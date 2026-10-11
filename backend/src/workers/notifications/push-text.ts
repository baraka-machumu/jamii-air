// Localised push text (TRD NT-03, App Flow §9). English and Swahili; the device's app language
// wins over the account setting so a shared phone shows what its user reads.

export type NotificationType = 'FOLLOW' | 'LIKE' | 'COMMENT';
type Lang = 'en' | 'sw';

const TEXT: Record<Lang, Record<NotificationType, (username: string) => string>> = {
  en: {
    LIKE: (u) => `${u} liked your post`,
    COMMENT: (u) => `${u} commented on your post`,
    FOLLOW: (u) => `${u} started following you`,
  },
  sw: {
    LIKE: (u) => `${u} amependa chapisho lako`,
    COMMENT: (u) => `${u} ametoa maoni kwenye chapisho lako`,
    FOLLOW: (u) => `${u} ameanza kukufuata`,
  },
};

export function pushLanguage(deviceLocale: string | null, accountLocale: string | null): Lang {
  const locale = (deviceLocale || accountLocale || 'en').toLowerCase();
  return locale.startsWith('sw') ? 'sw' : 'en';
}

export function pushText(type: NotificationType, username: string, lang: Lang): { title: string; body: string } {
  return { title: 'Jamii Air', body: TEXT[lang][type](username) };
}
