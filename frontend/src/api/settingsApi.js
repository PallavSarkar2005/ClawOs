import API from "./chatApi";

// ======================================
// GET SETTINGS
// ======================================

export async function getSettings() {
  const response = await API.get("/settings");

  return response.data;
}

// ======================================
// UPDATE SETTINGS
// ======================================

export async function updateSettings(settings) {
  const response = await API.put("/settings", settings);

  return response.data;
}
