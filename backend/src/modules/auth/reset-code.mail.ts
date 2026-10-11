// Password-reset email (BR-AC-07) in the user's language (BR-PL-02). Plain text: no links to
// phish with; the code is typed into the app.
export function resetCodeMail(locale: string, code: string, minutes: number): { subject: string; text: string } {
  if (locale === 'sw') {
    return {
      subject: `Msimbo wako wa Jamii Air: ${code}`,
      text: `Habari,\n\nMsimbo wako wa kubadilisha nenosiri ni: ${code}\n\nUnaisha baada ya dakika ${minutes}. `
        + 'Kama hukuomba kubadilisha nenosiri, puuza barua pepe hii.\n\nJamii Air',
    };
  }
  return {
    subject: `Your Jamii Air code: ${code}`,
    text: `Hello,\n\nYour password reset code is: ${code}\n\nIt expires in ${minutes} minutes. `
      + 'If you did not ask to reset your password, ignore this email.\n\nJamii Air',
  };
}
