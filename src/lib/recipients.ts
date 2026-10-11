// Pure helpers (no database access) so the browser and the server validate recipients identically.

const EMAIL_PATTERN = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/;
export const MAX_RECIPIENTS = 10;

export function isEmailAddress(value: string) {
  return EMAIL_PATTERN.test(value.trim());
}

/**
 * Cleans a recipient list: trims, drops blanks, removes duplicates (case-insensitive)
 * and anyone already in `exclude` (e.g. the To address, or Cc when listing Bcc).
 */
export function normalizeRecipients(list: string[] | undefined, exclude: string[] = []) {
  const seen = new Set(exclude.map((e) => e.trim().toLowerCase()));
  const out: string[] = [];
  const invalid: string[] = [];
  for (const raw of list ?? []) {
    const email = raw.trim();
    if (!email) continue;
    if (!isEmailAddress(email)) {
      invalid.push(email);
      continue;
    }
    if (seen.has(email.toLowerCase())) continue;
    seen.add(email.toLowerCase());
    out.push(email);
  }
  return { list: out, invalid };
}

/** Validates To + Cc + Bcc together. Cc/Bcc never repeat the To address or each other. */
export function checkRecipients(input: { to: string; cc?: string[]; bcc?: string[] }) {
  if (!isEmailAddress(input.to)) return { ok: false as const, error: `"${input.to}" is not a valid email address.` };
  const cc = normalizeRecipients(input.cc, [input.to]);
  const bcc = normalizeRecipients(input.bcc, [input.to, ...cc.list]);
  const invalid = [...cc.invalid, ...bcc.invalid];
  if (invalid.length) return { ok: false as const, error: `Not valid email addresses: ${invalid.join(', ')}.` };
  const total = 1 + cc.list.length + bcc.list.length;
  if (total > MAX_RECIPIENTS) {
    return { ok: false as const, error: `At most ${MAX_RECIPIENTS} recipients per email (this has ${total}).` };
  }
  return { ok: true as const, to: input.to.trim(), cc: cc.list, bcc: bcc.list };
}
