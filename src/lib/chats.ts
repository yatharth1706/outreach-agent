import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import type { AgentUIMessage } from '@/agent/agent';
import { repairToolParts } from './ui-messages';

export async function loadChat(accountId: string): Promise<AgentUIMessage[]> {
  const row = await db.query.chats.findFirst({ where: eq(schema.chats.accountId, accountId) });
  return repairToolParts((row?.messages as AgentUIMessage[] | undefined) ?? []);
}

export async function saveChat(accountId: string, messages: AgentUIMessage[]) {
  await db
    .insert(schema.chats)
    .values({ accountId, messages: repairToolParts(messages) })
    .onConflictDoUpdate({
      target: schema.chats.accountId,
      set: { messages: repairToolParts(messages), updatedAt: new Date() },
    });
}

export async function clearChat(accountId: string) {
  await db.delete(schema.chats).where(eq(schema.chats.accountId, accountId));
}
