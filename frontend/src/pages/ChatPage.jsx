import { useEffect, useRef, useState } from "react";

import Sidebar from "../components/Sidebar";
import { getSkills } from "../api/skillApi";
import {
  createConversation,
  getConversations,
  getMessages,
  sendMessage,
  deleteConversation,
} from "../api/chatApi";
import { getWorkflows } from "../api/workflowApi";
import { setProvider } from "../api/aiApi";

function ChatPage() {
  // ==================================================
  // STATE MANAGEMENT
  // ==================================================

  const [conversations, setConversations] = useState([]);
  const [currentConversation, setCurrentConversation] = useState(null);

  const [messages, setMessages] = useState([]);

  const [input, setInput] = useState("");

  const [loading, setLoading] = useState(false);

  const [provider, setProviderState] = useState("openrouter");

  const [skills, setSkills] = useState([]);

  const [selectedSkill, setSelectedSkill] = useState("");

  const [activeSkill, setActiveSkill] = useState(null);

  const [workflows, setWorkflows] = useState([]);

  const [selectedWorkflow, setSelectedWorkflow] = useState("");

  // ==================================================
  // AUTO SCROLL
  // ==================================================

  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  };

  // ==================================================
  // LOAD CONVERSATIONS
  // ==================================================

  const loadConversations = async () => {
    try {
      const data = await getConversations();

      setConversations(data);

      if (data.length > 0 && !currentConversation) {
        setCurrentConversation(data[0]);
      }
    } catch (error) {
      console.error("Load conversations error:", error);
    }
  };

  // ==================================================
  // LOAD MESSAGES
  // ==================================================

  const loadMessages = async (conversationId) => {
    try {
      const data = await getMessages(conversationId);

      setMessages(data);
    } catch (error) {
      console.error("Load messages error:", error);
    }
  };

  // ==================================================
  // CREATE NEW CHAT
  // ==================================================

  const handleNewChat = async () => {
    try {
      const chat = await createConversation();

      setConversations((prev) => [chat, ...prev]);

      setCurrentConversation(chat);

      setMessages([]);
    } catch (error) {
      console.error("Create conversation error:", error);
    }
  };

  // ==================================================
  // SELECT CHAT
  // ==================================================

  const handleSelectConversation = async (chat) => {
    setCurrentConversation(chat);

    await loadMessages(chat.id);
  };

  // ==================================================
  // DELETE CHAT
  // ==================================================

  const handleDeleteConversation = async (id) => {
    try {
      await deleteConversation(id);

      const updatedConversations = conversations.filter(
        (chat) => chat.id !== id,
      );

      setConversations(updatedConversations);

      if (currentConversation?.id === id) {
        if (updatedConversations.length > 0) {
          setCurrentConversation(updatedConversations[0]);

          await loadMessages(updatedConversations[0].id);
        } else {
          setCurrentConversation(null);

          setMessages([]);
        }
      }
    } catch (error) {
      console.error("Delete conversation error:", error);
    }
  };

  // ==================================================
  // CHANGE AI PROVIDER
  // ==================================================

  const handleProviderChange = async (e) => {
    try {
      const selectedProvider = e.target.value;

      setProviderState(selectedProvider);

      await setProvider(selectedProvider);
    } catch (error) {
      console.error("Provider change error:", error);
    }
  };

  // ==================================================
  // SEND MESSAGE
  // ==================================================

  const handleSend = async () => {
    if (!input.trim()) return;

    if (!currentConversation) {
      await handleNewChat();
      return;
    }

    const userMessage = {
      id: Date.now(),
      role: "user",
      content: input,
    };

    setMessages((prev) => [...prev, userMessage]);

    const messageText = input;

    setInput("");

    setLoading(true);

    try {
      const response = await sendMessage(
        currentConversation.id,
        messageText,
        selectedSkill,
        selectedWorkflow,
      );

      if (response.skill) {
        console.log("Auto Selected Skill:", response.skill);
      }

      setActiveSkill(response.skill);

      const assistantMessage = {
        id: Date.now() + 1,
        role: "assistant",
        content: response.reply,
      };

      setMessages((prev) => [...prev, assistantMessage]);

      await loadConversations();
    } catch (error) {
      console.error("Send message error:", error);

      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 2,
          role: "assistant",
          content: "⚠️ Something went wrong. Please try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // ==================================================
  // LOAD SKILLS
  // ==================================================

  const loadSkills = async () => {
    try {
      const data = await getSkills();

      setSkills(data.filter((s) => s.enabled));
    } catch (error) {
      console.error(error);
    }
  };

  // ==================================================
  // LOAD WORKFLOWS
  // ==================================================

  const loadWorkflows = async () => {
    try {
      const data = await getWorkflows();

      setWorkflows(data);
    } catch (error) {
      console.error(error);
    }
  };

  // ==================================================
  // INITIAL LOAD
  // ==================================================

  useEffect(() => {
    loadConversations();
    loadSkills();
    loadWorkflows();
  }, []);

  // ==================================================
  // LOAD MESSAGES WHEN CHAT CHANGES
  // ==================================================

  useEffect(() => {
    if (currentConversation?.id) {
      loadMessages(currentConversation.id);
    }
  }, [currentConversation]);

  // ==================================================
  // AUTO SCROLL TO LATEST MESSAGE
  // ==================================================

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  // ==================================================
  // UI
  // ==================================================

  return (
    <div className="flex h-screen bg-[#1B2748]">
      {/* SIDEBAR */}

      <Sidebar
        conversations={conversations}
        currentConversation={currentConversation}
        onSelectConversation={handleSelectConversation}
        onNewChat={handleNewChat}
        onDelete={handleDeleteConversation}
      />

      {/* MAIN CHAT AREA */}

      <div className="flex flex-col flex-1">
        {/* HEADER */}

        <div className="border-b border-white/10 p-5 flex justify-between items-center">
          <div className="flex gap-3 mt-3">
            {/* Skill Selector */}

            <select
              value={selectedSkill}
              onChange={(e) => setSelectedSkill(e.target.value)}
              className="bg-[#24335f] text-white px-4 py-2 rounded-xl"
            >
              <option value="">No Skill</option>

              {skills.map((skill) => (
                <option key={skill.id} value={skill.id}>
                  {skill.name}
                </option>
              ))}
            </select>

            {/* Workflow Selector */}

            <select
              value={selectedWorkflow}
              onChange={(e) => setSelectedWorkflow(e.target.value)}
              className="bg-[#24335f] text-white px-4 py-2 rounded-xl"
            >
              <option value="">No Workflow</option>

              {workflows.map((workflow) => (
                <option key={workflow.id} value={workflow.id}>
                  {workflow.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <h1 className="text-white text-2xl font-bold">
              {currentConversation ? currentConversation.title : "ClawOS Chat"}
            </h1>

            {activeSkill && (
              <div className="mt-2 inline-block bg-[#24335f] px-3 py-1 rounded-xl text-sm text-white">
                🧠 Skill: {activeSkill}
              </div>
            )}
          </div>

          {/* AI PROVIDER SELECTOR */}

          <select
            value={provider}
            onChange={handleProviderChange}
            className="bg-[#24335f] text-white px-4 py-2 rounded-xl outline-none"
          >
            <option value="openrouter">OpenRouter</option>

            <option value="groq">Groq</option>

            <option value="ollama">Ollama</option>
          </select>
        </div>

        {/* CHAT MESSAGES */}

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-white/50 mt-20">
              Start a conversation...
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${
                msg.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-2xl px-5 py-3 rounded-2xl break-words whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "bg-[#F15B42] text-white"
                    : "bg-[#24335f] text-white"
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}

          {/* THINKING INDICATOR */}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-[#24335f] text-white px-5 py-3 rounded-2xl">
                Thinking...
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* MESSAGE INPUT */}

        <div className="border-t border-white/10 p-4 flex gap-3">
          <input
            type="text"
            placeholder="Message ClawOS..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !loading) {
                handleSend();
              }
            }}
            className="flex-1 bg-white rounded-xl px-4 py-3 outline-none"
          />

          <button
            onClick={handleSend}
            disabled={loading}
            className="bg-[#F15B42] hover:bg-[#e14d35] disabled:opacity-50 text-white px-6 py-3 rounded-xl"
          >
            {loading ? "..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ChatPage;
