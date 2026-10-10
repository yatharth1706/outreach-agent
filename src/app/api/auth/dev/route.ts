import { upsertAccount } from '@/lib/accounts';
import { startSession } from '@/lib/session';

/** Local-only sign-in that skips Google, for testing with EMAIL_TRANSPORT=log. */
export async function GET(req: Request) {
  if (process.env.NODE_ENV !== 'development') return new Response('Not found', { status: 404 });
  const account = await upsertAccount({
    email: process.env.DEV_LOGIN_EMAIL ?? 'dev@localhost.test',
    name: 'Dev User',
  });
  await startSession(account.id);
  return Response.redirect(new URL('/', req.url));
}
