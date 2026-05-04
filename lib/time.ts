/**
 * Timezone-aware day arithmetic.
 *
 * Day comparisons must run against the user's wall-clock day, not UTC,
 * otherwise tasks dated "today" appear overdue once the UTC date has
 * rolled over (e.g. evening ET vs UTC).
 *
 * The user timezone is read from NEXT_PUBLIC_USER_TIMEZONE in browser
 * code and USER_TIMEZONE on the server, defaulting to America/Toronto.
 */

const FALLBACK_TZ = 'America/Toronto';

export function getUserTimezone(): string {
  // Browser sees only NEXT_PUBLIC_*; Node sees both.
  const fromEnv =
    process.env.NEXT_PUBLIC_USER_TIMEZONE || process.env.USER_TIMEZONE;
  return fromEnv || FALLBACK_TZ;
}

/**
 * YYYY-MM-DD for `instant` (defaults to now) in the user's timezone.
 */
export function todayInUserTz(instant: Date = new Date(), tz: string = getUserTimezone()): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = fmt.formatToParts(instant);
  const map: Record<string, string> = {};
  for (const p of parts) if (p.type !== 'literal') map[p.type] = p.value;
  return `${map.year}-${map.month}-${map.day}`;
}

/**
 * Whole days from `from` (YYYY-MM-DD) to `to` (YYYY-MM-DD), interpreted as
 * calendar days. Both inputs may include a time suffix, which is ignored.
 *
 * Returns a positive number if `to` is after `from`, zero if same day,
 * negative if before. Returns NaN on bad input.
 */
export function daysBetweenInUserTz(from: string, to: string): number {
  const a = parseYmd(from);
  const b = parseYmd(to);
  if (!a || !b) return NaN;
  // UTC-noon anchor avoids DST half-day rounding errors.
  const aUtc = Date.UTC(a.y, a.m - 1, a.d, 12);
  const bUtc = Date.UTC(b.y, b.m - 1, b.d, 12);
  return Math.round((bUtc - aUtc) / 86400000);
}

/**
 * Days from "today in user tz" to a YYYY-MM-DD due date. Convenience
 * wrapper used by display code. Returns undefined when input is missing.
 */
export function daysUntilDueInUserTz(
  dueDate?: string,
  now: Date = new Date(),
  tz: string = getUserTimezone()
): number | undefined {
  if (!dueDate) return undefined;
  const today = todayInUserTz(now, tz);
  const due = dueDate.split('T')[0];
  const result = daysBetweenInUserTz(today, due);
  return Number.isNaN(result) ? undefined : result;
}

function parseYmd(s: string): { y: number; m: number; d: number } | null {
  const datePart = s.split('T')[0];
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { y, m: mo, d };
}
