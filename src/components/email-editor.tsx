'use client';

import { useState } from 'react';
import { checkRecipients } from '@/lib/recipients';
import { parseAddressList } from './format';

export type EditorValues = {
  to_email: string;
  cc: string[];
  bcc: string[];
  subject: string;
  body: string;
  /** Wall-clock `yyyy-MM-ddTHH:mm` in the viewer's timezone. Only present when `showWhen` is set. */
  when?: string;
};

const inputClass =
  'w-full rounded-lg border border-line bg-background px-2.5 py-1.5 text-sm outline-none focus:border-accent';

/**
 * Edit form for an email's recipients, subject, body and (optionally) send time.
 * Validates with the same rules the server uses; `onSave` may return an error message to show.
 */
export function EmailEditor({
  initial,
  showWhen,
  saveLabel,
  onSave,
  onCancel,
}: {
  initial: EditorValues;
  showWhen?: boolean;
  saveLabel: string;
  onSave: (values: EditorValues) => Promise<string | void> | string | void;
  onCancel: () => void;
}) {
  const [to, setTo] = useState(initial.to_email);
  const [cc, setCc] = useState(initial.cc.join(', '));
  const [bcc, setBcc] = useState(initial.bcc.join(', '));
  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState(initial.body);
  const [when, setWhen] = useState(initial.when ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    const recipients = checkRecipients({ to, cc: parseAddressList(cc), bcc: parseAddressList(bcc) });
    if (!recipients.ok) return setError(recipients.error);
    if (!subject.trim()) return setError('Subject can\'t be empty.');
    if (!body.trim()) return setError('The email body can\'t be empty.');
    if (showWhen && !when) return setError('Pick a send time.');
    setError(null);
    setSaving(true);
    const message = await onSave({
      to_email: recipients.to,
      cc: recipients.cc,
      bcc: recipients.bcc,
      subject: subject.trim(),
      body: body.trim(),
      ...(showWhen ? { when } : {}),
    });
    setSaving(false);
    if (message) setError(message);
  }

  return (
    <div className="space-y-2 text-sm">
      <Row label="To">
        <input value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} type="email" />
      </Row>
      <Row label="Cc">
        <input value={cc} onChange={(e) => setCc(e.target.value)} className={inputClass} placeholder="Optional, comma-separated" />
      </Row>
      <Row label="Bcc">
        <input value={bcc} onChange={(e) => setBcc(e.target.value)} className={inputClass} placeholder="Optional, comma-separated" />
      </Row>
      {showWhen && (
        <Row label="When">
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={inputClass} />
        </Row>
      )}
      <Row label="Subject">
        <input value={subject} onChange={(e) => setSubject(e.target.value)} className={inputClass} />
      </Row>
      <Row label="Body">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={Math.min(14, Math.max(5, body.split('\n').length + 1))}
          className={`${inputClass} resize-y leading-relaxed`}
        />
      </Row>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex gap-2 pt-1">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {saving ? 'Saving…' : saveLabel}
        </button>
        <button onClick={onCancel} className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-background">
          Cancel
        </button>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-start gap-3">
      <span className="w-14 shrink-0 pt-1.5 text-muted">{label}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </label>
  );
}
