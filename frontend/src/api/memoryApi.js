import API from "./chatApi";

export const getMemories = async (params = {}) => {
  const res = await API.get("/memory", { params });
  const data = res.data;
  if (Array.isArray(data)) return { items: data, total: data.length };
  return data;
};

export const getMemory = async (id) => {
  const res = await API.get(`/memory/${id}`);
  return res.data;
};

export const createMemory = async (payload) => {
  const body = typeof payload === "string" ? { content: payload } : payload;
  const res = await API.post("/memory", body);
  return res.data;
};

export const updateMemory = async (id, payload) => {
  const res = await API.patch(`/memory/${id}`, payload);
  return res.data;
};

export const pinMemory = async (id, pinned = true) => {
  const res = await API.post(`/memory/${id}/pin`, { pinned });
  return res.data;
};

export const deleteMemory = async (id) => {
  const res = await API.delete(`/memory/${id}`);
  return res.data;
};

export const deleteAllMemories = async () => {
  const res = await API.delete("/memory");
  return res.data;
};

export const reembedMemory = async (id) => {
  const res = await API.post(`/memory/${id}/reembed`);
  return res.data;
};

export const searchMemory = async (query, opts = {}) => {
  const res = await API.post("/memory/search", { query, ...opts });
  return res.data;
};

export const buildContext = async (prompt, opts = {}) => {
  const res = await API.post("/memory/context", { prompt, ...opts });
  return res.data;
};

export const getMemoryStats = async () => {
  const res = await API.get("/memory/stats");
  return res.data;
};

export const getMemoryHistory = async (params = {}) => {
  const res = await API.get("/memory/history", { params });
  return res.data;
};

export const listCollections = async () => {
  const res = await API.get("/memory/collections");
  return res.data;
};

export const createCollection = async (payload) => {
  const res = await API.post("/memory/collections", payload);
  return res.data;
};

export const updateCollection = async (id, payload) => {
  const res = await API.patch(`/memory/collections/${id}`, payload);
  return res.data;
};

export const deleteCollection = async (id) => {
  const res = await API.delete(`/memory/collections/${id}`);
  return res.data;
};

export const addToCollection = async (collectionId, memoryId) => {
  const res = await API.post(`/memory/collections/${collectionId}/items`, { memoryId });
  return res.data;
};

export const listRelationships = async (params = {}) => {
  const res = await API.get("/memory/relationships", { params });
  return res.data;
};

export const createRelationship = async (payload) => {
  const res = await API.post("/memory/relationships", payload);
  return res.data;
};

export const getGraph = async (id, params = {}) => {
  const res = await API.get(`/memory/graph/${id}`, { params });
  return res.data;
};

export const listMemoryDocuments = async (params = {}) => {
  const res = await API.get("/memory/documents", { params });
  return res.data;
};

export const uploadMemoryDocument = async (file, extra = {}) => {
  const formData = new FormData();
  formData.append("file", file);
  Object.entries(extra).forEach(([k, v]) => {
    if (v != null) formData.append(k, v);
  });
  const res = await API.post("/memory/documents/upload", formData);
  return res.data;
};

export const getMemoryDocument = async (id) => {
  const res = await API.get(`/memory/documents/${id}`);
  return res.data;
};

export const getDocumentChunks = async (id) => {
  const res = await API.get(`/memory/documents/${id}/chunks`);
  return res.data;
};

export const deleteMemoryDocument = async (id) => {
  const res = await API.delete(`/memory/documents/${id}`);
  return res.data;
};

export const reindexDocument = async (id) => {
  const res = await API.post(`/memory/documents/${id}/reindex`);
  return res.data;
};

export const listIndexJobs = async (params = {}) => {
  const res = await API.get("/memory/jobs", { params });
  return res.data;
};
