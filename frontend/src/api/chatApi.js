import API from "../services/api";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

function getCookie(name) {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export const createConversation = async () => {
  const res = await API.post("/chat/conversation");
  return res.data;
};

export const getConversations = async () => {
  const res = await API.get("/chat/conversation");
  return res.data;
};

export const getMessages = async (conversationId) => {
  const res = await API.get(`/chat/${conversationId}`);
  return res.data;
};

export const sendMessage = async (
  conversationId,
  message,
  skillId,
  workflowId,
  documentId,
  webSearchEnabled,
  projectId,
) => {
  const res = await API.post("/runtime/message", {
    conversationId,
    message,
    skillId,
    workflowId,
    documentId,
    webSearchEnabled,
    projectId,
  });
  return res.data;
};

/**
 * Stream multi-agent execution via SSE.
 * onEvent(payload) receives every runtime event.
 * Returns { reply, executionId, citations, metrics, skill, workflow }.
 */
export async function sendMessageStream(
  {
    conversationId,
    message,
    skillId,
    workflowId,
    documentId,
    webSearchEnabled,
    projectId,
  },
  { onEvent, signal } = {},
) {
  const base = API_BASE.replace(/\/$/, "");
  const url = `${base}/runtime/message/stream`;

  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      ...(getCookie("access_token")
        ? { Authorization: `Bearer ${getCookie("access_token")}` }
        : {}),
    },
    body: JSON.stringify({
      conversationId,
      message,
      skillId,
      workflowId,
      documentId,
      webSearchEnabled,
      projectId,
    }),
    signal,
  });

  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      errMsg = j.message || j.error || errMsg;
    } catch {
      /* ignore */
    }
    throw new Error(errMsg);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let final = {
    reply: "",
    citations: [],
    executionId: null,
    metrics: null,
    skill: null,
    workflow: null,
    status: null,
  };

  const flushEvents = (chunk) => {
    buffer += chunk;
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";
    for (const part of parts) {
      if (!part.trim() || part.startsWith(":")) continue;
      let event = "message";
      let data = "";
      for (const line of part.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (!data) continue;
      let parsed;
      try {
        parsed = JSON.parse(data);
      } catch {
        parsed = { raw: data };
      }
      if (event === "meta") {
        final.skill = parsed.skill ?? final.skill;
        final.workflow = parsed.workflow ?? final.workflow;
      }
      if (event === "final_response") {
        final.reply = parsed.content || final.reply;
        final.citations = parsed.citations || final.citations;
        final.executionId = parsed.executionId || final.executionId;
        final.metrics = parsed.metrics || final.metrics;
        final.status = parsed.status || final.status;
        if (parsed.skill) final.skill = parsed.skill;
        if (parsed.workflow) final.workflow = parsed.workflow;
      }
      onEvent?.({ event, ...parsed });
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    flushEvents(decoder.decode(value, { stream: true }));
  }
  if (buffer.trim()) flushEvents("\n\n");

  return final;
}

export const getExecution = async (id) => {
  const res = await API.get(`/runtime/executions/${id}`);
  return res.data;
};

export const listExecutions = async (conversationId) => {
  const res = await API.get("/runtime/executions", {
    params: conversationId ? { conversationId } : {},
  });
  return res.data;
};

export const cancelExecution = async (id) => {
  const res = await API.post(`/runtime/executions/${id}/cancel`);
  return res.data;
};

export const retryExecution = async (id, body = {}) => {
  const res = await API.post(`/runtime/executions/${id}/retry`, body);
  return res.data;
};

export const getMemories = async () => {
  const res = await API.get("/memory");
  return res.data;
};

export const deleteMemory = async (memoryId) => {
  const res = await API.delete(`/memory/${memoryId}`);
  return res.data;
};

export const deleteConversation = async (id) => {
  const res = await API.delete(`/chat/conversation/${id}`);
  return res.data;
};

export default API;
