import { db, schema } from '@/db';

/** Optional allowlist (comma-separated) so a public deployment can't be used by strangers. */
export function isEmailAllowed(email: string) {
  const list = process.env.ALLOWED_EMAILS?.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  return !list?.length || list.includes(email.toLowerCase());
}

export async function upsertAccount(input: { email: string; name?: string | null; refreshTokenEnc?: string }) {
  const email = input.email.toLowerCase();
  const set = {
    ...(input.name ? { name: input.name } : {}),
    // Google only returns a refresh token on consent; keep the old one otherwise.
    ...(input.refreshTokenEnc ? { refreshTokenEnc: input.refreshTokenEnc } : {}),
    updatedAt: new Date(),
  };
  const [account] = await db
    .insert(schema.accounts)
    .values({ email, name: input.name, refreshTokenEnc: input.refreshTokenEnc })
    .onConflictDoUpdate({ target: schema.accounts.email, set })
    .returning();
  return account;
}
