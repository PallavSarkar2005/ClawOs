/**
 * SSE helper for agent runtime streaming.
 */
function initSSE(res) {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof res.flushHeaders === "function") res.flushHeaders();
  res.write(": connected\n\n");
}

function sendSSE(res, event, data) {
  if (res.writableEnded) return;
  const payload = typeof data === "string" ? data : JSON.stringify(data);
  res.write(`event: ${event}\n`);
  res.write(`data: ${payload}\n\n`);
}

function endSSE(res) {
  if (!res.writableEnded) {
    res.write("event: done\ndata: {}\n\n");
    res.end();
  }
}

module.exports = { initSSE, sendSSE, endSSE };
