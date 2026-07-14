import API from "./chatApi";

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