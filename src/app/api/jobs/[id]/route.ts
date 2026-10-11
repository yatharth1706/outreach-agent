import { z } from 'zod';
import { updateJob, serializeJob } from '@/lib/emails';
import { getSessionAccount } from '@/lib/session';

const patchSchema = z
  .object({
    to_email: z.email(),
    to_name: z.string().max(200).nullable(),
    cc: z.array(z.email()).max(9),
    bcc: z.array(z.email()).max(9),
    subject: z.string().trim().min(1).max(200),
    body: z.string().trim().min(1).max(20000),
    send_at_local: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
    timezone: z.string().max(64),
  })
  .partial();

/** Edit a pending email directly from the activity panel. The user's own click is the approval. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const account = await getSessionAccount();
  if (!account) return new Response('Unauthorized', { status: 401 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Invalid changes.' }, { status: 400 });
  const c = parsed.data;
  if (Object.keys(c).length === 0) return Response.json({ error: 'Nothing to change.' }, { status: 400 });

  const { id } = await params;
  const result = await updateJob(account.id, id, {
    toEmail: c.to_email,
    toName: c.to_name,
    cc: c.cc,
    bcc: c.bcc,
    subject: c.subject,
    body: c.body,
    sendAtLocal: c.send_at_local,
    timezone: c.timezone,
  });
  if (!result.ok) return Response.json({ error: result.error }, { status: 409 });
  return Response.json(serializeJob(result.job));
}
