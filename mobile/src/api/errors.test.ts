import i18n from '@/i18n';
import en from '@/i18n/en.json';
import sw from '@/i18n/sw.json';
import { ApiError, errorMessage } from './errors';
import spec from './openapi.json';

const codes = (spec as { components: { schemas: { ApiErrorDetail: { properties: { code: { enum: string[] } } } } } })
  .components.schemas.ApiErrorDetail.properties.code.enum;

describe('error messages', () => {
  it('has an English and a Swahili message for every code the API publishes', () => {
    expect(codes.length).toBeGreaterThan(40);
    expect(codes.filter((code) => !(code in en.errors))).toEqual([]);
    expect(codes.filter((code) => !(code in sw.errors))).toEqual([]);
  });

  it('shows the message for the code, in the app language', async () => {
    await i18n.changeLanguage('en');
    expect(errorMessage(new ApiError(409, 'USERNAME_TAKEN', 'x'), i18n.t)).toBe('This username is taken.');
    await i18n.changeLanguage('sw');
    expect(errorMessage(new ApiError(409, 'USERNAME_TAKEN', 'x'), i18n.t)).toBe('Jina hili la mtumiaji limeshachukuliwa.');
    await i18n.changeLanguage('en');
  });

  it('falls back by kind for codes it does not know', () => {
    expect(errorMessage(new ApiError(0, 'NETWORK_ERROR', 'x'), i18n.t)).toBe(en.errors.NETWORK_ERROR);
    expect(errorMessage(new ApiError(502, 'HTTP_502', 'x'), i18n.t)).toBe(en.errors.INTERNAL_ERROR);
    expect(errorMessage(new ApiError(418, 'HTTP_418', 'x'), i18n.t)).toBe(en.errors.UNKNOWN);
    expect(errorMessage(new Error('boom'), i18n.t)).toBe(en.errors.UNKNOWN);
  });

  it('reads the error envelope, with a fallback when the body is not one', () => {
    expect(ApiError.fromResponse(404, { error: { code: 'POST_NOT_FOUND', message: 'm' }, requestId: 'r' }))
      .toMatchObject({ status: 404, code: 'POST_NOT_FOUND', requestId: 'r' });
    expect(ApiError.fromResponse(502, undefined)).toMatchObject({ status: 502, code: 'HTTP_502' });
  });
});
