import api from "../services/api";

export const getProjects = () => api.get("/projects").then((r) => r.data);

export const getProject = (id) => api.get(`/projects/${id}`).then((r) => r.data);

export const createProject = (data) =>
  api.post("/projects", data).then((r) => r.data);

export const updateProject = (id, data) =>
  api.patch(`/projects/${id}`, data).then((r) => r.data);

export const deleteProject = (id) =>
  api.delete(`/projects/${id}`).then((r) => r.data);

export const reorderProjects = (orderedIds) =>
  api.put("/projects/reorder", { orderedIds }).then((r) => r.data);

export const createFile = (projectId, data) =>
  api.post(`/projects/${projectId}/files`, data).then((r) => r.data);

export const updateFile = (fileId, data) =>
  api.put(`/projects/files/${fileId}`, data).then((r) => r.data);

export const renameFile = (fileId, name) =>
  api.patch(`/projects/files/${fileId}/rename`, { name }).then((r) => r.data);

export const moveFile = (fileId, data) =>
  api.patch(`/projects/files/${fileId}/move`, data).then((r) => r.data);

export const deleteFile = (fileId) =>
  api.delete(`/projects/files/${fileId}`).then((r) => r.data);

export const uploadFiles = (projectId, files) =>
  api.post(`/projects/${projectId}/upload`, { files }).then((r) => r.data);

export const getLogs = (projectId) =>
  api.get(`/projects/${projectId}/logs`).then((r) => r.data);

export const addLog = (projectId, data) =>
  api.post(`/projects/${projectId}/logs`, data).then((r) => r.data);

export const getExecutions = (projectId) =>
  api.get(`/projects/${projectId}/executions`).then((r) => r.data);

export const cancelExecution = (projectId, executionId) =>
  api
    .post(`/projects/${projectId}/executions/${executionId}/cancel`)
    .then((r) => r.data);

export const getDiffs = (projectId, status) =>
  api
    .get(`/projects/${projectId}/diffs`, { params: status ? { status } : {} })
    .then((r) => r.data);

export const acceptDiff = (projectId, diffId) =>
  api.post(`/projects/${projectId}/diffs/${diffId}/accept`).then((r) => r.data);

export const rejectDiff = (projectId, diffId) =>
  api.post(`/projects/${projectId}/diffs/${diffId}/reject`).then((r) => r.data);

export const aiEdit = (projectId, data) =>
  api.post(`/projects/${projectId}/ai-edit`, data).then((r) => r.data);

export const getProblems = (projectId) =>
  api.get(`/projects/${projectId}/problems`).then((r) => r.data);

export const syncWorkspace = (projectId) =>
  api.post(`/projects/${projectId}/sync`).then((r) => r.data);

export const detectType = (projectId) =>
  api.get(`/projects/${projectId}/detect`).then((r) => r.data);

export const startRun = (projectId, data = {}) =>
  api.post(`/projects/${projectId}/run`, data).then((r) => r.data);

export const stopRun = (projectId, data = {}) =>
  api.post(`/projects/${projectId}/stop`, data).then((r) => r.data);

export const listRuns = (projectId) =>
  api.get(`/projects/${projectId}/runs`).then((r) => r.data);

export const getRun = (projectId, runId) =>
  api.get(`/projects/${projectId}/runs/${runId}`).then((r) => r.data);

export const getLayout = (projectId) =>
  api.get(`/projects/${projectId}/layout`).then((r) => r.data);

export const saveLayout = (projectId, data) =>
  api.put(`/projects/${projectId}/layout`, data).then((r) => r.data);

export const listTerminals = (projectId) =>
  api.get(`/projects/${projectId}/terminals`).then((r) => r.data);

export const createTerminal = (projectId, data = {}) =>
  api.post(`/projects/${projectId}/terminals`, data).then((r) => r.data);

export const deleteTerminal = (projectId, sessionId) =>
  api.delete(`/projects/${projectId}/terminals/${sessionId}`).then((r) => r.data);

export const gitStatus = (projectId) =>
  api.get(`/projects/${projectId}/git/status`).then((r) => r.data);

export const gitDiff = (projectId, path) =>
  api
    .get(`/projects/${projectId}/git/diff`, { params: path ? { path } : {} })
    .then((r) => r.data);

export const gitStage = (projectId, paths = []) =>
  api.post(`/projects/${projectId}/git/stage`, { paths }).then((r) => r.data);

export const gitCommit = (projectId, message) =>
  api.post(`/projects/${projectId}/git/commit`, { message }).then((r) => r.data);

export const gitCheckout = (projectId, branch, create = false) =>
  api
    .post(`/projects/${projectId}/git/checkout`, { branch, create })
    .then((r) => r.data);

export const gitPush = (projectId, data = {}) =>
  api.post(`/projects/${projectId}/git/push`, data).then((r) => r.data);

export const gitPull = (projectId, data = {}) =>
  api.post(`/projects/${projectId}/git/pull`, data).then((r) => r.data);

export function getTerminalWsUrl(projectId, sessionId, cols = 80, rows = 24) {
  const base = (api.defaults.baseURL || "http://localhost:5000/api").replace(
    /\/api\/?$/,
    "",
  );
  const wsBase = base.replace(/^http/, "ws");
  const params = new URLSearchParams({
    projectId,
    cols: String(cols),
    rows: String(rows),
  });
  if (sessionId) params.set("sessionId", sessionId);
  // Auth via HttpOnly cookies on the WS upgrade — never put tokens in the query string
  return `${wsBase}/ws/terminal?${params.toString()}`;
}
