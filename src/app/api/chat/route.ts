import { createAgentUIStreamResponse } from 'ai';
import { eq } from 'drizzle-orm';
import { createAgent, draftEditsSchema, type AgentUIMessage } from '@/agent/agent';
import { db, schema } from '@/db';
import { clearChat, saveChat } from '@/lib/chats';
import { getSessionAccount } from '@/lib/session';
import { isValidZone } from '@/lib/time';

export const maxDuration = 60;

export async function POST(req: Request) {
  const account = await getSessionAccount();
  if (!account) return new Response('Unauthorized', { status: 401 });

  const { messages, timezone, edits: rawEdits }: { messages: AgentUIMessage[]; timezone?: string; edits?: unknown } =
    await req.json();

  // Edits the user made on a draft card before approving it (see draftEditSchema).
  const parsedEdits = draftEditsSchema.safeParse(rawEdits ?? {});
  if (!parsedEdits.success) return new Response('Invalid draft edits', { status: 400 });

  // The browser's zone is the source of truth for "2pm"; remember it for display elsewhere.
  const userZone = timezone && isValidZone(timezone) ? timezone : account.timezone;
  if (userZone !== account.timezone) {
    await db.update(schema.accounts).set({ timezone: userZone }).where(eq(schema.accounts.id, account.id));
  }

  return createAgentUIStreamResponse({
    agent: createAgent(account, userZone, parsedEdits.data),
    uiMessages: messages,
    abortSignal: req.signal,
    originalMessages: messages,
    onEnd: async ({ messages }) => saveChat(account.id, messages),
    onError: (error) => {
      console.error('[chat] agent error', error);
      return describeAgentError(error);
    },
  });
}

/** Start a fresh conversation. Scheduled emails are untouched. */
export async function DELETE() {
  const account = await getSessionAccount();
  if (!account) return new Response('Unauthorized', { status: 401 });
  await clearChat(account.id);
  return new Response(null, { status: 204 });
}

/** Turns provider failures into a message the user can act on instead of "An error occurred." */
function describeAgentError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  const body = String((error as { responseBody?: unknown })?.responseBody ?? '');
  const detail = `${text} ${body}`;
  if (/credit card|customer_verification_required/i.test(detail)) {
    return 'The AI provider needs a payment method on file before it will answer.';
  }
  if (/api key|unauthori[sz]ed|permission|401|403/i.test(detail)) {
    return 'The AI provider rejected the API key. Check the key in .env.local.';
  }
  if (/quota|rate.?limit|429|overloaded|503/i.test(detail)) {
    return 'The AI provider is rate-limiting or overloaded. Try again in a moment.';
  }
  return 'The AI model request failed. Check the server log for details.';
}
