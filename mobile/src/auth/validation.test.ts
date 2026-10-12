import { ageOn, dobError, emailError, latestAdultDob, parseIsoDate, passwordError, resetCodeError, signUpErrors, toIsoDate, usernameError } from './validation';

const today = new Date(2026, 9, 12); // 12 Oct 2026

describe('age (AU-07, minimum 18)', () => {
  it('counts full years, turning 18 on the birthday itself', () => {
    expect(ageOn(new Date(2008, 9, 12), today)).toBe(18);
    expect(ageOn(new Date(2008, 9, 13), today)).toBe(17);
    expect(ageOn(new Date(2008, 10, 1), today)).toBe(17);
    expect(ageOn(new Date(1999, 4, 14), today)).toBe(27);
  });

  it('flags under-18 and a missing date', () => {
    expect(dobError(new Date(2008, 9, 13), today)).toBe('underAge');
    expect(dobError(new Date(2008, 9, 12), today)).toBeUndefined();
    expect(dobError(null, today)).toBe('dobRequired');
  });

  it('opens the picker at the latest adult date of birth', () => {
    expect(toIsoDate(latestAdultDob(today))).toBe('2008-10-12');
  });
});

describe('dates for the API', () => {
  it('sends the picked calendar date as YYYY-MM-DD', () => {
    expect(toIsoDate(new Date(1999, 4, 4))).toBe('1999-05-04');
  });

  it('parses only real dates typed by hand', () => {
    expect(toIsoDate(parseIsoDate('1999-05-14')!)).toBe('1999-05-14');
    expect(parseIsoDate('1999-02-30')).toBeNull();
    expect(parseIsoDate('14/05/1999')).toBeNull();
  });
});

describe('fields (mirroring the API rules)', () => {
  it('checks email, username, password and reset code', () => {
    expect(emailError('amina@example.com')).toBeUndefined();
    expect(emailError('amina@')).toBe('emailFormat');
    expect(emailError(' ')).toBe('required');
    expect(usernameError('amina_shop.tz')).toBeUndefined();
    expect(usernameError('am')).toBe('usernameFormat');
    expect(usernameError('amina shop')).toBe('usernameFormat');
    expect(passwordError('1234567')).toBe('passwordLength');
    expect(passwordError('12345678')).toBeUndefined();
    expect(resetCodeError('12345')).toBe('codeFormat');
    expect(resetCodeError('123456')).toBeUndefined();
  });

  it('lists only the failing sign-up fields; the invite code is the server\'s call', () => {
    const ok = { inviteCode: '', email: 'a@b.co', username: 'amina', password: 'longenough', dob: new Date(1999, 4, 14), acceptTerms: true };
    expect(signUpErrors(ok, today)).toEqual({});
    expect(signUpErrors({ ...ok, acceptTerms: false, username: 'a b' }, today)).toEqual({ acceptTerms: 'termsRequired', username: 'usernameFormat' });
  });
});
