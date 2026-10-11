/**
 * Minimal Google OAuth + Gmail client over fetch (keeps the googleapis SDK out of the bundle).
 */

export const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
const SCOPES = ['openid', 'email', 'profile', GMAIL_SEND_SCOPE];

function clientCredentials() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set');
  return { clientId, clientSecret };
}

export function redirectUri(origin: string) {
  return `${process.env.APP_URL ?? origin}/api/auth/google/callback`;
}

export function authorizationUrl(origin: string, state: string) {
  const params = new URLSearchParams({
    client_id: clientCredentials().clientId,
    redirect_uri: redirectUri(origin),
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    // Always show consent so Google returns a refresh token, even on re-login.
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

/** Error whose `retryable` flag tells the sender whether trying again can help. */
export class GoogleApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

async function postToken(body: Record<string, string>) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...clientCredentials(), ...body }),
  });
  const json = await res.json();
  if (!res.ok) {
    // invalid_grant = refresh token revoked or expired; only reconnecting fixes it.
    const reconnect = json.error === 'invalid_grant';
    throw new GoogleApiError(
      reconnect
        ? 'Gmail access was revoked or expired. Sign in with Google again to reconnect.'
        : `Google token error: ${json.error_description ?? json.error ?? res.status}`,
      res.status,
      !reconnect && res.status >= 500,
    );
  }
  return json as {
    access_token: string;
    refresh_token?: string;
    scope: string;
    expires_in: number;
  };
}

export async function exchangeCode(code: string, origin: string) {
  return postToken({
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri(origin),
  });
}

export async function fetchUserInfo(accessToken: string) {
  const res = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Google userinfo failed: ${res.status}`);
  return (await res.json()) as { email: string; email_verified: boolean; name?: string };
}

// ---------------------------------------------------------------------------
// Gmail send
// ---------------------------------------------------------------------------

/** Strip CR/LF so user or model text can never inject extra headers. */
function oneLine(value: string) {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

/** RFC 2047 encoded-word for non-ASCII header values. */
function encodeHeader(value: string) {
  const clean = oneLine(value);
  return /^[\x20-\x7e]*$/.test(clean)
    ? clean
    : `=?UTF-8?B?${Buffer.from(clean, 'utf8').toString('base64')}?=`;
}

function formatAddress(email: string, name?: string | null) {
  if (!name) return oneLine(email);
  const display = /^[\x20-\x7e]*$/.test(name) ? `"${oneLine(name).replace(/["\\]/g, '')}"` : encodeHeader(name);
  return `${display} <${oneLine(email)}>`;
}

export function buildMimeMessage(msg: {
  from: string;
  fromName?: string | null;
  to: string;
  toName?: string | null;
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
}) {
  const bodyBase64 = Buffer.from(msg.body.replace(/\r?\n/g, '\r\n'), 'utf8')
    .toString('base64')
    .replace(/.{76}/g, '$&\r\n');
  const mime = [
    `From: ${formatAddress(msg.from, msg.fromName)}`,
    `To: ${formatAddress(msg.to, msg.toName)}`,
    ...(msg.cc?.length ? [`Cc: ${msg.cc.map((a) => oneLine(a)).join(', ')}`] : []),
    // Gmail delivers to Bcc recipients and strips this header from what recipients see.
    ...(msg.bcc?.length ? [`Bcc: ${msg.bcc.map((a) => oneLine(a)).join(', ')}`] : []),
    `Subject: ${encodeHeader(msg.subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    bodyBase64,
  ].join('\r\n');
  return Buffer.from(mime, 'utf8').toString('base64url');
}

export async function sendGmail(
  refreshToken: string,
  msg: Parameters<typeof buildMimeMessage>[0],
): Promise<{ messageId: string; threadId: string }> {
  const { access_token } = await postToken({
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: buildMimeMessage(msg) }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = json?.error?.message ?? `Gmail send failed with HTTP ${res.status}`;
    throw new GoogleApiError(message, res.status, res.status === 429 || res.status >= 500);
  }
  return { messageId: json.id, threadId: json.threadId };
}
