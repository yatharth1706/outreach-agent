/**
 * Repairs a state the AI SDK can produce on the client: when the user clicks Approve but the server
 * then denies the call (for example its rules changed while they were reviewing), the saved part is
 * "output-denied" yet still carries approved: true. The SDK's own validation rejects that
 * contradiction, which would make every later request in the conversation fail.
 *
 * Applied to messages we load, receive and save, so one bad part can never lock a chat.
 */
export function repairToolParts<T extends { parts: unknown[] }>(messages: T[]): T[] {
  return messages.map((message) => {
    let changed = false;
    const parts = message.parts.map((part) => {
      const p = part as { state?: string; approval?: { approved?: boolean } };
      if (p?.state === 'output-denied' && p.approval && p.approval.approved !== false) {
        changed = true;
        return { ...p, approval: { ...p.approval, approved: false } };
      }
      return part;
    });
    return changed ? { ...message, parts } : message;
  });
}
