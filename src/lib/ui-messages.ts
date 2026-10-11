type Part = { type?: string; state?: string; approval?: { approved?: boolean; reason?: string } };

const isToolPart = (p: Part) => typeof p?.type === 'string' && (p.type.startsWith('tool-') || p.type === 'dynamic-tool');

/**
 * Cleans a conversation so it can always be sent to the model and validated by the AI SDK.
 * An interrupted request (page refreshed or closed mid-reply, network drop, or a server rule
 * rejecting something the user had just approved) can leave states the SDK and the model reject,
 * which would otherwise make every later message in the chat fail. Applied to messages we load,
 * receive and save.
 *
 *  - A tool call that never got an approval request or a result ("input-available", "input-streaming")
 *    is dropped: it can never be completed.
 *  - "output-denied" that still says approved is corrected to not approved (contradictory state).
 *  - Only the latest message may hold a live approval. Older unanswered cards become "declined", so
 *    nothing old can be approved or executed by accident later.
 *  - Assistant messages left with nothing in them are removed.
 */
export function sanitizeMessages<T extends { role: string; parts: unknown[] }>(messages: T[]): T[] {
  const last = messages.length - 1;
  const out: T[] = [];

  messages.forEach((message, index) => {
    if (message.role !== 'assistant') {
      out.push(message);
      return;
    }

    const parts: unknown[] = [];
    for (const raw of message.parts) {
      const part = raw as Part;
      if (!isToolPart(part)) {
        parts.push(raw);
        continue;
      }
      if (part.state === 'input-streaming' || part.state === 'input-available') continue;
      if (part.state === 'output-denied' && part.approval && part.approval.approved !== false) {
        parts.push({ ...part, approval: { ...part.approval, approved: false } });
        continue;
      }
      if ((part.state === 'approval-requested' || part.state === 'approval-responded') && index !== last) {
        parts.push({
          ...part,
          state: 'output-denied',
          approval: { ...part.approval, approved: false, reason: 'Superseded by a later message' },
        });
        continue;
      }
      parts.push(raw);
    }

    if (parts.some((p) => (p as Part)?.type !== 'step-start')) out.push({ ...message, parts });
  });

  return out;
}
