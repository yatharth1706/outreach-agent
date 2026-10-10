import { cancelJobs, serializeJob } from '@/lib/emails';
import { getSessionAccount } from '@/lib/session';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const account = await getSessionAccount();
  if (!account) return new Response('Unauthorized', { status: 401 });

  const { id } = await params;
  const { cancelled, skipped } = await cancelJobs(account.id, [id]);
  if (!cancelled.length) return Response.json({ error: skipped[0]?.reason }, { status: 409 });
  return Response.json(serializeJob(cancelled[0]));
}
