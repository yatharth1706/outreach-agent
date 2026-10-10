import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

function encryptionKey(): Buffer {
  return createHash('sha256').update(requireEnv('TOKEN_ENCRYPTION_KEY')).digest();
}

/** AES-256-GCM. Output: iv.tag.ciphertext, each base64url. */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64url')).join('.');
}

export function decrypt(token: string): string {
  const [iv, tag, data] = token.split('.').map((p) => Buffer.from(p, 'base64url'));
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

function hmac(value: string): string {
  return createHmac('sha256', requireEnv('SESSION_SECRET')).update(value).digest('base64url');
}

export function sign(value: string): string {
  return `${value}.${hmac(value)}`;
}

/** Returns the signed value, or null if the signature does not match. */
export function unsign(token: string): string | null {
  const i = token.lastIndexOf('.');
  if (i <= 0) return null;
  const value = token.slice(0, i);
  const given = Buffer.from(token.slice(i + 1));
  const expected = Buffer.from(hmac(value));
  return given.length === expected.length && timingSafeEqual(given, expected) ? value : null;
}
