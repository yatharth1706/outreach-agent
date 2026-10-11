import { DateTime } from 'luxon';

export const userZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** "Tue 14 Oct, 14:00" in the given zone, with the zone's short name when it isn't the viewer's. */
export function formatTime(iso: string, zone = userZone()) {
  const dt = DateTime.fromISO(iso).setZone(zone);
  const base = dt.toFormat('ccc d LLL, HH:mm');
  return zone === userZone() ? base : `${base} ${dt.toFormat('ZZZZ')}`;
}

export function relative(iso: string) {
  return DateTime.fromISO(iso).toRelative({ style: 'short' }) ?? '';
}

/** Instant for a wall-clock time in a zone, or null if it can't be parsed yet (e.g. mid-stream). */
export function localToIso(local?: string, zone?: string) {
  if (!local || !zone) return null;
  const dt = DateTime.fromISO(local, { zone });
  return dt.isValid ? dt.toUTC().toISO() : null;
}

export function displayName(name: string | null | undefined, email: string) {
  return name ? `${name} <${email}>` : email;
}

/** Value for <input type="datetime-local">: the instant as wall-clock time in the viewer's zone. */
export function toLocalInput(iso: string) {
  return DateTime.fromISO(iso).setZone(userZone()).toFormat("yyyy-MM-dd'T'HH:mm");
}

/** "a@x.com, b@y.com" or newline/semicolon separated -> ['a@x.com', 'b@y.com'] */
export function parseAddressList(text: string) {
  return text.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
}
