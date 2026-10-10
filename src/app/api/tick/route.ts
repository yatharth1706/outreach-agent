import { runTick } from '@/lib/sender';

export const maxDuration = 60;

/**
 * Scheduler heartbeat, called every minute by Vercel Cron (or an external pinger).
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET` automatically.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  const result = await runTick();
  return Response.json(result);
}
