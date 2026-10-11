import { and, asc, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { db, schema } from '@/db';
import type { EmailJob, JobStatus } from '@/db/schema';
import { checkRecipients } from './recipients';
import { formatInZone, resolveSendTime } from './time';

export { MAX_RECIPIENTS, checkRecipients, isEmailAddress, normalizeRecipients } from './recipients';

const { contacts, emailJobs } = schema;

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

export async function findContacts(accountId: string, query: string) {
  const q = `%${query.trim()}%`;
  return db
    .select()
    .from(contacts)
    .where(
      and(
        eq(contacts.accountId, accountId),
        or(ilike(contacts.name, q), ilike(contacts.email, q), ilike(contacts.company, q)),
      ),
    )
    .orderBy(asc(contacts.name))
    .limit(10);
}

export type ContactInput = {
  email: string;
  name?: string | null;
  company?: string | null;
  timezone?: string | null;
  note?: string | null;
};

/** Insert or update by email. Only fields that are provided overwrite existing values. */
export async function upsertContact(accountId: string, input: ContactInput) {
  const email = input.email.trim().toLowerCase();
  const provided = Object.fromEntries(
    Object.entries({
      name: input.name,
      company: input.company,
      timezone: input.timezone,
      note: input.note,
    }).filter(([, v]) => v != null && v !== ''),
  );
  const [row] = await db
    .insert(contacts)
    .values({ accountId, email, ...provided })
    .onConflictDoUpdate({
      target: [contacts.accountId, contacts.email],
      set: { ...provided, updatedAt: new Date() },
    })
    .returning();
  return row;
}

// ---------------------------------------------------------------------------
// Email jobs
// ---------------------------------------------------------------------------

export type ScheduleInput = {
  toEmail: string;
  toName?: string | null;
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  sendAtLocal: string;
  timezone: string;
};

export async function scheduleEmail(accountId: string, input: ScheduleInput) {
  const time = resolveSendTime(input.sendAtLocal, input.timezone);
  if (!time.ok) return { ok: false as const, error: time.error };
  const recipients = checkRecipients({ to: input.toEmail, cc: input.cc, bcc: input.bcc });
  if (!recipients.ok) return { ok: false as const, error: recipients.error };

  // Save new recipients as contacts so "email her again" works later.
  const contact = await upsertContact(accountId, { email: recipients.to, name: input.toName });
  const [job] = await db
    .insert(emailJobs)
    .values({
      accountId,
      contactId: contact.id,
      toEmail: contact.email,
      toName: input.toName ?? contact.name,
      cc: recipients.cc,
      bcc: recipients.bcc,
      subject: input.subject.trim(),
      body: input.body.trim(),
      sendAt: time.sendAt,
      localSendAt: time.local,
      timezone: time.zone,
      nextAttemptAt: time.sendAt,
    })
    .returning();
  return { ok: true as const, job };
}

export async function getJob(accountId: string, jobId: string) {
  return db.query.emailJobs.findFirst({
    where: and(eq(emailJobs.accountId, accountId), eq(emailJobs.id, jobId)),
  });
}

export type ListFilters = {
  status?: JobStatus | 'all';
  query?: string;
  from?: Date;
  to?: Date;
  limit?: number;
};

export async function listJobs(accountId: string, filters: ListFilters = {}) {
  const conditions = [eq(emailJobs.accountId, accountId)];
  if (filters.status && filters.status !== 'all') conditions.push(eq(emailJobs.status, filters.status));
  if (filters.query) {
    const q = `%${filters.query.trim()}%`;
    conditions.push(
      or(
        ilike(emailJobs.toEmail, q),
        ilike(emailJobs.toName, q),
        ilike(emailJobs.subject, q),
      )!,
    );
  }
  if (filters.from) conditions.push(sql`${emailJobs.sendAt} >= ${filters.from}`);
  if (filters.to) conditions.push(sql`${emailJobs.sendAt} < ${filters.to}`);

  const upcoming = filters.status === 'pending' || filters.status === 'sending';
  return db
    .select()
    .from(emailJobs)
    .where(and(...conditions))
    .orderBy(upcoming ? asc(emailJobs.sendAt) : desc(emailJobs.sendAt))
    .limit(filters.limit ?? 50);
}

export type UpdateInput = {
  toEmail?: string;
  toName?: string | null;
  /** Full replacement lists; pass [] to clear. Omit to leave unchanged. */
  cc?: string[];
  bcc?: string[];
  subject?: string;
  body?: string;
  sendAtLocal?: string;
  timezone?: string;
};

/** Validates an edit without writing it. Used both before approval and at execution. */
export async function checkUpdate(accountId: string, jobId: string, changes: UpdateInput) {
  const job = await getJob(accountId, jobId);
  if (!job) return { ok: false as const, error: `No email with id ${jobId}.` };
  if (job.status !== 'pending') {
    return { ok: false as const, error: alreadyFinalMessage(job) };
  }
  const recipients = checkRecipients({
    to: changes.toEmail ?? job.toEmail,
    cc: changes.cc ?? job.cc,
    bcc: changes.bcc ?? job.bcc,
  });
  if (!recipients.ok) return { ok: false as const, error: recipients.error };
  if (changes.sendAtLocal || changes.timezone) {
    const time = resolveSendTime(changes.sendAtLocal ?? job.localSendAt, changes.timezone ?? job.timezone);
    if (!time.ok) return { ok: false as const, error: time.error };
    return { ok: true as const, job, time, recipients };
  }
  return { ok: true as const, job, time: null, recipients };
}

export async function updateJob(accountId: string, jobId: string, changes: UpdateInput) {
  const check = await checkUpdate(accountId, jobId, changes);
  if (!check.ok) return check;
  const { time, recipients } = check;
  const toChanged = changes.toEmail !== undefined && changes.toEmail.trim().toLowerCase() !== check.job.toEmail.toLowerCase();
  const newContact = toChanged
    ? await upsertContact(accountId, { email: recipients.to, name: changes.toName })
    : null;
  // `status = 'pending'` in the WHERE makes this safe against the sender claiming it meanwhile.
  const [job] = await db
    .update(emailJobs)
    .set({
      ...(newContact
        ? { toEmail: newContact.email, toName: changes.toName ?? newContact.name, contactId: newContact.id }
        : {}),
      ...(changes.cc !== undefined ? { cc: recipients.cc } : {}),
      ...(changes.bcc !== undefined ? { bcc: recipients.bcc } : {}),
      // Adding a Cc/Bcc that duplicates a changed To is already de-duplicated above.
      ...(changes.subject ? { subject: changes.subject.trim() } : {}),
      ...(changes.body ? { body: changes.body.trim() } : {}),
      ...(time
        ? { sendAt: time.sendAt, nextAttemptAt: time.sendAt, localSendAt: time.local, timezone: time.zone }
        : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(emailJobs.id, jobId), eq(emailJobs.accountId, accountId), eq(emailJobs.status, 'pending')))
    .returning();
  if (!job) return { ok: false as const, error: 'The email started sending before the change could be saved.' };
  return { ok: true as const, job };
}

export async function cancelJobs(accountId: string, jobIds: string[]) {
  const cancelled = await db
    .update(emailJobs)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(
      and(eq(emailJobs.accountId, accountId), inArray(emailJobs.id, jobIds), eq(emailJobs.status, 'pending')),
    )
    .returning();
  const cancelledIds = new Set(cancelled.map((j) => j.id));
  const notCancelled = jobIds.filter((id) => !cancelledIds.has(id));
  const others = notCancelled.length
    ? await db
        .select()
        .from(emailJobs)
        .where(and(eq(emailJobs.accountId, accountId), inArray(emailJobs.id, notCancelled)))
    : [];
  return {
    cancelled,
    skipped: notCancelled.map((id) => {
      const job = others.find((j) => j.id === id);
      return { id, reason: job ? alreadyFinalMessage(job) : 'not found' };
    }),
  };
}

export function alreadyFinalMessage(job: EmailJob) {
  switch (job.status) {
    case 'sent':
      return `Already sent${job.sentAt ? ` at ${formatInZone(job.sentAt, job.timezone)}` : ''}; it can't be changed.`;
    case 'sending':
      return 'It is being sent right now and can no longer be changed.';
    case 'cancelled':
      return 'It was already cancelled.';
    case 'failed':
      return 'It failed to send; schedule a new email instead.';
    default:
      return `Its status is ${job.status}.`;
  }
}

/** JSON shape shared by the API, the activity panel and approval cards. */
export function serializeJob(job: EmailJob) {
  return {
    id: job.id,
    toEmail: job.toEmail,
    toName: job.toName,
    cc: job.cc,
    bcc: job.bcc,
    subject: job.subject,
    body: job.body,
    sendAt: job.sendAt.toISOString(),
    localSendAt: job.localSendAt,
    timezone: job.timezone,
    status: job.status,
    attempts: job.attempts,
    lastError: job.lastError,
    sentAt: job.sentAt?.toISOString() ?? null,
  };
}
export type SerializedJob = ReturnType<typeof serializeJob>;
