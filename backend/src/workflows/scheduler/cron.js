/**
 * Minimal cron expression evaluator + scheduler.
 * Supports: minute hour dayOfMonth month dayOfWeek (5-field)
 * Also: star-slash-n steps, lists, ranges. Timezone via Intl.
 */

function parseField(field, min, max) {
  const values = new Set();
  for (const part of String(field).split(",")) {
    if (part === "*") {
      for (let i = min; i <= max; i += 1) values.add(i);
      continue;
    }
    const stepMatch = part.match(/^(?:\*|(?:\d+-\d+)|(?:\d+))\/(\d+)$/);
    if (stepMatch) {
      const step = Number(stepMatch[1]);
      let start = min;
      let end = max;
      const range = part.split("/")[0];
      if (range.includes("-")) {
        const [a, b] = range.split("-").map(Number);
        start = a;
        end = b;
      } else if (range !== "*") {
        start = Number(range);
      }
      for (let i = start; i <= end; i += step) values.add(i);
      continue;
    }
    if (part.includes("-")) {
      const [a, b] = part.split("-").map(Number);
      for (let i = a; i <= b; i += 1) values.add(i);
      continue;
    }
    values.add(Number(part));
  }
  return values;
}

function parseCron(expr) {
  const parts = String(expr).trim().split(/\s+/);
  if (parts.length !== 5) throw new Error("Cron must have 5 fields");
  return {
    minute: parseField(parts[0], 0, 59),
    hour: parseField(parts[1], 0, 23),
    dayOfMonth: parseField(parts[2], 1, 31),
    month: parseField(parts[3], 1, 12),
    dayOfWeek: parseField(parts[4], 0, 6),
  };
}

function zonedParts(date, timeZone) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timeZone || "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    dayOfWeek: weekdayMap[parts.weekday] ?? 0,
  };
}

function matchesCron(cron, date, timeZone) {
  const p = zonedParts(date, timeZone);
  const c = typeof cron === "string" ? parseCron(cron) : cron;
  return (
    c.minute.has(p.minute) &&
    c.hour.has(p.hour) &&
    c.dayOfMonth.has(p.day) &&
    c.month.has(p.month) &&
    c.dayOfWeek.has(p.dayOfWeek)
  );
}

function nextCronRun(cronExpr, from = new Date(), timeZone = "UTC", maxLookaheadMinutes = 60 * 24 * 366) {
  const cron = parseCron(cronExpr);
  const cursor = new Date(from.getTime());
  cursor.setSeconds(0, 0);
  cursor.setMinutes(cursor.getMinutes() + 1);
  for (let i = 0; i < maxLookaheadMinutes; i += 1) {
    if (matchesCron(cron, cursor, timeZone)) return new Date(cursor);
    cursor.setMinutes(cursor.getMinutes() + 1);
  }
  return null;
}

module.exports = {
  parseCron,
  matchesCron,
  nextCronRun,
  zonedParts,
};
