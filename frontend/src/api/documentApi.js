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

export const getDocuments = async () => {
  const res = await API.get("/documents");

  return res.data;
};

export const uploadDocument = async (file) => {
  const formData = new FormData();

  formData.append("file", file);

  const res = await API.post("/documents/upload", formData);

  return res.data;
};

export const deleteDocument = async (id) => {
  const res = await API.delete(`/documents/${id}`);

  return res.data;
};
