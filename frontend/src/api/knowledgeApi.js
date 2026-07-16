import API from "./chatApi";

export const knowledgeSearch = async (query, opts = {}) => {
  const res = await API.post("/knowledge/search", { query, ...opts });
  return res.data;
};

export const hybridSearch = async (query, opts = {}) => {
  const res = await API.post("/knowledge/search/hybrid", { query, ...opts });
  return res.data;
};

export const semanticSearch = async (query, opts = {}) => {
  const res = await API.post("/knowledge/search/semantic", { query, ...opts });
  return res.data;
};

export const getSearchHistory = async (params = {}) => {
  const res = await API.get("/knowledge/search/history", { params });
  return res.data;
};

export const getKnowledgeGraph = async (id, params = {}) => {
  const res = await API.get(`/knowledge/graph/${id}`, { params });
  return res.data;
};

export const getGraphMetrics = async () => {
  const res = await API.get("/knowledge/graph-metrics");
  return res.data;
};

export const listKnowledgeCollections = async () => {
  const res = await API.get("/knowledge/collections");
  return res.data;
};

export const createKnowledgeCollection = async (payload) => {
  const res = await API.post("/knowledge/collections", payload);
  return res.data;
};

export const listPinnedKnowledge = async () => {
  const res = await API.get("/knowledge/pinned");
  return res.data;
};

export const listArchivedKnowledge = async () => {
  const res = await API.get("/knowledge/archived");
  return res.data;
};

export const reinforceMemory = async (id, payload = {}) => {
  const res = await API.post(`/knowledge/memories/${id}/reinforce`, payload);
  return res.data;
};

export const getIndexStatus = async () => {
  const res = await API.get("/knowledge/index/status");
  return res.data;
};

export const optimizeIndexes = async () => {
  const res = await API.post("/knowledge/index/optimize");
  return res.data;
};

export const getEmbeddingStatus = async () => {
  const res = await API.get("/knowledge/embeddings/status");
  return res.data;
};

export const backfillEmbeddings = async () => {
  const res = await API.post("/knowledge/embeddings/backfill");
  return res.data;
};

export const inspectRetrieval = async (id) => {
  const res = await API.get(`/knowledge/inspector/${id}`);
  return res.data;
};

export const evaluateRetrieval = async (payload) => {
  const res = await API.post("/knowledge/evaluate", payload);
  return res.data;
};

export const listKnowledgeNodes = async (params = {}) => {
  const res = await API.get("/knowledge/nodes", { params });
  return res.data;
};

export const getKnowledgeNode = async (id) => {
  const res = await API.get(`/knowledge/nodes/${id}`);
  return res.data;
};
