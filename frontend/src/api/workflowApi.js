import API from "./chatApi";

export const getWorkflows = async () => {
  const res = await API.get("/workflows");
  return res.data;
};

export const createWorkflow = async (data) => {
  const res = await API.post(
    "/workflows",
    data
  );

  return res.data;
};

export const deleteWorkflow = async (id) => {
  const res = await API.delete(
    `/workflows/${id}`
  );

  return res.data;
};