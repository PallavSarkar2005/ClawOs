import API from "../services/api";

export const contextApi = {
  preview: (body) => API.post("/context/preview", body).then((r) => r.data),
  rank: (body) => API.post("/context/rank", body).then((r) => r.data),
  compress: (body) => API.post("/context/compress", body).then((r) => r.data),
  allocation: (body) => API.post("/context/allocation", body).then((r) => r.data),
  debugRetrieval: (body) => API.post("/context/debug/retrieval", body).then((r) => r.data),
  sessions: (params) => API.get("/context/sessions", { params }).then((r) => r.data),
  inspect: (id) => API.get(`/context/sessions/${id}`).then((r) => r.data),
  replay: (id) => API.post(`/context/sessions/${id}/replay`).then((r) => r.data),
  cacheStats: () => API.get("/context/cache").then((r) => r.data),
  invalidateCache: (body) => API.post("/context/cache/invalidate", body || {}).then((r) => r.data),
};

export default contextApi;
