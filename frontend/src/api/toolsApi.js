import API from "../services/api";

export const toolsApi = {
  catalog: () => API.get("/tools/catalog").then((r) => r.data),
  list: (params) => API.get("/tools", { params }).then((r) => r.data),
  get: (id) => API.get(`/tools/${encodeURIComponent(id)}`).then((r) => r.data),
  invoke: (id, body) =>
    API.post(`/tools/${encodeURIComponent(id)}/invoke`, body).then((r) => r.data),
  parallel: (body) => API.post("/tools/parallel", body).then((r) => r.data),
  executions: () => API.get("/tools/executions").then((r) => r.data),
  execution: (id) => API.get(`/tools/executions/${id}`).then((r) => r.data),
  replay: (id) => API.post(`/tools/executions/${id}/replay`).then((r) => r.data),
  metrics: (params) => API.get("/tools/metrics", { params }).then((r) => r.data),
  reloadPlugins: () => API.post("/tools/plugins/reload").then((r) => r.data),
  mcpList: () => API.get("/tools/mcp").then((r) => r.data),
  mcpConnect: (body) => API.post("/tools/mcp", body).then((r) => r.data),
};

export default toolsApi;
