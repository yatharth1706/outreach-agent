import { eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { db, schema } from '@/db';
import { sign, unsign } from './crypto';

const SESSION_COOKIE = 'session';
const THIRTY_DAYS = 60 * 60 * 24 * 30;

export async function getSessionAccount() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const accountId = token ? unsign(token) : null;
  if (!accountId) return null;
  const account = await db.query.accounts.findFirst({
    where: eq(schema.accounts.id, accountId),
  });
  return account ?? null;
}

/** Only callable from Route Handlers / Server Functions. */
export async function startSession(accountId: string) {
  (await cookies()).set(SESSION_COOKIE, sign(accountId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: THIRTY_DAYS,
  });
}

export async function endSession() {
  (await cookies()).delete(SESSION_COOKIE);
}
