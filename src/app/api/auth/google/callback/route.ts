import { cookies } from 'next/headers';
import { isEmailAllowed, upsertAccount } from '@/lib/accounts';
import { encrypt } from '@/lib/crypto';
import { GMAIL_SEND_SCOPE, exchangeCode, fetchUserInfo } from '@/lib/google';
import { startSession } from '@/lib/session';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const home = (error?: string) =>
    Response.redirect(new URL(error ? `/?error=${encodeURIComponent(error)}` : '/', url.origin));

  const cookieStore = await cookies();
  const expectedState = cookieStore.get('oauth_state')?.value;
  cookieStore.delete('oauth_state');

  if (url.searchParams.get('error')) return home('Google sign-in was cancelled.');
  const code = url.searchParams.get('code');
  if (!code || !expectedState || url.searchParams.get('state') !== expectedState) {
    return home('Sign-in expired. Please try again.');
  }

  const tokens = await exchangeCode(code, url.origin);
  if (!tokens.scope.split(' ').includes(GMAIL_SEND_SCOPE)) {
    return home('Please allow "Send email on your behalf" so scheduled emails can go out.');
  }
  const user = await fetchUserInfo(tokens.access_token);
  if (!user.email_verified) return home('Your Google email address is not verified.');
  if (!isEmailAllowed(user.email)) return home(`${user.email} is not allowed to use this app.`);

  const account = await upsertAccount({
    email: user.email,
    name: user.name,
    refreshTokenEnc: tokens.refresh_token ? encrypt(tokens.refresh_token) : undefined,
  });
  await startSession(account.id);
  return home();
}
