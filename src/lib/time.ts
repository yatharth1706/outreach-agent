import { DateTime, IANAZone } from 'luxon';

/** Wall-clock format the agent uses for send times, e.g. 2026-10-08T14:00. */
export const LOCAL_FORMAT = "yyyy-MM-dd'T'HH:mm";
const LOCAL_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/** Allow "send now"-style requests that resolve a few seconds in the past. */
const PAST_GRACE_SECONDS = 90;

export type ResolvedTime =
  | { ok: true; sendAt: Date; local: string; zone: string; /** true when a passed time was moved to "now" */ adjusted?: boolean }
  | { ok: false; error: string };

export function isValidZone(zone: string): boolean {
  return IANAZone.isValidZone(zone);
}

/**
 * Turns the agent's wall-clock time + IANA zone into an exact instant.
 * The LLM never does UTC arithmetic; this is the single place that does.
 */
export function resolveSendTime(local: string, zone: string, now = DateTime.utc()): ResolvedTime {
  if (!isValidZone(zone)) {
    return { ok: false, error: `"${zone}" is not a valid IANA timezone (e.g. Europe/London).` };
  }
  if (!LOCAL_PATTERN.test(local)) {
    return { ok: false, error: `send_at_local must look like 2026-10-08T14:00, got "${local}".` };
  }
  const dt = DateTime.fromISO(local, { zone });
  if (!dt.isValid) {
    return { ok: false, error: `"${local}" is not a real date/time.` };
  }
  // Luxon shifts non-existent times (DST spring-forward gap) forward; don't do that silently.
  if (dt.toFormat(LOCAL_FORMAT) !== local) {
    return { ok: false, error: `${local} does not exist in ${zone} (daylight-saving change). Pick another time.` };
  }
  if (dt < now.minus({ seconds: PAST_GRACE_SECONDS })) {
    const nowLocal = now.setZone(zone).toFormat("ccc d LLL, HH:mm");
    return { ok: false, error: `${formatInZone(dt.toJSDate(), zone)} is in the past (it is now ${nowLocal} in ${zone}).` };
  }
  if (dt > now.plus({ years: 1 })) {
    return { ok: false, error: 'Emails can be scheduled at most 1 year ahead.' };
  }
  return { ok: true, sendAt: dt.toUTC().toJSDate(), local, zone };
}

/** How long after its time a draft may still be approved and sent right away. */
export const LATE_APPROVAL_GRACE_HOURS = 6;

/**
 * Like resolveSendTime, for a draft the user has already approved. If its time passed while
 * they were reviewing it, it is sent right away instead of being rejected, within a grace period.
 * (Brand-new drafts in the past are still rejected by resolveSendTime.)
 */
export function resolveApprovedSendTime(local: string, zone: string, now = DateTime.utc()): ResolvedTime {
  const strict = resolveSendTime(local, zone, now);
  if (strict.ok) return strict;
  const dt = DateTime.fromISO(local, { zone });
  const wellFormed =
    isValidZone(zone) && LOCAL_PATTERN.test(local) && dt.isValid && dt.toFormat(LOCAL_FORMAT) === local;
  if (!wellFormed || dt > now) return strict;
  if (dt < now.minus({ hours: LATE_APPROVAL_GRACE_HOURS })) {
    return { ok: false, error: `That time passed more than ${LATE_APPROVAL_GRACE_HOURS} hours ago. Ask for a new time.` };
  }
  const at = now.plus({ seconds: 5 });
  return { ok: true, sendAt: at.toJSDate(), local: at.setZone(zone).toFormat(LOCAL_FORMAT), zone, adjusted: true };
}

/** "Tue 14 Oct, 14:00 IST" */
export function formatInZone(date: Date | string, zone: string): string {
  const dt = typeof date === 'string' ? DateTime.fromISO(date) : DateTime.fromJSDate(date);
  return dt.setZone(zone).toFormat('ccc d LLL, HH:mm ZZZZ');
}

/** Context line for the system prompt: "Tuesday 7 October 2026, 12:41 (Asia/Kolkata, UTC+5:30)". */
export function describeNow(zone: string, now = DateTime.utc()): string {
  const local = now.setZone(zone);
  return `${local.toFormat("cccc d LLLL yyyy, HH:mm")} (${zone}, UTC${local.toFormat('ZZ')})`;
}
