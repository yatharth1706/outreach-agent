import { listJobs, serializeJob } from '@/lib/emails';
import { getSessionAccount } from '@/lib/session';

export async function GET() {
  const account = await getSessionAccount();
  if (!account) return new Response('Unauthorized', { status: 401 });

  const [upcoming, recent] = await Promise.all([
    listJobs(account.id, { status: 'pending', limit: 100 }),
    listJobs(account.id, { status: 'all', limit: 50 }),
  ]);
  return Response.json({
    upcoming: upcoming.map(serializeJob),
    history: recent.filter((j) => j.status !== 'pending').map(serializeJob),
  });
}
