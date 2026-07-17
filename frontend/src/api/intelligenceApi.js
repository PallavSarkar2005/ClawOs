import api from "../services/api";

const base = (projectId) => `/projects/${projectId}/intelligence`;

export const getStatus = (projectId) =>
  api.get(`${base(projectId)}/status`).then((r) => r.data);

export const indexRepository = (projectId, { incremental = false } = {}) =>
  api.post(`${base(projectId)}/index`, { incremental }).then((r) => r.data);

export const getGraphs = (projectId, kind) =>
  api.get(`${base(projectId)}/graphs`, { params: kind ? { kind } : {} }).then((r) => r.data);

export const getSymbols = (projectId, params = {}) =>
  api.get(`${base(projectId)}/symbols`, { params }).then((r) => r.data);

export const searchEverywhere = (projectId, query, mode = "hybrid") =>
  api.post(`${base(projectId)}/search`, { query, mode }).then((r) => r.data);

export const goToDefinition = (projectId, params) =>
  api.get(`${base(projectId)}/definition`, { params }).then((r) => r.data);

export const findReferences = (projectId, params) =>
  api.get(`${base(projectId)}/references`, { params }).then((r) => r.data);

export const peekDefinition = (projectId, params) =>
  api.get(`${base(projectId)}/peek`, { params }).then((r) => r.data);

export const callHierarchy = (projectId, name) =>
  api.get(`${base(projectId)}/call-hierarchy`, { params: { name } }).then((r) => r.data);

export const typeHierarchy = (projectId, name) =>
  api.get(`${base(projectId)}/type-hierarchy`, { params: { name } }).then((r) => r.data);

export const breadcrumbs = (projectId, path) =>
  api.get(`${base(projectId)}/breadcrumbs`, { params: { path } }).then((r) => r.data);

export const askRepository = (projectId, question) =>
  api.post(`${base(projectId)}/ask`, { question }).then((r) => r.data);

export const impactAnalysis = (projectId, target) =>
  api.post(`${base(projectId)}/impact`, { target }).then((r) => r.data);

export const renamePlan = (projectId, symbolName, newName) =>
  api.post(`${base(projectId)}/rename`, { symbolName, newName }).then((r) => r.data);

export const getMetrics = (projectId) =>
  api.get(`${base(projectId)}/metrics`).then((r) => r.data);

export const getDebt = (projectId) =>
  api.get(`${base(projectId)}/debt`).then((r) => r.data);

export const getArchitecture = (projectId) =>
  api.get(`${base(projectId)}/architecture`).then((r) => r.data);

export const getMemory = (projectId) =>
  api.get(`${base(projectId)}/memory`).then((r) => r.data);

export const saveMemory = (projectId, body) =>
  api.post(`${base(projectId)}/memory`, body).then((r) => r.data);

export const getObservability = (projectId) =>
  api.get(`${base(projectId)}/observability`).then((r) => r.data);
