const fs = require("fs");
const path = require("path");
const { promisify } = require("util");

const mkdir = promisify(fs.mkdir);
const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const rm = promisify(fs.rm);
const unlink = promisify(fs.unlink);

const WORKSPACE_ROOT = path.resolve(
  process.env.WORKSPACE_ROOT || path.join(__dirname, "../../workspaces")
);

function projectDir(userId, projectId) {
  return path.join(WORKSPACE_ROOT, userId, projectId);
}

function safeJoin(root, relPath) {
  const cleaned = String(relPath || "")
    .replace(/^[/\\]+/, "")
    .replace(/\0/g, "");
  const full = path.resolve(root, cleaned);
  if (!full.startsWith(path.resolve(root))) {
    throw new Error("Path escapes workspace");
  }
  return full;
}

async function ensureDir(dir) {
  await mkdir(dir, { recursive: true });
}

async function syncProjectToDisk(userId, project) {
  const root = projectDir(userId, project.id);
  await ensureDir(root);

  const files = (project.files || []).filter(Boolean);
  for (const file of files) {
    const rel = (file.path || `/${file.name}`).replace(/^[/\\]+/, "");
    const full = safeJoin(root, rel);
    if (file.isFolder) {
      await ensureDir(full);
    } else {
      await ensureDir(path.dirname(full));
      await writeFile(full, file.content ?? "", "utf8");
    }
  }
  return root;
}

async function writeFileToDisk(userId, projectId, filePath, content) {
  const root = projectDir(userId, projectId);
  const full = safeJoin(root, filePath.replace(/^[/\\]+/, ""));
  await ensureDir(path.dirname(full));
  await writeFile(full, content ?? "", "utf8");
  return full;
}

async function deleteFromDisk(userId, projectId, filePath, isFolder) {
  const root = projectDir(userId, projectId);
  const full = safeJoin(root, filePath.replace(/^[/\\]+/, ""));
  if (!fs.existsSync(full)) return;
  if (isFolder) {
    await rm(full, { recursive: true, force: true });
  } else {
    await unlink(full);
  }
}

async function moveOnDisk(userId, projectId, fromPath, toPath) {
  const root = projectDir(userId, projectId);
  const from = safeJoin(root, fromPath.replace(/^[/\\]+/, ""));
  const to = safeJoin(root, toPath.replace(/^[/\\]+/, ""));
  await ensureDir(path.dirname(to));
  await promisify(fs.rename)(from, to);
}

function detectProjectType(files = [], rootPath) {
  const names = new Set(
    files.filter((f) => !f.isFolder).map((f) => f.name.toLowerCase())
  );
  const paths = new Set(
    files.filter((f) => !f.isFolder).map((f) => (f.path || "").toLowerCase())
  );

  const has = (n) => names.has(n) || [...paths].some((p) => p.endsWith(`/${n}`));

  if (has("package.json")) {
    try {
      const pkgPath = path.join(rootPath, "package.json");
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
        if (pkg.scripts?.dev) return { type: "node", command: "npm run dev", label: "Node (dev)" };
        if (pkg.scripts?.start) return { type: "node", command: "npm start", label: "Node (start)" };
        if (pkg.scripts?.build) return { type: "node", command: "npm run build", label: "Node (build)" };
      }
    } catch {
      /* ignore */
    }
    return { type: "node", command: "node index.js", label: "Node" };
  }
  if (has("requirements.txt") || has("main.py") || has("app.py")) {
    const entry = has("main.py") ? "main.py" : has("app.py") ? "app.py" : "main.py";
    return { type: "python", command: `python ${entry}`, label: "Python" };
  }
  if (has("pom.xml") || has("build.gradle")) {
    return { type: "java", command: "mvn -q compile exec:java", label: "Java" };
  }
  if (has("dockerfile") || has("docker-compose.yml") || has("compose.yaml")) {
    return { type: "docker", command: "docker compose up --build", label: "Docker" };
  }
  if (has("index.html")) {
    return { type: "static", command: null, label: "Static HTML" };
  }
  const js = files.find((f) => !f.isFolder && /\.(js|mjs|cjs)$/i.test(f.name));
  if (js) {
    return {
      type: "node",
      command: `node ${js.path.replace(/^\//, "")}`,
      label: "Node script",
    };
  }
  const py = files.find((f) => !f.isFolder && /\.py$/i.test(f.name));
  if (py) {
    return {
      type: "python",
      command: `python ${py.path.replace(/^\//, "")}`,
      label: "Python script",
    };
  }
  return { type: "unknown", command: null, label: "Unknown" };
}

module.exports = {
  WORKSPACE_ROOT,
  projectDir,
  safeJoin,
  ensureDir,
  syncProjectToDisk,
  writeFileToDisk,
  deleteFromDisk,
  moveOnDisk,
  detectProjectType,
};
