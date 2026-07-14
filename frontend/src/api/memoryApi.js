import API from "./chatApi";

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