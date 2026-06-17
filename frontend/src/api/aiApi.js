import axios from "axios";

const API = axios.create({
  baseURL: "http://localhost:5000/api",
});

export const getModels = async () => {
  const res = await API.get("/ai/models");
  return res.data;
};

export const setProvider = async (provider) => {
  const res = await API.post("/ai/provider", {
    provider,
  });

  return res.data;
};