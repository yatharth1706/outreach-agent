import { runTick } from '@/lib/sender';

export const maxDuration = 60;

/**
 * Scheduler heartbeat. Call it every minute with `Authorization: Bearer $CRON_SECRET`
 * from an external pinger (e.g. cron-job.org), or from Vercel Cron on the Pro plan
 * (Hobby only allows daily crons, so vercel.json deliberately has none).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  const result = await runTick();
  return Response.json(result);
}
