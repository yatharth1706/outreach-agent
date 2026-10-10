'use client';

import type { ReactNode } from 'react';
import type { AgentUIMessage } from '@/agent/agent';
import type { SerializedJob } from '@/lib/emails';
import { displayName, formatTime, localToIso, relative, userZone } from './format';

type Part = AgentUIMessage['parts'][number];
type PartOf<T extends Part['type']> = Extract<Part, { type: T }>;

export type Respond = (approvalId: string, approved: boolean) => void;
export type FindJob = (id: string) => SerializedJob | undefined;

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

const STATUS_STYLES: Record<SerializedJob['status'], string> = {
  pending: 'bg-accent-soft text-accent',
  sending: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  sent: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  failed: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  cancelled: 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400',
};
const STATUS_LABEL: Record<SerializedJob['status'], string> = {
  pending: 'Scheduled',
  sending: 'Sending',
  sent: 'Sent',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

export function StatusPill({ status }: { status: SerializedJob['status'] }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

/** "Tue 14 Oct, 14:00 · in 2 hr", plus the recipient's local time when they're elsewhere. */
export function WhenLine({ iso, zone }: { iso: string; zone: string }) {
  const other = zone !== userZone();
  return (
    <span>
      {formatTime(iso)} <span className="text-muted">· {relative(iso)}</span>
      {other && <span className="text-muted"> · {formatTime(iso, zone)} for them</span>}
    </span>
  );
}

function Card({
  title,
  tone = 'default',
  children,
  footer,
}: {
  title: ReactNode;
  tone?: 'default' | 'active' | 'muted';
  children: ReactNode;
  footer?: ReactNode;
}) {
  const border = tone === 'active' ? 'border-accent ring-2 ring-accent/15' : 'border-line';
  return (
    <div className={`my-2 overflow-hidden rounded-xl border bg-surface ${border} ${tone === 'muted' ? 'opacity-60' : ''}`}>
      <div className="border-b border-line px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted">
        {title}
      </div>
      <div className="px-4 py-3 text-sm">{children}</div>
      {footer && <div className="flex gap-2 border-t border-line px-4 py-3">{footer}</div>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 py-0.5">
      <span className="w-16 shrink-0 text-muted">{label}</span>
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}

function Body({ text }: { text?: string }) {
  if (!text) return null;
  return <p className="mt-3 whitespace-pre-wrap border-t border-line pt-3 leading-relaxed">{text}</p>;
}

function ApprovalButtons({ approvalId, onRespond, approveLabel }: { approvalId: string; onRespond: Respond; approveLabel: string }) {
  return (
    <>
      <button
        onClick={() => onRespond(approvalId, true)}
        className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
      >
        {approveLabel}
      </button>
      <button
        onClick={() => onRespond(approvalId, false)}
        className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-background"
      >
        Don&apos;t
      </button>
    </>
  );
}

function Note({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'error' }) {
  return (
    <div className={`my-1 text-xs ${tone === 'error' ? 'text-red-600 dark:text-red-400' : 'text-muted'}`}>{children}</div>
  );
}

/** Shared state machine for the three approval-gated tools. */
function approvalPhase(part: PartOf<'tool-schedule_email' | 'tool-update_scheduled' | 'tool-cancel_scheduled'>) {
  switch (part.state) {
    case 'input-streaming':
    case 'input-available':
      return { kind: 'drafting' as const };
    case 'approval-requested':
      return part.approval.isAutomatic ? { kind: 'drafting' as const } : { kind: 'awaiting' as const, id: part.approval.id };
    case 'approval-responded':
      return part.approval.approved ? { kind: 'working' as const } : { kind: 'declined' as const };
    case 'output-denied':
      return part.approval?.isAutomatic
        ? { kind: 'auto-denied' as const, reason: part.approval.reason }
        : { kind: 'declined' as const };
    case 'output-error':
      return { kind: 'error' as const, error: part.errorText };
    case 'output-available':
      return { kind: 'done' as const };
  }
}

// ---------------------------------------------------------------------------
// Tool parts
// ---------------------------------------------------------------------------

export function ScheduleEmailPart({ part, onRespond }: { part: PartOf<'tool-schedule_email'>; onRespond: Respond }) {
  const phase = approvalPhase(part);
  const input = part.input ?? {};
  if (phase.kind === 'auto-denied') return <Note>Adjusting the draft: {phase.reason}</Note>;
  if (phase.kind === 'error') return <Note tone="error">Couldn&apos;t schedule: {phase.error}</Note>;

  const output = part.state === 'output-available' ? part.output : undefined;
  if (output && !output.ok) return <Note tone="error">Couldn&apos;t schedule: {output.error}</Note>;

  const iso = localToIso(input.send_at_local, input.timezone);
  const title = {
    drafting: 'Drafting email…',
    awaiting: 'Review before scheduling',
    working: 'Scheduling…',
    declined: 'Not scheduled',
    done: <span className="text-emerald-700 dark:text-emerald-400">Scheduled ✓</span>,
  }[phase.kind];

  return (
    <Card
      title={title}
      tone={phase.kind === 'awaiting' ? 'active' : phase.kind === 'declined' ? 'muted' : 'default'}
      footer={
        phase.kind === 'awaiting' && (
          <ApprovalButtons approvalId={phase.id} onRespond={onRespond} approveLabel="Approve & schedule" />
        )
      }
    >
      <Field label="To">{input.to_email ? displayName(input.to_name, input.to_email) : '…'}</Field>
      <Field label="When">{iso && input.timezone ? <WhenLine iso={iso} zone={input.timezone} /> : '…'}</Field>
      <Field label="Subject">{input.subject ?? '…'}</Field>
      <Body text={input.body} />
    </Card>
  );
}

export function UpdateScheduledPart({
  part,
  onRespond,
  findJob,
}: {
  part: PartOf<'tool-update_scheduled'>;
  onRespond: Respond;
  findJob: FindJob;
}) {
  const phase = approvalPhase(part);
  const input = part.input ?? {};
  if (phase.kind === 'auto-denied') return <Note>Couldn&apos;t change it: {phase.reason}</Note>;
  if (phase.kind === 'error') return <Note tone="error">Couldn&apos;t change it: {phase.error}</Note>;
  const output = part.state === 'output-available' ? part.output : undefined;
  if (output && !output.ok) return <Note tone="error">Couldn&apos;t change it: {output.error}</Note>;

  const job = input.job_id ? findJob(input.job_id) : undefined;
  const newZone = input.timezone ?? job?.timezone;
  const newIso = input.send_at_local || input.timezone
    ? localToIso(input.send_at_local ?? job?.localSendAt, newZone)
    : null;
  const title = {
    drafting: 'Preparing change…',
    awaiting: 'Review change',
    working: 'Saving…',
    declined: 'Not changed',
    done: <span className="text-emerald-700 dark:text-emerald-400">Updated ✓</span>,
  }[phase.kind];

  return (
    <Card
      title={title}
      tone={phase.kind === 'awaiting' ? 'active' : phase.kind === 'declined' ? 'muted' : 'default'}
      footer={phase.kind === 'awaiting' && <ApprovalButtons approvalId={phase.id} onRespond={onRespond} approveLabel="Approve change" />}
    >
      {job && <Field label="To">{displayName(job.toName, job.toEmail)}</Field>}
      {newIso && newZone ? (
        <Field label="When">
          {job && <span className="text-muted line-through">{formatTime(job.sendAt)}</span>}{' '}
          <WhenLine iso={newIso} zone={newZone} />
        </Field>
      ) : (
        job && <Field label="When"><WhenLine iso={job.sendAt} zone={job.timezone} /></Field>
      )}
      <Field label="Subject">{input.subject ?? job?.subject ?? '…'}</Field>
      {input.body && <Body text={input.body} />}
    </Card>
  );
}

export function CancelScheduledPart({
  part,
  onRespond,
  findJob,
}: {
  part: PartOf<'tool-cancel_scheduled'>;
  onRespond: Respond;
  findJob: FindJob;
}) {
  const phase = approvalPhase(part);
  if (phase.kind === 'auto-denied') return <Note>{phase.reason}</Note>;
  if (phase.kind === 'error') return <Note tone="error">Couldn&apos;t cancel: {phase.error}</Note>;

  const ids = (part.input?.job_ids ?? []).filter((id): id is string => typeof id === 'string');
  const count = ids.length;
  const title = {
    drafting: 'Finding emails…',
    awaiting: `Cancel ${count} email${count === 1 ? '' : 's'}?`,
    working: 'Cancelling…',
    declined: 'Kept as scheduled',
    done: <span className="text-emerald-700 dark:text-emerald-400">Cancelled ✓</span>,
  }[phase.kind];

  return (
    <Card
      title={title}
      tone={phase.kind === 'awaiting' ? 'active' : phase.kind === 'declined' ? 'muted' : 'default'}
      footer={phase.kind === 'awaiting' && <ApprovalButtons approvalId={phase.id} onRespond={onRespond} approveLabel="Cancel them" />}
    >
      <ul className="divide-y divide-line">
        {ids.map((id) => {
          const job = findJob(id);
          return (
            <li key={id} className="py-1.5">
              {job ? (
                <>
                  <div className="font-medium">{job.subject}</div>
                  <div className="text-muted">
                    {displayName(job.toName, job.toEmail)} · {formatTime(job.sendAt)}
                  </div>
                </>
              ) : (
                <span className="text-muted">Email {id.slice(0, 8)}</span>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** One-line trace for read-only tools, so the user can see what the agent looked at. */
export function ReadToolPart({ part }: { part: PartOf<'tool-find_contacts' | 'tool-list_scheduled' | 'tool-save_contact'> }) {
  const done = part.state === 'output-available';
  let text: string;
  switch (part.type) {
    case 'tool-find_contacts':
      text = done
        ? `Found ${part.output.length} contact${part.output.length === 1 ? '' : 's'} for “${part.input.query}”`
        : 'Searching contacts…';
      break;
    case 'tool-list_scheduled':
      text = done ? `Checked emails (${part.output.length} found)` : 'Checking emails…';
      break;
    case 'tool-save_contact':
      text = done ? `Saved contact ${part.input.name ?? part.input.email}` : 'Saving contact…';
      break;
  }
  if (part.state === 'output-error') return <Note tone="error">{part.errorText}</Note>;
  return <Note>↳ {text}</Note>;
}
