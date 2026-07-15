import api from "../services/api";

export async function getSettings() {
  const response = await api.get("/settings");
  return response.data;
}

export async function updateSettings(settings) {
  const response = await api.put("/settings", settings);
  return response.data;
}

export async function getIntegrations() {
  const response = await api.get("/integrations");
  return response.data;
}

export async function connectIntegration(provider, apiKey) {
  const response = await api.post("/integrations/connect", { provider, apiKey });
  return response.data;
}

export async function disconnectIntegration(provider) {
  const response = await api.delete(`/integrations/${provider}`);
  return response.data;
}

export async function testIntegration(provider) {
  const response = await api.post(`/integrations/${provider}/test`);
  return response.data;
}

export async function exportAccountData() {
  const response = await api.get("/data/export");
  return response.data;
}

export async function downloadConversations() {
  const response = await api.get("/data/conversations");
  return response.data;
}

export async function exportMemories() {
  const response = await api.get("/data/memories");
  return response.data;
}

export async function deleteAllMemories() {
  const response = await api.delete("/data/memories");
  return response.data;
}

export async function deleteAllConversations() {
  const response = await api.delete("/data/conversations");
  return response.data;
}

export async function deleteAllDocuments() {
  const response = await api.delete("/data/documents");
  return response.data;
}

export async function clearCache() {
  const response = await api.delete("/data/cache");
  return response.data;
}

export async function getSessions() {
  const response = await api.get("/auth/sessions");
  return response.data;
}

export async function revokeSession(sessionId) {
  const response = await api.delete(`/auth/sessions/${sessionId}`);
  return response.data;
}

export async function revokeAllOtherSessions() {
  const response = await api.delete("/auth/sessions");
  return response.data;
}

export async function getAiModels() {
  const response = await api.get("/ai/models");
  return response.data;
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export { downloadJson };
