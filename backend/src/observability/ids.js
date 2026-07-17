const { randomUUID } = require("crypto");

function newTraceId() {
  return `tr_${randomUUID().replace(/-/g, "")}`;
}

function newSpanId() {
  return `sp_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function durationMs(start, end = Date.now()) {
  const s = start instanceof Date ? start.getTime() : Number(start) || 0;
  const e = end instanceof Date ? end.getTime() : Number(end) || Date.now();
  return Math.max(0, e - s);
}

module.exports = { newTraceId, newSpanId, nowIso, durationMs };
