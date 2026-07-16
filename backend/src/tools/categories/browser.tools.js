/**
 * Browser + Search tools — search, fetch, crawl, screenshot, extract.
 */

const axios = require("axios");
const { defineTool, ok, fail } = require("../sdk/define-tool");
const webSearch = require("../../agents/websearch.agent");

function stripHtml(html, maxChars = 12000) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxChars);
}

function extractLinks(html, baseUrl, limit = 20) {
  const links = [];
  const re = /href=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html)) && links.length < limit) {
    try {
      const href = new URL(m[1], baseUrl).toString();
      if (/^https?:\/\//i.test(href)) links.push(href);
    } catch {
      /* ignore */
    }
  }
  return [...new Set(links)];
}

const browserTools = [
  defineTool({
    id: "search.web",
    name: "Web Search",
    description: "Search the web for up-to-date information",
    category: "browser",
    version: "1.0.0",
    permissions: ["search:execute", "browser:execute"],
    timeout: 20000,
    retries: 1,
    aliases: ["search"],
    schema: {
      type: "object",
      properties: {
        query: { type: "string" },
        maxResults: { type: "number" },
      },
      required: ["query"],
    },
    async executor(args) {
      try {
        const text = await webSearch(args.query);
        return ok({ query: args.query, results: text });
      } catch (e) {
        return fail(e);
      }
    },
  }),

  defineTool({
    id: "browser.search",
    name: "Browser Search",
    description: "Search the web via the browser search tool",
    category: "browser",
    version: "1.0.0",
    permissions: ["browser:execute"],
    timeout: 20000,
    retries: 1,
    schema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
    async executor(args, ctx) {
      ctx.emit?.("tool_progress", { tool: "browser.search", message: "Searching...", query: args.query });
      const text = await webSearch(args.query);
      return ok({ query: args.query, results: text });
    },
  }),

  defineTool({
    id: "browser.fetch",
    name: "Fetch URL",
    description: "Fetch and extract readable content from a URL",
    category: "browser",
    version: "1.0.0",
    permissions: ["browser:read"],
    timeout: 20000,
    retries: 1,
    cacheable: true,
    cacheTtlMs: 10000,
    schema: {
      type: "object",
      properties: {
        url: { type: "string" },
        maxChars: { type: "number" },
      },
      required: ["url"],
    },
    async executor(args) {
      try {
        const url = String(args.url || "");
        if (!/^https?:\/\//i.test(url)) return fail("Only http/https URLs allowed", "BAD_URL");
        const response = await axios.get(url, {
          timeout: 15000,
          maxContentLength: 2_000_000,
          headers: { "User-Agent": "OpenClawAgent/1.0" },
          validateStatus: () => true,
        });
        const raw = typeof response.data === "string" ? response.data : JSON.stringify(response.data);
        return ok({
          url,
          status: response.status,
          content: stripHtml(raw, args.maxChars || 12000),
        });
      } catch (e) {
        return fail(e);
      }
    },
  }),

  defineTool({
    id: "browser.crawl",
    name: "Crawl Pages",
    description: "Fetch a page and follow a limited set of same-site links",
    category: "browser",
    version: "1.0.0",
    permissions: ["browser:execute"],
    timeout: 60000,
    retries: 0,
    schema: {
      type: "object",
      properties: {
        url: { type: "string" },
        maxPages: { type: "number" },
        maxChars: { type: "number" },
      },
      required: ["url"],
    },
    async executor(args, ctx) {
      try {
        const start = String(args.url || "");
        if (!/^https?:\/\//i.test(start)) return fail("Only http/https URLs allowed", "BAD_URL");
        const maxPages = Math.min(args.maxPages || 3, 5);
        const visited = new Set();
        const pages = [];
        const queue = [start];
        const origin = new URL(start).origin;

        while (queue.length && pages.length < maxPages) {
          const url = queue.shift();
          if (visited.has(url)) continue;
          visited.add(url);
          ctx.emit?.("tool_progress", { tool: "browser.crawl", message: `Fetching ${url}` });
          const response = await axios.get(url, {
            timeout: 12000,
            maxContentLength: 1_500_000,
            headers: { "User-Agent": "OpenClawAgent/1.0" },
            validateStatus: () => true,
          });
          const raw = typeof response.data === "string" ? response.data : "";
          pages.push({
            url,
            status: response.status,
            content: stripHtml(raw, args.maxChars || 6000),
          });
          for (const link of extractLinks(raw, url, 10)) {
            if (link.startsWith(origin) && !visited.has(link)) queue.push(link);
          }
        }
        return ok({ start, pages, count: pages.length });
      } catch (e) {
        return fail(e);
      }
    },
  }),

  defineTool({
    id: "browser.screenshot",
    name: "Screenshot Page",
    description: "Capture a textual snapshot representation of a page (DOM summary)",
    category: "browser",
    version: "1.0.0",
    permissions: ["browser:read"],
    timeout: 20000,
    retries: 1,
    schema: {
      type: "object",
      properties: {
        url: { type: "string" },
      },
      required: ["url"],
    },
    async executor(args) {
      try {
        const url = String(args.url || "");
        if (!/^https?:\/\//i.test(url)) return fail("Only http/https URLs allowed", "BAD_URL");
        const response = await axios.get(url, {
          timeout: 15000,
          maxContentLength: 2_000_000,
          headers: { "User-Agent": "OpenClawAgent/1.0" },
          validateStatus: () => true,
        });
        const raw = typeof response.data === "string" ? response.data : "";
        const title = (raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "";
        const headings = [...raw.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)]
          .slice(0, 20)
          .map((m) => stripHtml(m[1], 200));
        return ok({
          url,
          status: response.status,
          title: stripHtml(title, 200),
          headings,
          snapshot: stripHtml(raw, 4000),
          note: "Textual DOM snapshot (no headless browser binary required)",
        });
      } catch (e) {
        return fail(e);
      }
    },
  }),

  defineTool({
    id: "browser.extract",
    name: "Extract Page Content",
    description: "Extract title, headings, links, and readable text from a URL",
    category: "browser",
    version: "1.0.0",
    permissions: ["browser:read"],
    timeout: 20000,
    retries: 1,
    schema: {
      type: "object",
      properties: {
        url: { type: "string" },
        maxChars: { type: "number" },
      },
      required: ["url"],
    },
    async executor(args) {
      try {
        const url = String(args.url || "");
        if (!/^https?:\/\//i.test(url)) return fail("Only http/https URLs allowed", "BAD_URL");
        const response = await axios.get(url, {
          timeout: 15000,
          maxContentLength: 2_000_000,
          headers: { "User-Agent": "OpenClawAgent/1.0" },
          validateStatus: () => true,
        });
        const raw = typeof response.data === "string" ? response.data : "";
        const title = stripHtml((raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "", 200);
        return ok({
          url,
          status: response.status,
          title,
          links: extractLinks(raw, url, 30),
          content: stripHtml(raw, args.maxChars || 12000),
        });
      } catch (e) {
        return fail(e);
      }
    },
  }),

  defineTool({
    id: "browser",
    name: "Browser",
    description: "Fetch and extract readable content from a URL",
    category: "browser",
    version: "1.0.0",
    permissions: ["browser:read"],
    timeout: 20000,
    retries: 1,
    schema: {
      type: "object",
      properties: {
        url: { type: "string" },
        maxChars: { type: "number" },
        action: { type: "string", enum: ["fetch", "search", "crawl", "screenshot", "extract"] },
        query: { type: "string" },
      },
      required: [],
    },
    async executor(args, ctx) {
      const action = args.action || (args.query ? "search" : "fetch");
      const id = `browser.${action}`;
      const tool = browserTools.find((t) => t.id === id);
      if (!tool) return fail(`Unknown browser action: ${action}`, "BAD_ACTION");
      return tool.executor(args, ctx);
    },
  }),

  defineTool({
    id: "search",
    name: "Search",
    description: "Search the web for up-to-date information",
    category: "browser",
    version: "1.0.0",
    permissions: ["search:execute"],
    timeout: 20000,
    retries: 1,
    schema: {
      type: "object",
      properties: {
        query: { type: "string" },
        maxResults: { type: "number" },
      },
      required: ["query"],
    },
    async executor(args) {
      try {
        const text = await webSearch(args.query);
        return ok({ query: args.query, results: text });
      } catch (e) {
        return fail(e);
      }
    },
  }),
];

module.exports = { browserTools };
