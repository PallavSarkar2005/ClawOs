import axios from "axios";

const API = axios.create({
  baseURL: "http://localhost:5000/api",
});

API.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");

  if (token) {
    config.headers.Authorization =
      `Bearer ${token}`;
  }

  return config;
});

export const getSkills = async () => {
  const res = await API.get("/skills");

  return res.data;
};

export const createSkill = async (skill) => {
  const res = await API.post(
    "/skills",
    skill
  );

  return res.data;
};

export const deleteSkill = async (id) => {
  const res = await API.delete(
    `/skills/${id}`
  );

  return res.data;
};