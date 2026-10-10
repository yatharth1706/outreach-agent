import { createAgentUIStreamResponse } from 'ai';
import { eq } from 'drizzle-orm';
import { createAgent, type AgentUIMessage } from '@/agent/agent';
import { db, schema } from '@/db';
import { clearChat, saveChat } from '@/lib/chats';
import { getSessionAccount } from '@/lib/session';
import { isValidZone } from '@/lib/time';

export const maxDuration = 60;

export async function POST(req: Request) {
  const account = await getSessionAccount();
  if (!account) return new Response('Unauthorized', { status: 401 });

  const { messages, timezone }: { messages: AgentUIMessage[]; timezone?: string } = await req.json();

  // The browser's zone is the source of truth for "2pm"; remember it for display elsewhere.
  const userZone = timezone && isValidZone(timezone) ? timezone : account.timezone;
  if (userZone !== account.timezone) {
    await db.update(schema.accounts).set({ timezone: userZone }).where(eq(schema.accounts.id, account.id));
  }

  return createAgentUIStreamResponse({
    agent: createAgent(account, userZone),
    uiMessages: messages,
    abortSignal: req.signal,
    originalMessages: messages,
    onEnd: async ({ messages }) => saveChat(account.id, messages),
  });
}

/** Start a fresh conversation. Scheduled emails are untouched. */
export async function DELETE() {
  const account = await getSessionAccount();
  if (!account) return new Response('Unauthorized', { status: 401 });
  await clearChat(account.id);
  return new Response(null, { status: 204 });
}
