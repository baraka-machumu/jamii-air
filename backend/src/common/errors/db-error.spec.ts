import { ApiError } from './api-error.js';
import { businessErrorOf, databaseErrorOf } from './db-error.js';

/** The shape Prisma 7 + @prisma/adapter-pg produce for a failed raw query (P2010). */
function prismaError(sqlState: string, message: string) {
  return {
    name: 'PrismaClientKnownRequestError',
    code: 'P2010',
    message: `Raw query failed. Code: \`${sqlState}\`. Message: \`${message}\``,
    meta: { driverAdapterError: { name: 'DriverAdapterError', cause: { originalCode: sqlState, originalMessage: message, kind: 'postgres' } } },
  };
}

describe('db errors', () => {
  it('maps JA<status> to an ApiError with that status and code', () => {
    const error = businessErrorOf(prismaError('JA404', 'POST_NOT_FOUND'));
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404, code: 'POST_NOT_FOUND', message: 'Post not found.' });
    expect(businessErrorOf(prismaError('JA422', 'UNDER_MINIMUM_AGE'))).toMatchObject({ status: 422 });
  });

  it('also reads a plain pg DatabaseError', () => {
    expect(businessErrorOf({ code: 'JA409', message: 'USERNAME_TAKEN' })).toMatchObject({ status: 409, code: 'USERNAME_TAKEN' });
  });

  it('does not treat other database errors as business errors', () => {
    expect(businessErrorOf(prismaError('23505', 'duplicate key value'))).toBeUndefined();
    expect(databaseErrorOf(prismaError('23505', 'duplicate key value'))).toEqual({ sqlState: '23505', message: 'duplicate key value' });
    expect(businessErrorOf(new Error('boom'))).toBeUndefined();
    expect(businessErrorOf(prismaError('JA999', 'X'))).toBeUndefined();
  });
});
