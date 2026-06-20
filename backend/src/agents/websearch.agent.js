const axios = require("axios");

async function webSearch(query) {
  try {
    const response = await axios.get(
      "https://api.duckduckgo.com/",
      {
        params: {
          q: query,
          format: "json",
        },
      },
    );

    return response.data.AbstractText || "";
  } catch (error) {
    console.error(error);

    return "";
  }
}

module.exports = webSearch;