const formatters = new Map(), days = new Map();
const DAY = 86400000, MINUTE = 60000;
const weekdays = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
function date(value) { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value; }
function windows(value) {
  if (!Array.isArray(value) || value.length > 8) throw new Error("Working hours must contain up to eight intervals per day.");
  const result = value.map(item => {
    if (!Array.isArray(item) || item.length !== 2 || item.some(n => !Number.isInteger(n)) || item[0] < 0 || item[1] > 1440 || item[0] >= item[1]) throw new Error("Working intervals use minutes from midnight with start before end.");
    return [...item];
  }).sort((a, b) => a[0] - b[0]);
  if (result.some((item, i) => i > 0 && item[0] < result[i - 1][1])) throw new Error("Working intervals must not overlap.");
  return result;
}
export function validateCalendar(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Calendar configuration is required.");
  if (Object.keys(value).some(key => !["timezone", "week", "holidays", "exceptions"].includes(key))) throw new Error("Unsupported calendar setting.");
  if (typeof value.timezone !== "string" || value.timezone.length > 100) throw new Error("A timezone is required.");
  try { new Intl.DateTimeFormat("en-US", { timeZone: value.timezone }); } catch { throw new Error("Unknown timezone."); }
  if (!Array.isArray(value.week) || value.week.length !== 7) throw new Error("Provide seven days, Sunday through Saturday.");
  const week = value.week.map(windows), holidays = value.holidays ?? [], exceptions = value.exceptions ?? {};
  if (!Array.isArray(holidays) || holidays.length > 1000 || holidays.some(day => !date(day))) throw new Error("Invalid holiday dates.");
  if (!exceptions || typeof exceptions !== "object" || Array.isArray(exceptions) || Object.keys(exceptions).length > 1000 || Object.keys(exceptions).some(day => !date(day))) throw new Error("Invalid calendar exceptions.");
  const normalized = Object.fromEntries(Object.entries(exceptions).map(([day, hours]) => [day, windows(hours)]));
  if (!week.some(hours => hours.length) && !Object.values(normalized).some(hours => hours.length)) throw new Error("A calendar needs working time.");
  return { timezone: value.timezone, week, holidays: [...new Set(holidays)], exceptions: normalized };
}

function intervals(config, utcDay) {
  const key = `${JSON.stringify(config)}:${utcDay}`;
  if (days.has(key)) return days.get(key);
  let formatter = formatters.get(config.timezone);
  if (!formatter) { formatter = new Intl.DateTimeFormat("en-US", { timeZone: config.timezone, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }); formatters.set(config.timezone, formatter); }
  const result = []; let opened = null;
  // Walk actual UTC minutes: skipped wall-clock minutes contribute nothing and repeated
  // minutes both contribute. No ambiguous local-to-UTC conversion or fixed-offset math.
  for (let minute = 0; minute < 1440; minute++) {
    const at = utcDay + minute * MINUTE;
    const parts = Object.fromEntries(formatter.formatToParts(at).map(part => [part.type, part.value]));
    const localDate = `${parts.year}-${parts.month}-${parts.day}`, wall = Number(parts.hour) * 60 + Number(parts.minute);
    const hours = Object.hasOwn(config.exceptions, localDate) ? config.exceptions[localDate] : config.holidays.includes(localDate) ? [] : config.week[weekdays[parts.weekday]];
    const working = hours.some(([start, end]) => wall >= start && wall < end);
    if (working && opened === null) opened = at;
    if (!working && opened !== null) { result.push([opened, at]); opened = null; }
  }
  if (opened !== null) result.push([opened, utcDay + DAY]);
  if (days.size >= 512) days.delete(days.keys().next().value);
  days.set(key, result); return result;
}

export function businessMilliseconds(config, from, to) {
  const start = Number(new Date(from)), end = Number(new Date(to));
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) throw new Error("Invalid SLA time range.");
  let total = 0;
  for (let day = Math.floor(start / DAY) * DAY; day < end; day += DAY) for (const [a, b] of intervals(config, day)) total += Math.max(0, Math.min(end, b) - Math.max(start, a));
  return total;
}

export function businessThreshold(config, from, to, amount) {
  let remaining = amount;
  if (remaining <= 0) return new Date(from);
  const start = Number(new Date(from)), end = Number(new Date(to));
  for (let day = Math.floor(start / DAY) * DAY; day < end; day += DAY) for (const [a, b] of intervals(config, day)) {
    const lower = Math.max(start, a), upper = Math.min(end, b), duration = Math.max(0, upper - lower);
    if (duration >= remaining) return new Date(lower + remaining);
    remaining -= duration;
  }
  return null;
}

const fields = ["event", "statusId", "statusCategory", "requestTypeId", "priority", "organizationId", "label"];
export function validateConditions(value) {
  if (!Array.isArray(value) || value.length > 20) throw new Error("Conditions must be a list of up to twenty comparisons.");
  return value.map(condition => {
    if (!condition || typeof condition !== "object" || Object.keys(condition).some(key => !["field", "equals"].includes(key)) || typeof condition.field !== "string" || !fields.includes(condition.field) && !/^field:[a-zA-Z0-9_-]{1,100}$/.test(condition.field) || !["string", "number", "boolean"].includes(typeof condition.equals) || typeof condition.equals === "string" && condition.equals.length > 200) throw new Error("Invalid SLA condition.");
    return { field: condition.field, equals: condition.equals };
  });
}
export function matches(conditions, payload) { return conditions.every(condition => condition.field === "label" ? payload.labels?.includes(condition.equals) : condition.field.startsWith("field:") ? payload.fields?.[condition.field.slice(6)] === condition.equals : payload[condition.field] === condition.equals); }
export function validateRules(value, metric) {
  const input = value ?? {};
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(key => !["start", "pause", "resume", "stop", "reset", "success"].includes(key))) throw new Error("Invalid SLA timer rules.");
  const pause = input.pause ?? [];
  if (!Array.isArray(pause) || pause.length > 20) throw new Error("Invalid pause reasons.");
  const reasons = pause.map(reason => {
    if (!reason || typeof reason.id !== "string" || !/^[a-zA-Z0-9_-]{1,50}$/.test(reason.id)) throw new Error("Each pause needs a stable reason ID.");
    return { id: reason.id, when: validateConditions(reason.when) };
  });
  if (new Set(reasons.map(reason => reason.id)).size !== reasons.length) throw new Error("Pause reason IDs must be unique.");
  return { start: validateConditions(input.start ?? []), pause: reasons, resume: validateConditions(input.resume ?? []), stop: validateConditions(input.stop ?? (metric === "RESPONSE" ? [{ field: "event", equals: "agent.replied" }] : [{ field: "statusCategory", equals: "DONE" }])), reset: validateConditions(input.reset ?? [{ field: "event", equals: "request.reopened" }]), success: validateConditions(input.success ?? []) };
}

export function accrue(config, cycle, at, targetMs, riskMs) {
  const now = new Date(at), previous = new Date(cycle.lastAt), elapsed = Number(cycle.elapsedMs);
  if (now < previous) throw new Error("SLA events must be processed in chronological order.");
  const added = cycle.endedAt || cycle.pauseReasons.length ? 0 : businessMilliseconds(config, previous, now);
  const total = elapsed + added, events = [];
  if (!cycle.endedAt && !cycle.riskAt && total >= targetMs - riskMs) events.push({ type: "sla.risk", at: businessThreshold(config, previous, now, targetMs - riskMs - elapsed) ?? now });
  if (!cycle.endedAt && !cycle.breachedAt && total >= targetMs) events.push({ type: "sla.breached", at: businessThreshold(config, previous, now, targetMs - elapsed) ?? now });
  return { elapsedMs: total, lastAt: now, events };
}
