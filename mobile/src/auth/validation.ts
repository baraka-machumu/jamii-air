// Inline form checks for the auth screens (App Flow §4.1). They mirror the API's rules
// (backend auth.dto.ts) so most mistakes are caught before a request; the server checks again.
// Errors are i18n keys under `auth.errors`.

export const MIN_AGE = 18;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
const USERNAME = /^[A-Za-z0-9._]{3,30}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type FieldError = 'emailFormat' | 'usernameFormat' | 'passwordLength' | 'underAge' | 'dobRequired'
  | 'required' | 'codeFormat' | 'termsRequired';

export const emailError = (email: string): FieldError | undefined =>
  !email.trim() ? 'required' : EMAIL.test(email.trim()) ? undefined : 'emailFormat';

export const usernameError = (username: string): FieldError | undefined =>
  !username ? 'required' : USERNAME.test(username) ? undefined : 'usernameFormat';

export const passwordError = (password: string): FieldError | undefined =>
  !password ? 'required' : password.length >= PASSWORD_MIN && password.length <= PASSWORD_MAX ? undefined : 'passwordLength';

export const resetCodeError = (code: string): FieldError | undefined =>
  !code ? 'required' : /^\d{6}$/.test(code) ? undefined : 'codeFormat';

/** Full years between a date of birth and today (calendar dates, no time zones involved). */
export function ageOn(dob: Date, today: Date): number {
  let age = today.getFullYear() - dob.getFullYear();
  const beforeBirthday = today.getMonth() < dob.getMonth()
    || (today.getMonth() === dob.getMonth() && today.getDate() < dob.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export const dobError = (dob: Date | null, today = new Date()): FieldError | undefined =>
  !dob ? 'dobRequired' : ageOn(dob, today) < MIN_AGE ? 'underAge' : undefined;

/** The latest date of birth that is 18 today: the picker's upper bound. */
export function latestAdultDob(today = new Date()): Date {
  return new Date(today.getFullYear() - MIN_AGE, today.getMonth(), today.getDate());
}

/** The picker's local calendar date as the API's `YYYY-MM-DD`. */
export function toIsoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** `YYYY-MM-DD` typed by hand (web preview) → a local date, or null when it is not a real date. */
export function parseIsoDate(text: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text.trim());
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
  const date = new Date(y, m, d);
  return date.getFullYear() === y && date.getMonth() === m && date.getDate() === d ? date : null;
}

export interface SignUpForm {
  inviteCode: string;
  email: string;
  username: string;
  password: string;
  dob: Date | null;
  acceptTerms: boolean;
}

export type SignUpField = keyof SignUpForm;

export function signUpErrors(form: SignUpForm, today = new Date()): Partial<Record<SignUpField, FieldError>> {
  const errors: Partial<Record<SignUpField, FieldError>> = {
    email: emailError(form.email),
    username: usernameError(form.username),
    password: passwordError(form.password),
    dob: dobError(form.dob, today),
    acceptTerms: form.acceptTerms ? undefined : 'termsRequired',
  };
  for (const key of Object.keys(errors) as SignUpField[]) if (!errors[key]) delete errors[key];
  return errors;
}
