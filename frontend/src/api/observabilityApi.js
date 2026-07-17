import API from "../services/api";

export const getObservabilityDashboard = async (hours = 24) => {
  const res = await API.get("/observability/dashboard", { params: { hours } });
  return res.data;
};

export const searchTraces = async (params = {}) => {
  const res = await API.get("/observability/search", { params });
  return res.data;
};

export const getTrace = async (traceId) => {
  const res = await API.get(`/observability/traces/${traceId}`);
  return res.data;
};

export const getTimeline = async (traceId) => {
  const res = await API.get(`/observability/traces/${traceId}/timeline`);
  return res.data;
};

export const getMetrics = async (hours = 24) => {
  const res = await API.get("/observability/metrics", { params: { hours } });
  return res.data;
};

export const getAlerts = async (params = {}) => {
  const res = await API.get("/observability/alerts", { params });
  return res.data;
};

export const acknowledgeAlert = async (id) => {
  const res = await API.post(`/observability/alerts/${id}/acknowledge`);
  return res.data;
};

export const resolveAlert = async (id) => {
  const res = await API.post(`/observability/alerts/${id}/resolve`);
  return res.data;
};

export const createReplay = async (traceId) => {
  const res = await API.post(`/observability/traces/${traceId}/replay`);
  return res.data;
};

export const listReplays = async (params = {}) => {
  const res = await API.get("/observability/replays", { params });
  return res.data;
};

export const getReplay = async (id) => {
  const res = await API.get(`/observability/replays/${id}`);
  return res.data;
};

export const playReplay = async (id, body = {}) => {
  const res = await API.post(`/observability/replays/${id}/play`, body);
  return res.data;
};

export const getLogs = async (params = {}) => {
  const res = await API.get("/observability/logs", { params });
  return res.data;
};

export const exportTrace = async (traceId) => {
  const res = await API.get(`/observability/traces/${traceId}/export`);
  return res.data;
};

export const recordUserAction = async (payload) => {
  const res = await API.post("/observability/actions", payload);
  return res.data;
};
