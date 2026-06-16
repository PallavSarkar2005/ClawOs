import axios from "axios";

const API = axios.create({
  baseURL: "http://localhost:5000/api",
});

API.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error),
);

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

export const sendMessage = async (conversationId, message) => {
  const res = await API.post("/chat/message", {
    conversationId,
    message,
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
