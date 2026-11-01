// Localised push text (TRD NT-03, App Flow §9). English and Swahili; the device's app language
// wins over the account setting so a shared phone shows what its user reads.

export type NotificationType = 'FOLLOW' | 'LIKE' | 'COMMENT' | 'REPLY' | 'FOLLOW_REQUEST' | 'FOLLOW_ACCEPTED';
type Lang = 'en' | 'sw';

const TEXT: Record<Lang, Record<NotificationType, (username: string) => string>> = {
  en: {
    LIKE: (u) => `${u} liked your post`,
    COMMENT: (u) => `${u} commented on your post`,
    REPLY: (u) => `${u} replied to your comment`,
    FOLLOW: (u) => `${u} started following you`,
    FOLLOW_REQUEST: (u) => `${u} asked to follow you`,
    FOLLOW_ACCEPTED: (u) => `${u} accepted your follow request`,
  },
  sw: {
    LIKE: (u) => `${u} amependa chapisho lako`,
    COMMENT: (u) => `${u} ametoa maoni kwenye chapisho lako`,
    REPLY: (u) => `${u} amejibu maoni yako`,
    FOLLOW: (u) => `${u} ameanza kukufuata`,
    FOLLOW_REQUEST: (u) => `${u} ameomba kukufuata`,
    FOLLOW_ACCEPTED: (u) => `${u} amekubali ombi lako la kumfuata`,
  },
};

export function pushLanguage(deviceLocale: string | null, accountLocale: string | null): Lang {
  const locale = (deviceLocale || accountLocale || 'en').toLowerCase();
  return locale.startsWith('sw') ? 'sw' : 'en';
}

export function pushText(type: NotificationType, username: string, lang: Lang): { title: string; body: string } {
  return { title: 'Kidili', body: TEXT[lang][type](username) };
}
