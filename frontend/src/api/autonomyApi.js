import API from "../services/api";

export const getAutonomyDashboard = async (hours = 24) => {
  const res = await API.get("/autonomy/dashboard", { params: { hours } });
  return res.data;
};

export const listGoals = async (params = {}) => {
  const res = await API.get("/autonomy/goals", { params });
  return res.data;
};

export const createGoal = async (body) => {
  const res = await API.post("/autonomy/goals", body);
  return res.data;
};

export const getGoal = async (id) => {
  const res = await API.get(`/autonomy/goals/${id}`);
  return res.data;
};

export const planGoal = async (id, body = {}) => {
  const res = await API.post(`/autonomy/goals/${id}/plan`, body);
  return res.data;
};

export const decomposeGoal = async (description) => {
  const res = await API.post("/autonomy/decompose", { description });
  return res.data;
};

export const startExecution = async (body) => {
  const res = await API.post("/autonomy/execute", body);
  return res.data;
};

export const listSessions = async (params = {}) => {
  const res = await API.get("/autonomy/sessions", { params });
  return res.data;
};

export const getSession = async (id) => {
  const res = await API.get(`/autonomy/sessions/${id}`);
  return res.data;
};

export const getProgress = async (id) => {
  const res = await API.get(`/autonomy/sessions/${id}/progress`);
  return res.data;
};

export const cancelSession = async (id) => {
  const res = await API.post(`/autonomy/sessions/${id}/cancel`);
  return res.data;
};

export const resumeSession = async (id, body = {}) => {
  const res = await API.post(`/autonomy/sessions/${id}/resume`, body);
  return res.data;
};

export const listArtifacts = async (params = {}) => {
  const res = await API.get("/autonomy/artifacts", { params });
  return res.data;
};

export const getArtifact = async (id) => {
  const res = await API.get(`/autonomy/artifacts/${id}`);
  return res.data;
};

export const listDecisions = async (params = {}) => {
  const res = await API.get("/autonomy/decisions", { params });
  return res.data;
};

export const listApprovals = async (params = {}) => {
  const res = await API.get("/autonomy/approvals", { params });
  return res.data;
};

export const resolveApproval = async (id, body) => {
  const res = await API.post(`/autonomy/approvals/${id}/resolve`, body);
  return res.data;
};

export const listBuilds = async (params = {}) => {
  const res = await API.get("/autonomy/builds", { params });
  return res.data;
};

export const listTests = async (params = {}) => {
  const res = await API.get("/autonomy/tests", { params });
  return res.data;
};

export const listReviews = async (params = {}) => {
  const res = await API.get("/autonomy/reviews", { params });
  return res.data;
};

export const listAgents = async () => {
  const res = await API.get("/autonomy/agents");
  return res.data;
};
