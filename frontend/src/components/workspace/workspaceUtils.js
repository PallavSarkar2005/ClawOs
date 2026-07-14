export function getLanguageFromFilename(name = "") {
  const ext = name.split(".").pop()?.toLowerCase();
  const map = {
    js: "javascript",
    jsx: "javascript",
    ts: "typescript",
    tsx: "typescript",
    html: "html",
    htm: "html",
    css: "css",
    scss: "scss",
    json: "json",
    md: "markdown",
    mdx: "markdown",
    py: "python",
    sql: "sql",
    yml: "yaml",
    yaml: "yaml",
    sh: "shell",
    bash: "shell",
  };
  return map[ext] || "plaintext";
}

export function buildFileTree(files = []) {
  const byId = Object.fromEntries(files.map((f) => [f.id, { ...f, children: [] }]));
  const roots = [];

  for (const file of files) {
    const node = byId[file.id];
    if (file.parentId && byId[file.parentId]) {
      byId[file.parentId].children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortNodes = (nodes) => {
    nodes.sort((a, b) => {
      if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    nodes.forEach((n) => n.children?.length && sortNodes(n.children));
  };

  sortNodes(roots);
  return roots;
}

export function formatTime(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "";
  }
}

export function statusColor(status) {
  switch (status) {
    case "running":
    case "building":
      return "#7CAADC";
    case "completed":
    case "active":
    case "accepted":
      return "#22C55E";
    case "failed":
    case "error":
    case "rejected":
      return "#EF4444";
    case "pending":
      return "#F59E0B";
    default:
      return "#94A3B8";
  }
}

export function buildPreviewHtml(files = []) {
  const byPath = Object.fromEntries(
    files.filter((f) => !f.isFolder).map((f) => [f.path.replace(/^\//, ""), f.content || ""])
  );
  const byName = Object.fromEntries(
    files.filter((f) => !f.isFolder).map((f) => [f.name, f.content || ""])
  );

  const indexHtml =
    byPath["index.html"] ||
    byName["index.html"] ||
    null;

  if (!indexHtml) {
    const app =
      byPath["src/App.jsx"] ||
      byPath["App.jsx"] ||
      byName["App.jsx"] ||
      byName["App.tsx"];
    if (app) {
      return `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8"/>
<script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
</head><body style="margin:0;background:#0F172A;color:#fff;font-family:sans-serif">
<div id="root"></div>
<script type="text/babel" data-presets="react">
${app.replace(/export\s+default\s+function\s+App/, "function App").replace(/export\s+default\s+App/, "")}
ReactDOM.createRoot(document.getElementById("root")).render(<App />);
</script></body></html>`;
    }
    return `<!DOCTYPE html><html><body style="background:#0F172A;color:#94A3B8;font-family:sans-serif;display:grid;place-items:center;min-height:100vh">
<p>No previewable HTML/React entry found.</p></body></html>`;
  }

  let html = indexHtml;

  // Inline linked CSS
  html = html.replace(
    /<link[^>]+href=["']([^"']+\.css)["'][^>]*>/gi,
    (_, href) => {
      const key = href.replace(/^\.\//, "").replace(/^\//, "");
      const css = byPath[key] || byName[key.split("/").pop()] || "";
      return `<style>${css}</style>`;
    }
  );

  // Inline linked JS (non-module simple)
  html = html.replace(
    /<script([^>]*)\ssrc=["']([^"']+\.js)["']([^>]*)><\/script>/gi,
    (full, pre, src, post) => {
      if (/unpkg|cdn|http/i.test(src)) return full;
      const key = src.replace(/^\.\//, "").replace(/^\//, "");
      const js = byPath[key] || byName[key.split("/").pop()] || "";
      return `<script${pre}${post}>${js}</script>`;
    }
  );

  return html;
}

export function computeLineDiff(before = "", after = "") {
  const a = before.split("\n");
  const b = after.split("\n");
  const max = Math.max(a.length, b.length);
  const rows = [];
  for (let i = 0; i < max; i++) {
    const left = a[i];
    const right = b[i];
    if (left === right) {
      if (left !== undefined) rows.push({ type: "same", before: left, after: right, line: i + 1 });
    } else {
      if (left !== undefined) rows.push({ type: "remove", before: left, after: "", line: i + 1 });
      if (right !== undefined) rows.push({ type: "add", before: "", after: right, line: i + 1 });
    }
  }
  return rows;
}
