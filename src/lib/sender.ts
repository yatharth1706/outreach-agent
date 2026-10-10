import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { db, schema } from '@/db';
import type { Account, EmailJob } from '@/db/schema';
import { decrypt } from './crypto';
import { GoogleApiError, sendGmail } from './google';

const { accounts, emailJobs } = schema;

const BATCH_SIZE = 25;
const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MIN = [1, 5, 15];
const DAILY_SEND_CAP = 50;
const STALE_SENDING_MIN = 10;
const MAX_LATENESS_HOURS = 24;

type Transport = (account: Account, job: EmailJob) => Promise<{ messageId: string; threadId: string }>;

const gmailTransport: Transport = async (account, job) => {
  if (!account.refreshTokenEnc) {
    throw new GoogleApiError('Gmail is not connected. Sign in with Google to connect it.', 401, false);
  }
  return sendGmail(decrypt(account.refreshTokenEnc), {
    from: account.email,
    fromName: account.name,
    to: job.toEmail,
    toName: job.toName,
    subject: job.subject,
    body: job.body,
  });
};

/** Dev-only transport: logs instead of sending, so the pipeline can be tested without Google. */
const logTransport: Transport = async (account, job) => {
  console.log(`[log transport] ${account.email} -> ${job.toEmail}: ${job.subject}`);
  return { messageId: `log-${job.id}`, threadId: `log-${job.id}` };
};

function transport(): Transport {
  if (process.env.EMAIL_TRANSPORT === 'log' && process.env.NODE_ENV !== 'production') return logTransport;
  return gmailTransport;
}

export type TickResult = { claimed: number; sent: number; retried: number; failed: number; recovered: number };

/**
 * One scheduler pass. Safe to run concurrently: jobs are claimed with
 * FOR UPDATE SKIP LOCKED, so each one is handed to exactly one worker.
 */
export async function runTick(): Promise<TickResult> {
  const result: TickResult = { claimed: 0, sent: 0, retried: 0, failed: 0, recovered: 0 };

  // A job stuck in `sending` means a worker died mid-send. Gmail has no idempotency
  // key, so we can't know if it went out: fail it loudly rather than risk a duplicate.
  const stale = await db
    .update(emailJobs)
    .set({
      status: 'failed',
      lastError: 'Send outcome unknown (the worker stopped mid-send). Check your Gmail Sent folder before resending.',
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(emailJobs.status, 'sending'),
        sql`${emailJobs.claimedAt} < now() - make_interval(mins => ${STALE_SENDING_MIN})`,
      ),
    )
    .returning({ id: emailJobs.id });
  result.recovered = stale.length;

  const claimed = await db.execute<{ id: string }>(sql`
    UPDATE email_jobs
       SET status = 'sending', claimed_at = now(), attempts = attempts + 1, updated_at = now()
     WHERE id IN (
       SELECT id FROM email_jobs
        WHERE status = 'pending' AND next_attempt_at <= now()
        ORDER BY next_attempt_at
        LIMIT ${BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
     )
    RETURNING id`);
  const ids = claimed.rows.map((r) => r.id);
  result.claimed = ids.length;
  if (!ids.length) return result;

  const jobs = await db.select().from(emailJobs).where(inArray(emailJobs.id, ids));
  const accountRows = await db
    .select()
    .from(accounts)
    .where(inArray(accounts.id, [...new Set(jobs.map((j) => j.accountId))]));
  const accountsById = new Map(accountRows.map((a) => [a.id, a]));

  for (const job of jobs) {
    const outcome = await processJob(job, accountsById.get(job.accountId)!);
    result[outcome] += 1;
  }
  return result;
}

async function processJob(job: EmailJob, account: Account): Promise<'sent' | 'retried' | 'failed'> {
  const hoursLate = (Date.now() - job.sendAt.getTime()) / 3_600_000;
  if (hoursLate > MAX_LATENESS_HOURS) {
    await finish(job.id, {
      status: 'failed',
      lastError: `Missed by more than ${MAX_LATENESS_HOURS}h (the scheduler was offline). Reschedule it if you still want it sent.`,
    });
    return 'failed';
  }

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(emailJobs)
    .where(
      and(
        eq(emailJobs.accountId, account.id),
        eq(emailJobs.status, 'sent'),
        gte(emailJobs.sentAt, new Date(Date.now() - 24 * 3_600_000)),
      ),
    );
  if (count >= DAILY_SEND_CAP) {
    await finish(job.id, {
      status: 'pending',
      attempts: job.attempts - 1,
      nextAttemptAt: new Date(Date.now() + 60 * 60_000),
      lastError: `Daily cap of ${DAILY_SEND_CAP} emails reached; will retry in 1 hour.`,
    });
    return 'retried';
  }

  try {
    const { messageId, threadId } = await transport()(account, job);
    await finish(job.id, {
      status: 'sent',
      sentAt: new Date(),
      gmailMessageId: messageId,
      gmailThreadId: threadId,
      lastError: null,
    });
    return 'sent';
  } catch (err) {
    const retryable = err instanceof GoogleApiError ? err.retryable : true;
    const message = err instanceof Error ? err.message : String(err);
    if (retryable && job.attempts < MAX_ATTEMPTS) {
      const delayMin = RETRY_DELAYS_MIN[job.attempts - 1] ?? RETRY_DELAYS_MIN.at(-1)!;
      await finish(job.id, {
        status: 'pending',
        nextAttemptAt: new Date(Date.now() + delayMin * 60_000),
        lastError: `${message} (retrying in ${delayMin} min)`,
      });
      return 'retried';
    }
    await finish(job.id, { status: 'failed', lastError: message });
    return 'failed';
  }
}

async function finish(jobId: string, values: Partial<typeof emailJobs.$inferInsert>) {
  await db
    .update(emailJobs)
    .set({ ...values, updatedAt: new Date() })
    .where(and(eq(emailJobs.id, jobId), eq(emailJobs.status, 'sending')));
}
