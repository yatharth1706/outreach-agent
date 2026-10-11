'use client';

import { useState } from 'react';
import type { SerializedJob } from '@/lib/emails';
import { EmailEditor } from './email-editor';
import { displayName, formatTime, relative, toLocalInput, userZone } from './format';
import type { JobsData } from './use-jobs';
import { StatusPill } from './tool-parts';

export function ActivityPanel({
  data,
  loaded,
  onChanged,
}: {
  data: JobsData;
  loaded: boolean;
  onChanged: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <Section title="Upcoming" count={data.upcoming.length}>
          {loaded && !data.upcoming.length && (
            <p className="px-1 py-3 text-sm text-muted">Nothing scheduled yet.</p>
          )}
          {data.upcoming.map((job) => <JobRow key={job.id} job={job} onChanged={onChanged} />)}
        </Section>
        {data.history.length > 0 && (
          <Section title="History" count={data.history.length}>
            {data.history.map((job) => <JobRow key={job.id} job={job} onChanged={onChanged} />)}
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted">
        {title} <span className="rounded-full bg-line px-1.5 py-px text-[10px]">{count}</span>
      </h2>
      <ul className="space-y-2">{children}</ul>
    </section>
  );
}

function JobRow({ job, onChanged }: { job: SerializedJob; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const time = job.status === 'sent' && job.sentAt ? job.sentAt : job.sendAt;

  async function cancel() {
    const res = await fetch(`/api/jobs/${job.id}/cancel`, { method: 'POST' });
    if (!res.ok) setError((await res.json()).error ?? 'Could not cancel');
    setConfirming(false);
    onChanged();
  }

  return (
    <li className="rounded-xl border border-line bg-surface">
      <button onClick={() => setOpen(!open)} className="w-full px-3 py-2.5 text-left">
        <div className="flex items-start justify-between gap-2">
          <span className="truncate text-sm font-medium">{job.subject}</span>
          <StatusPill status={job.status} />
        </div>
        <div className="mt-0.5 truncate text-xs text-muted">{displayName(job.toName, job.toEmail)}</div>
        {(job.cc.length > 0 || job.bcc.length > 0) && (
          <div className="truncate text-xs text-muted">
            {job.cc.length > 0 && `Cc ${job.cc.join(', ')}`}
            {job.cc.length > 0 && job.bcc.length > 0 && ' · '}
            {job.bcc.length > 0 && `Bcc ${job.bcc.join(', ')}`}
          </div>
        )}
        <div className="mt-1 text-xs text-muted">
          {formatTime(time)} · {relative(time)}
        </div>
        {job.lastError && job.status !== 'sent' && (
          <div className="mt-1 text-xs text-red-600 dark:text-red-400">{job.lastError}</div>
        )}
      </button>
      {open && (
        <div className="border-t border-line px-3 py-2.5">
          {editing ? (
            <EmailEditor
              showWhen
              saveLabel="Save changes"
              initial={{
                to_email: job.toEmail,
                cc: job.cc,
                bcc: job.bcc,
                subject: job.subject,
                body: job.body,
                when: toLocalInput(job.sendAt),
              }}
              onCancel={() => setEditing(false)}
              onSave={async (v) => {
                // Only send the time if it was changed, so an untouched email keeps its recipient-zone time.
                const timeChanged = v.when !== toLocalInput(job.sendAt);
                const res = await fetch(`/api/jobs/${job.id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    to_email: v.to_email,
                    cc: v.cc,
                    bcc: v.bcc,
                    subject: v.subject,
                    body: v.body,
                    ...(timeChanged ? { send_at_local: v.when, timezone: userZone() } : {}),
                  }),
                });
                if (!res.ok) return (await res.json().catch(() => null))?.error ?? 'Could not save the changes.';
                setEditing(false);
                onChanged();
              }}
            />
          ) : (
            <>
              <p className="whitespace-pre-wrap text-xs leading-relaxed">{job.body}</p>
              {job.status === 'pending' && (
                <div className="mt-3 flex items-center gap-2">
                  {confirming ? (
                    <>
                      <button onClick={cancel} className="rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white">
                        Confirm cancel
                      </button>
                      <button onClick={() => setConfirming(false)} className="text-xs text-muted">Keep</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => setEditing(true)} className="rounded-md border border-line px-2 py-1 text-xs">
                        Edit
                      </button>
                      <button onClick={() => setConfirming(true)} className="rounded-md border border-line px-2 py-1 text-xs">
                        Cancel email
                      </button>
                    </>
                  )}
                </div>
              )}
            </>
          )}
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        </div>
      )}
    </li>
  );
}
