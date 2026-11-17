// Time helpers. The API gives UTC instants plus "civil" (local wall-clock) fields.
// We keep both: UTC for exact ordering, local date/time for "what happened on Tuesday".

const pad = (n: number) => String(n).padStart(2, "0");

export interface Civil { date?: { year: number; month: number; day: number }; time?: { hours?: number; minutes?: number; seconds?: number } }

export function civilToLocal(c: Civil | undefined): { date: string | null; dateTime: string | null } {
  if (!c?.date) return { date: null, dateTime: null };
  const date = `${c.date.year}-${pad(c.date.month)}-${pad(c.date.day)}`;
  const t = c.time || {};
  return { date, dateTime: `${date}T${pad(t.hours ?? 0)}:${pad(t.minutes ?? 0)}:${pad(t.seconds ?? 0)}` };
}

/** Local date/time of a UTC instant, from an offset like "3600s" or else an IANA time zone. */
export function utcToLocal(isoUtc: string | undefined, offset?: string, timeZone?: string): { date: string | null; dateTime: string | null } {
  if (!isoUtc) return { date: null, dateTime: null };
  const ms = Date.parse(isoUtc);
  if (Number.isNaN(ms)) return { date: null, dateTime: null };
  if (offset) {
    const d = new Date(ms + Number(offset.replace(/s$/, "")) * 1000);
    const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    return { date, dateTime: `${date}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}` };
  }
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(ms))
      .map((p) => [p.type, p.value]),
  );
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  return { date, dateTime: `${date}T${parts.hour}:${parts.minute}:${parts.second}` };
}

/** Today's date (YYYY-MM-DD) in a time zone (default: this computer's). */
export function todayIn(timeZone?: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function minDate(a: string, b: string) {
  return a < b ? a : b;
}

export const nowIso = () => new Date().toISOString();
