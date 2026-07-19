/**
 * Redis helper for integration tests.
 * Soft-fails if Redis is unavailable (platform does not hard-require it).
 */
"use strict";

const net = require("net");

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

function parseRedisUrl(url) {
  try {
    const u = new URL(url);
    return { host: u.hostname || "127.0.0.1", port: Number(u.port || 6379) };
  } catch {
    return { host: "127.0.0.1", port: 6379 };
  }
}

function isRedisAvailable({ timeoutMs = 1500 } = {}) {
  const { host, port } = parseRedisUrl(REDIS_URL);
  return new Promise((resolve) => {
    const socket = net.connect(port, host);
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, timeoutMs);
    socket.on("connect", () => {
      clearTimeout(timer);
      socket.end();
      resolve(true);
    });
    socket.on("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

/**
 * Minimal RESP PING against Redis without extra dependencies.
 */
function redisPing({ timeoutMs = 2000 } = {}) {
  const { host, port } = parseRedisUrl(REDIS_URL);
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, host);
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("Redis PING timeout"));
    }, timeoutMs);
    let buf = "";
    socket.on("connect", () => {
      socket.write("*1\r\n$4\r\nPING\r\n");
    });
    socket.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      if (buf.includes("\r\n")) {
        clearTimeout(timer);
        socket.end();
        resolve(buf.trim());
      }
    });
    socket.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

module.exports = {
  REDIS_URL,
  isRedisAvailable,
  redisPing,
  parseRedisUrl,
};
