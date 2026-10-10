import { endSession } from '@/lib/session';

export async function POST(req: Request) {
  await endSession();
  return Response.redirect(new URL('/', req.url), 303);
}
