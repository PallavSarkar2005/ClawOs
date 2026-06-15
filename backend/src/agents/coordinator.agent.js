const openai = require("../services/openai");

async function coordinatorAgent(userMessage) {
  try {
    const response = await openai.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "user",
          content: userMessage,
        },
      ],
      temperature: 0.7,
      max_tokens: 1024,
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error("Groq Error:", error.message);
    return "Groq API error. Please try again.";
  }
}

module.exports = coordinatorAgent;
