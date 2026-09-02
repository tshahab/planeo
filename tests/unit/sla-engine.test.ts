import { describe, expect, it } from "vitest";
import { accrue, businessMilliseconds, matches, validateCalendar, validateRules } from "../../ops/sla-engine.mjs";
const always = (timezone = "UTC") => validateCalendar({ timezone, week: Array.from({ length: 7 }, () => [[0, 1440]]) });
describe("SLA business calendars", () => {
  it("counts actual time through spring gaps and autumn folds", () => {
    const calendar = always("America/New_York");
    expect(businessMilliseconds(calendar, "2026-03-08T05:00:00Z", "2026-03-09T04:00:00Z")).toBe(23 * 3600000);
    expect(businessMilliseconds(calendar, "2026-11-01T04:00:00Z", "2026-11-02T05:00:00Z")).toBe(25 * 3600000);
    const repeated = validateCalendar({ timezone: "America/New_York", week: [[[60, 120]], [], [], [], [], [], []] });
    expect(businessMilliseconds(repeated, "2026-11-01T04:00:00Z", "2026-11-02T05:00:00Z")).toBe(2 * 3600000);
  });
  it("honors holidays, exceptions, partial minutes and non-hour timezone offsets", () => {
    const calendar = validateCalendar({ timezone: "Asia/Kathmandu", week: Array.from({ length: 7 }, () => [[540, 1020]]), holidays: ["2026-09-02"], exceptions: { "2026-09-02": [[600, 660]] } });
    expect(businessMilliseconds(calendar, "2026-09-02T04:15:30Z", "2026-09-02T05:15:00Z")).toBe(3570000);
    expect(() => validateCalendar({ timezone: "Invalid/Zone", week: [] })).toThrow();
    expect(() => validateCalendar({ timezone: "UTC", week: Array.from({ length: 7 }, () => [[100, 200], [150, 250]]) })).toThrow(/overlap/);
  });
  it("recovers exact risk/breach instants after delayed processing and does not double accrue pauses", () => {
    const calendar = always(), cycle = { lastAt: "2026-09-02T00:00:00Z", elapsedMs: 0, pauseReasons: [] };
    const result = accrue(calendar, cycle, "2026-09-02T03:00:00Z", 3600000, 600000);
    expect(result.events.map(event => [event.type, event.at.toISOString()])).toEqual([["sla.risk", "2026-09-02T00:50:00.000Z"], ["sla.breached", "2026-09-02T01:00:00.000Z"]]);
    expect(accrue(calendar, { ...cycle, pauseReasons: ["customer", "approval"] }, "2026-09-02T03:00:00Z", 3600000, 600000).elapsedMs).toBe(0);
    expect(accrue(calendar, { ...cycle, elapsedMs: result.elapsedMs, lastAt: result.lastAt, riskAt: result.events[0].at, breachedAt: result.events[1].at }, "2026-09-02T03:00:00Z", 3600000, 600000).events).toEqual([]);
  });
  it("validates explicit conditions and stable overlapping pause reasons", () => {
    const rules = validateRules({ pause: [{ id: "customer", when: [{ field: "statusId", equals: "waiting" }] }, { id: "approval", when: [{ field: "field:approval", equals: false }] }] }, "RESOLUTION");
    expect(rules.pause.filter(reason => matches(reason.when, { statusId: "waiting", fields: { approval: false } }))).toHaveLength(2);
    expect(() => validateRules({ start: [{ field: "rawSQL", equals: "bad" }] }, "RESPONSE")).toThrow();
  });
});
