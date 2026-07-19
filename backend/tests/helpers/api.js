/**
 * HTTP API helpers built on Node http against the Express app (no listen required).
 * Cookie jar preserves auth cookies across requests.
 */
"use strict";

const http = require("http");
const { URL } = require("url");

function parseSetCookie(header) {
  if (!header) return [];
  const raw = Array.isArray(header) ? header : [header];
  return raw.map((line) => {
    const [pair] = line.split(";");
    const idx = pair.indexOf("=");
    const name = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    return { name, value, raw: line };
  });
}

class CookieJar {
  constructor() {
    this.cookies = new Map();
  }

  store(res) {
    const setCookie = res.headers["set-cookie"];
    for (const c of parseSetCookie(setCookie)) {
      if (!c.name) continue;
      if (c.raw.toLowerCase().includes("max-age=0") || c.value === "") {
        this.cookies.delete(c.name);
      } else {
        this.cookies.set(c.name, c.value);
      }
    }
  }

  header() {
    if (!this.cookies.size) return "";
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  get(name) {
    return this.cookies.get(name) || null;
  }

  clear() {
    this.cookies.clear();
  }
}

function createApiClient(app) {
  const server = http.createServer(app);
  let baseUrl = null;

  async function start() {
    if (baseUrl) return baseUrl;
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const addr = server.address();
    baseUrl = `http://127.0.0.1:${addr.port}`;
    return baseUrl;
  }

  async function stop() {
    if (!baseUrl) return;
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    baseUrl = null;
  }

  async function request(method, path, { body, headers = {}, jar, raw } = {}) {
    await start();
    const url = new URL(path, baseUrl);
    const payload =
      body == null || Buffer.isBuffer(body) || typeof body === "string"
        ? body
        : JSON.stringify(body);

    const reqHeaders = {
      Accept: "application/json",
      ...headers,
    };
    if (jar) {
      const cookie = jar.header();
      if (cookie) reqHeaders.Cookie = cookie;
    }
    if (payload != null && !reqHeaders["Content-Type"] && !Buffer.isBuffer(payload)) {
      reqHeaders["Content-Type"] = "application/json";
    }
    if (payload != null) {
      reqHeaders["Content-Length"] = Buffer.byteLength(payload);
    }

    const started = Date.now();
    const res = await new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname + url.search,
          method,
          headers: reqHeaders,
        },
        (response) => {
          const chunks = [];
          response.on("data", (c) => chunks.push(c));
          response.on("end", () => {
            const buf = Buffer.concat(chunks);
            const text = buf.toString("utf8");
            let json = null;
            try {
              json = text ? JSON.parse(text) : null;
            } catch {
              json = null;
            }
            resolve({
              status: response.statusCode,
              headers: response.headers,
              text,
              body: json,
              raw: buf,
              durationMs: Date.now() - started,
            });
          });
        },
      );
      req.on("error", reject);
      if (payload != null) req.write(payload);
      req.end();
    });

    if (jar) jar.store(res);
    return res;
  }

  const api = {
    server,
    start,
    stop,
    jar: () => new CookieJar(),
    get: (path, opts) => request("GET", path, opts),
    post: (path, body, opts = {}) => request("POST", path, { ...opts, body }),
    put: (path, body, opts = {}) => request("PUT", path, { ...opts, body }),
    patch: (path, body, opts = {}) => request("PATCH", path, { ...opts, body }),
    delete: (path, opts) => request("DELETE", path, opts),
    request,
  };

  return api;
}

module.exports = {
  CookieJar,
  createApiClient,
};
