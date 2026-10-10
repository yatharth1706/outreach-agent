/**
 * Local stand-in for Vercel Cron: calls /api/tick every 30 s.
 * Usage: pnpm tick   (needs `pnpm dev` running and CRON_SECRET in .env.local)
 */
try {
  process.loadEnvFile('.env.local');
} catch {}

const url = `${process.env.TICK_URL ?? 'http://localhost:3100'}/api/tick`;
const INTERVAL_MS = 30_000;

async function tick() {
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
    const body = await res.text();
    console.log(new Date().toLocaleTimeString(), res.status, body);
  } catch (err) {
    console.error(new Date().toLocaleTimeString(), 'tick failed:', (err as Error).message);
  }
}

tick();
setInterval(tick, INTERVAL_MS);
