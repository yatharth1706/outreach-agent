import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { authorizationUrl } from '@/lib/google';

export async function GET(req: Request) {
  const state = randomBytes(16).toString('base64url');
  (await cookies()).set('oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });
  return Response.redirect(authorizationUrl(new URL(req.url).origin, state));
}
