import { useEffect, useState } from "react";
import Sidebar from "../components/Sidebar";

import {
  createConversation,
  getConversations,
  getMessages,
  sendMessage,
} from "../api/chatApi";

function ChatPage() {
  const [conversations, setConversations] = useState([]);
  const [currentConversation, setCurrentConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");

  const loadConversations = async () => {
    try {
      const res = await getConversations();

      setConversations(res.data);

      if (res.data.length > 0 && !currentConversation) {
        setCurrentConversation(res.data[0].id);
      }
    } catch (error) {
      console.error(error);
    }
  };

  const loadMessages = async (conversationId) => {
    try {
      const res = await getMessages(conversationId);

      setMessages(res.data);
    } catch (error) {
      console.error(error);
    }
  };

  const handleNewChat = async () => {
    try {
      const res = await createConversation();

      await loadConversations();

      setCurrentConversation(res.data.id);

      setMessages([]);
    } catch (error) {
      console.error(error);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || !currentConversation) return;

    try {
      await sendMessage({
        conversationId: currentConversation,
        message: input,
      });

      setInput("");

      await loadMessages(currentConversation);
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    loadConversations();
  }, []);

  useEffect(() => {
    if (currentConversation) {
      loadMessages(currentConversation);
    }
  }, [currentConversation]);

  return (
    <div className="flex min-h-screen bg-[#1B2748]">
      <Sidebar />

      <div className="flex w-full">
        {/* Conversations */}
        <div className="w-72 border-r border-white/10 p-4">
          <button
            onClick={handleNewChat}
            className="w-full bg-[#F15B42] text-white py-3 rounded-xl mb-4"
          >
            New Chat
          </button>

          {conversations.map((conversation) => (
            <div
              key={conversation.id}
              onClick={() => setCurrentConversation(conversation.id)}
              className={`p-3 rounded-xl mb-2 cursor-pointer text-white ${
                currentConversation === conversation.id
                  ? "bg-[#F15B42]"
                  : "bg-white/10"
              }`}
            >
              {conversation.title}
            </div>
          ))}
        </div>

        {/* Chat Area */}
        <div className="flex flex-col flex-1">
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${
                  msg.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-xl px-4 py-3 rounded-2xl ${
                    msg.role === "user"
                      ? "bg-[#F15B42] text-white"
                      : "bg-[#24335f] text-white"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-white/10 p-4 flex gap-3">
            <input
              type="text"
              placeholder="Type a message..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="flex-1 px-4 py-3 rounded-xl"
            />

            <button
              onClick={handleSend}
              className="bg-[#F15B42] text-white px-6 rounded-xl"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ChatPage;
