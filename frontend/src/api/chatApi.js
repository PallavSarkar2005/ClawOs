import API from "../services/api";

// Conversations

export const createConversation = async () => {
  const res = await API.post("/chat/conversation");

  return res.data;
};

export const getConversations = async () => {
  const res = await API.get("/chat/conversation");

  return res.data;
};

// Messages

export const getMessages = async (conversationId) => {
  const res = await API.get(`/chat/${conversationId}`);

  return res.data;
};

export const sendMessage = async (
  conversationId,
  message,
  skillId,
  workflowId,
  documentId,
  webSearchEnabled,
) => {
  const res = await API.post("/chat/message", {
    conversationId,
    message,
    skillId,
    workflowId,
    documentId,
    webSearchEnabled,
  });

  return res.data;
};

// Memory

export const getMemories = async () => {
  const res = await API.get("/memory");

  return res.data;
};

export const deleteMemory = async (memoryId) => {
  const res = await API.delete(`/memory/${memoryId}`);

  return res.data;
};

export const deleteConversation = async (id) => {
  const res = await API.delete(`/chat/conversation/${id}`);

  return res.data;
};

export default API;
