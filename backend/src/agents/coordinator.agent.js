const AI_CONFIG = require("../config/ai.config");

const openrouter = require("../services/openrouter");
const groq = require("../services/groq");

const axios = require("axios");

// ========================================
// MAIN AI COORDINATOR
// ========================================

async function coordinatorAgent(
  userMessage,
  skillPrompt = "",
  workflowPrompt = "",
  memoryContext = "",
) {
  try {
    // ========================================
    // CURRENT PROVIDER
    // ========================================

    const { getCurrentProvider } = require("../controllers/ai.controller");

    const currentProvider = getCurrentProvider();

    // ========================================
    // SYSTEM PROMPT
    // ========================================

    const systemPrompt = `
You are ClawOS AI.

========================
ACTIVE SKILL
========================

${skillPrompt || "None"}

========================
ACTIVE WORKFLOW
========================

${workflowPrompt || "None"}

========================
USER MEMORIES
========================

${memoryContext || "No memories found"}

Instructions:
- Follow the skill instructions when provided.
- Follow workflow instructions when provided.
- Use memories only when relevant.
- Be concise and helpful.
`;

    // ========================================
    // OPENROUTER
    // ========================================

    if (currentProvider === "openrouter") {
      const response = await openrouter.chat.completions.create({
        model: AI_CONFIG.openrouter.model,

        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: userMessage,
          },
        ],

        temperature: 0.7,
        max_tokens: 1024,
      });

      return response.choices[0].message.content;
    }

    // ========================================
    // GROQ
    // ========================================

    if (currentProvider === "groq") {
      const response = await groq.chat.completions.create({
        model: AI_CONFIG.groq.model,

        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: userMessage,
          },
        ],

        temperature: 0.7,
        max_tokens: 1024,
      });

      return response.choices[0].message.content;
    }

    // ========================================
    // OLLAMA
    // ========================================

    if (currentProvider === "ollama") {
      const response = await axios.post(
        `${AI_CONFIG.ollama.baseUrl}/api/generate`,
        {
          model: AI_CONFIG.ollama.model,

          prompt: `
${systemPrompt}

========================
USER MESSAGE
========================

${userMessage}
`,

          stream: false,
        },
      );

      return response.data.response;
    }

    return "No AI provider selected.";
  } catch (error) {
    console.error("AI Error:", error.message);

    // ========================================
    // GROQ FALLBACK
    // ========================================

    try {
      console.log("Trying Groq fallback...");

      const response = await groq.chat.completions.create({
        model: AI_CONFIG.groq.model,

        messages: [
          {
            role: "user",
            content: userMessage,
          },
        ],
      });

      return response.choices[0].message.content;
    } catch (fallbackError) {
      console.error("Groq Fallback Error:", fallbackError.message);
    }

    // ========================================
    // RATE LIMIT
    // ========================================

    if (
      error.code === "insufficient_quota" ||
      error.status === 429 ||
      error.response?.status === 429
    ) {
      return "⚠️ AI quota exceeded. Please switch provider.";
    }

    return "⚠️ AI service unavailable. Please try again later.";
  }
}

module.exports = coordinatorAgent;
