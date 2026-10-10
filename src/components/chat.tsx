'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, isToolUIPart, lastAssistantMessageIsCompleteWithApprovalResponses } from 'ai';
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import type { AgentUIMessage } from '@/agent/agent';
import { userZone } from './format';
import {
  CancelScheduledPart,
  ReadToolPart,
  ScheduleEmailPart,
  UpdateScheduledPart,
  type FindJob,
} from './tool-parts';

const transport = new DefaultChatTransport<AgentUIMessage>({
  api: '/api/chat',
  body: () => ({ timezone: userZone() }),
});

const EXAMPLES = [
  'Email sarah@acme.com in 5 minutes saying thanks for the demo today',
  'Send rahul@globex.io a pricing follow-up tomorrow at 9am his time, he is in London',
  "What's going out this week?",
  'Push the Sarah email to Thursday 2pm',
];

export function Chat({
  initialMessages,
  findJob,
  onActivity,
}: {
  initialMessages: AgentUIMessage[];
  findJob: FindJob;
  onActivity: () => void;
}) {
  const [input, setInput] = useState('');
  // Lets us deny stale approval cards without immediately re-sending (see submit).
  const holdAutoSend = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { messages, setMessages, sendMessage, addToolApprovalResponse, status, error, stop } =
    useChat<AgentUIMessage>({
      messages: initialMessages,
      transport,
      sendAutomaticallyWhen: (opts) =>
        !holdAutoSend.current && lastAssistantMessageIsCompleteWithApprovalResponses(opts),
      onFinish: onActivity,
    });

  const busy = status === 'submitted' || status === 'streaming';

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const pendingApprovals = messages
    .at(-1)
    ?.parts.filter(isToolUIPart)
    .filter((p) => p.state === 'approval-requested' && !p.approval.isAutomatic);

  async function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setInput('');
    // Typing instead of clicking ("make it 3pm") means "not this version": decline open
    // cards first so the conversation stays valid, then send the new instruction.
    if (pendingApprovals?.length) {
      holdAutoSend.current = true;
      for (const p of pendingApprovals) {
        if (p.state === 'approval-requested') {
          await addToolApprovalResponse({
            id: p.approval.id,
            approved: false,
            reason: 'The user replied with a new message instead of approving. Follow that message.',
          });
        }
      }
      holdAutoSend.current = false;
    }
    sendMessage({ text: trimmed });
  }

  function respond(approvalId: string, approved: boolean) {
    addToolApprovalResponse({ id: approvalId, approved });
  }

  async function newChat() {
    if (busy) stop();
    await fetch('/api/chat', { method: 'DELETE' });
    setMessages([]);
    inputRef.current?.focus();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl px-4 py-6">
          {messages.length === 0 ? (
            <EmptyState onPick={(t) => { setInput(t); inputRef.current?.focus(); }} />
          ) : (
            <div className="flex justify-end">
              <button onClick={newChat} className="text-xs text-muted hover:text-foreground">
                New conversation
              </button>
            </div>
          )}
          {messages.map((m) => (
            <Message key={m.id} message={m} onRespond={respond} findJob={findJob} />
          ))}
          {status === 'submitted' && <div className="my-3 text-sm text-muted animate-pulse">Thinking…</div>}
          {error && (
            <div className="my-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
              Something went wrong: {error.message}
            </div>
          )}
        </div>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); submit(input); }}
        className="border-t border-line bg-surface"
      >
        <div className="mx-auto flex w-full max-w-2xl items-end gap-2 px-4 py-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(input); }
            }}
            rows={1}
            placeholder={pendingApprovals?.length ? 'Approve above, or say what to change…' : 'Email Sarah tomorrow at 2pm about…'}
            className="max-h-40 min-h-11 flex-1 resize-none rounded-xl border border-line bg-background px-3 py-2.5 text-sm outline-none focus:border-accent"
            autoFocus
          />
          {busy ? (
            <button type="button" onClick={stop} className="h-11 rounded-xl border border-line px-4 text-sm">
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="h-11 rounded-xl bg-accent px-4 text-sm font-medium text-white disabled:opacity-40"
            >
              Send
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="py-10">
      <h1 className="text-2xl font-semibold tracking-tight">What should go out, and when?</h1>
      <p className="mt-2 text-sm text-muted">
        Describe the email in plain English. You&apos;ll see a preview to approve before anything is scheduled.
      </p>
      <div className="mt-6 grid gap-2 sm:grid-cols-2">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            onClick={() => onPick(ex)}
            className="rounded-xl border border-line bg-surface px-3 py-2.5 text-left text-sm hover:border-accent"
          >
            {ex}
          </button>
        ))}
      </div>
    </div>
  );
}

function Message({
  message,
  onRespond,
  findJob,
}: {
  message: AgentUIMessage;
  onRespond: (id: string, approved: boolean) => void;
  findJob: FindJob;
}) {
  if (message.role === 'user') {
    const text = message.parts.map((p) => (p.type === 'text' ? p.text : '')).join('');
    return (
      <div className="my-3 flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-sm text-white">
          {text}
        </div>
      </div>
    );
  }

  return (
    <div className="my-3">
      {message.parts.map((part, i) => {
        const key = `${message.id}-${i}`;
        switch (part.type) {
          case 'text':
            return <RichText key={key} text={part.text} />;
          case 'tool-schedule_email':
            return <ScheduleEmailPart key={key} part={part} onRespond={onRespond} />;
          case 'tool-update_scheduled':
            return <UpdateScheduledPart key={key} part={part} onRespond={onRespond} findJob={findJob} />;
          case 'tool-cancel_scheduled':
            return <CancelScheduledPart key={key} part={part} onRespond={onRespond} findJob={findJob} />;
          case 'tool-find_contacts':
          case 'tool-list_scheduled':
          case 'tool-save_contact':
            return <ReadToolPart key={key} part={part} />;
          default:
            return null;
        }
      })}
    </div>
  );
}

/** Just enough markdown for agent replies: paragraphs, "- " lists and **bold**. */
function RichText({ text }: { text: string }) {
  const blocks = text.trim().split(/\n{2,}/);
  return (
    <div className="space-y-2 text-sm leading-relaxed">
      {blocks.map((block, i) => {
        const lines = block.split('\n');
        if (lines.every((l) => /^\s*[-*•] /.test(l))) {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*[-*•] /, ''))}</li>)}
            </ul>
          );
        }
        return (
          <p key={i}>
            {lines.map((l, j) => <Fragment key={j}>{j > 0 && <br />}{inline(l)}</Fragment>)}
          </p>
        );
      })}
    </div>
  );
}

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((chunk, i) =>
    chunk.startsWith('**') && chunk.endsWith('**') ? <strong key={i}>{chunk.slice(2, -2)}</strong> : chunk,
  );
}
