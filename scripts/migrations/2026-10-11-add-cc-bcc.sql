-- Adds Cc/Bcc recipients to scheduled emails. Run once in the Neon SQL editor BEFORE deploying the matching code.
ALTER TABLE "email_jobs" ADD COLUMN IF NOT EXISTS "cc" text[] DEFAULT '{}' NOT NULL;
ALTER TABLE "email_jobs" ADD COLUMN IF NOT EXISTS "bcc" text[] DEFAULT '{}' NOT NULL;
