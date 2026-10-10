import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name'),
  timezone: text('timezone').notNull().default('UTC'),
  // AES-256-GCM encrypted Google refresh token (see lib/crypto.ts).
  refreshTokenEnc: text('refresh_token_enc'),
  ...timestamps,
});

export const contacts = pgTable(
  'contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    name: text('name'),
    // Stored lower-cased so the unique index matches case-insensitively.
    email: text('email').notNull(),
    company: text('company'),
    timezone: text('timezone'),
    note: text('note'),
    ...timestamps,
  },
  (t) => [uniqueIndex('contacts_account_email_idx').on(t.accountId, t.email)],
);

export const JOB_STATUSES = ['pending', 'sending', 'sent', 'failed', 'cancelled'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const emailJobs = pgTable(
  'email_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    toEmail: text('to_email').notNull(),
    toName: text('to_name'),
    subject: text('subject').notNull(),
    body: text('body').notNull(),
    // The exact instant to send (UTC). `localSendAt` + `timezone` keep what the user asked for.
    sendAt: timestamp('send_at', { withTimezone: true }).notNull(),
    localSendAt: text('local_send_at').notNull(),
    timezone: text('timezone').notNull(),
    status: text('status').$type<JobStatus>().notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    // When the scheduler may next pick the job up; differs from sendAt only after a retry.
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull(),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    lastError: text('last_error'),
    gmailMessageId: text('gmail_message_id'),
    gmailThreadId: text('gmail_thread_id'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index('email_jobs_due_idx').on(t.status, t.nextAttemptAt),
    index('email_jobs_account_idx').on(t.accountId, t.sendAt),
  ],
);

// One running conversation per account, stored as AI SDK UI messages.
export const chats = pgTable('chats', {
  accountId: uuid('account_id')
    .primaryKey()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  messages: jsonb('messages').notNull().default([]),
  ...timestamps,
});

export type Account = typeof accounts.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type EmailJob = typeof emailJobs.$inferSelect;
