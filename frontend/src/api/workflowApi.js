import API from "./chatApi";

export const getWorkflows = async (params = {}) => {
  const res = await API.get("/workflows", { params });
  return res.data;
};

export const getWorkflow = async (id) => {
  const res = await API.get(`/workflows/${id}`);
  return res.data;
};

export const createWorkflow = async (data) => {
  const res = await API.post("/workflows", data);
  return res.data;
};

export const updateWorkflow = async (id, data) => {
  const res = await API.put(`/workflows/${id}`, data);
  return res.data;
};

export const deleteWorkflow = async (id) => {
  const res = await API.delete(`/workflows/${id}`);
  return res.data;
};

export const cloneWorkflow = async (id, data = {}) => {
  const res = await API.post(`/workflows/${id}/clone`, data);
  return res.data;
};

export const publishWorkflow = async (id) => {
  const res = await API.post(`/workflows/${id}/publish`);
  return res.data;
};

export const exportWorkflow = async (id) => {
  const res = await API.get(`/workflows/${id}/export`);
  return res.data;
};

export const importWorkflow = async (payload) => {
  const res = await API.post("/workflows/import", payload);
  return res.data;
};

export const validateWorkflow = async (id, body = {}) => {
  const res = await API.post(`/workflows/${id}/validate`, body);
  return res.data;
};

export const layoutWorkflow = async (id) => {
  const res = await API.post(`/workflows/${id}/layout`);
  return res.data;
};

export const executeWorkflow = async (id, inputs = {}) => {
  const res = await API.post(`/workflows/${id}/execute`, { inputs });
  return res.data;
};

export const getExecutions = async (workflowId, params = {}) => {
  const res = await API.get(`/workflows/${workflowId}/executions`, { params });
  return res.data;
};

export const getExecution = async (executionId) => {
  const res = await API.get(`/workflows/executions/${executionId}`);
  return res.data;
};

export const pauseExecution = async (executionId) => {
  const res = await API.post(`/workflows/executions/${executionId}/pause`);
  return res.data;
};

export const resumeExecution = async (executionId, body = {}) => {
  const res = await API.post(`/workflows/executions/${executionId}/resume`, body);
  return res.data;
};

export const cancelExecution = async (executionId) => {
  const res = await API.post(`/workflows/executions/${executionId}/cancel`);
  return res.data;
};

export const retryExecution = async (executionId) => {
  const res = await API.post(`/workflows/executions/${executionId}/retry`);
  return res.data;
};

export const approveExecution = async (executionId, body = {}) => {
  const res = await API.post(`/workflows/executions/${executionId}/approve`, body);
  return res.data;
};

export const getWorkflowMetrics = async (id) => {
  const res = await API.get(`/workflows/${id}/metrics`);
  return res.data;
};

export const getTemplates = async () => {
  const res = await API.get("/workflows/templates");
  return res.data;
};

export const createFromTemplate = async (templateId, data = {}) => {
  const res = await API.post(`/workflows/templates/${templateId}/create`, data);
  return res.data;
};

export const getSchedules = async (id) => {
  const res = await API.get(`/workflows/${id}/schedules`);
  return res.data;
};

export const createSchedule = async (id, data) => {
  const res = await API.post(`/workflows/${id}/schedules`, data);
  return res.data;
};

export const getTriggers = async (id) => {
  const res = await API.get(`/workflows/${id}/triggers`);
  return res.data;
};

export const createTrigger = async (id, data) => {
  const res = await API.post(`/workflows/${id}/triggers`, data);
  return res.data;
};

export const getNodeTypes = async () => {
  const res = await API.get("/workflows/meta/node-types");
  return res.data;
};

export function streamExecution(executionId, onEvent) {
  const base = API.defaults.baseURL || "/api";
  const url = `${base}/workflows/executions/${executionId}/stream`;
  const es = new EventSource(url, { withCredentials: true });
  const handler = (e) => {
    try {
      onEvent(JSON.parse(e.data));
    } catch {
      onEvent({ event: e.type, raw: e.data });
    }
  };
  [
    "workflow.queued",
    "workflow.started",
    "workflow.paused",
    "workflow.resumed",
    "workflow.completed",
    "workflow.failed",
    "workflow.cancelled",
    "workflow.node.started",
    "workflow.node.completed",
    "workflow.node.failed",
    "workflow.node.skipped",
    "workflow.node.waiting",
    "workflow.log",
    "workflow.checkpoint",
    "workflow.metric",
    "workflow.approval_required",
    "workflow.subscribed",
    "message",
  ].forEach((ev) => es.addEventListener(ev, handler));
  es.onmessage = handler;
  return () => es.close();
}
