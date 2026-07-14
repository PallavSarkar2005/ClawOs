import API from "./chatApi";

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