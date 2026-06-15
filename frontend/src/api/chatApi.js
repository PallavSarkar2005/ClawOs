import axios from "axios";

const API = axios.create({
  baseURL: "http://localhost:5000/api",
});

API.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

export const createConversation = () =>
  API.post("/chat/conversation");

export const getConversations = () =>
  API.get("/chat/conversations");

export const getMessages = (conversationId) =>
  API.get(`/chat/${conversationId}`);

export const sendMessage = (data) =>
  API.post("/chat/message", data);