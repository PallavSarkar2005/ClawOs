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

export const getMemories = async () => {
  const res = await API.get("/memory");
  return res.data;
};

export const createMemory = async (content) => {
  const res = await API.post("/memory", {
    content,
  });

  return res.data;
};

export const deleteMemory = async (id) => {
  const res = await API.delete(`/memory/${id}`);
  return res.data;
};