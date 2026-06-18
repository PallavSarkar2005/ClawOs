import { Link, useLocation } from "react-router-dom";

function Sidebar({
  conversations = [],
  currentConversation,
  onSelectConversation,
  onNewChat,
  onDelete,
}) {
  const location = useLocation();

  return (
    <div className="w-72 bg-[#233566] border-r border-white/10 min-h-screen flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-white/10">
        <h1 className="text-2xl font-bold text-white">ClawOS</h1>
      </div>

      {/* New Chat */}
      <div className="p-4">
        <button
          onClick={onNewChat}
          className="w-full bg-[#F15B42] hover:bg-[#e14d35] text-white py-3 rounded-xl font-medium transition"
        >
          + New Chat
        </button>
      </div>

      {/* Conversations */}
      <div className="flex-1 overflow-y-auto px-3">
        <h2 className="text-white/60 text-sm mb-3 px-2">Conversations</h2>

        {conversations.length === 0 ? (
          <p className="text-white/40 text-sm px-2">No conversations yet</p>
        ) : (
          conversations.map((chat) => (
            <div key={chat.id} className="flex items-center gap-2 mb-2">
              <button
                onClick={() => onSelectConversation(chat)}
                className={`flex-1 text-left p-3 rounded-xl transition ${
                  currentConversation?.id === chat.id
                    ? "bg-white/20 text-white"
                    : "bg-[#24335f] hover:bg-[#2e427a] text-white"
                }`}
              >
                <p className="truncate">{chat.title}</p>
              </button>

              <button
                onClick={() => onDelete(chat.id)}
                className="bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded-xl transition"
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>

      {/* Navigation */}
      <div className="border-t border-white/10 p-4 space-y-2">
        <Link
          to="/dashboard"
          className={`block p-3 rounded-xl ${
            location.pathname === "/dashboard"
              ? "bg-white/20 text-white"
              : "text-white hover:bg-white/10"
          }`}
        >
          Dashboard
        </Link>

        <Link
          to="/chat"
          className={`block p-3 rounded-xl ${
            location.pathname === "/chat"
              ? "bg-white/20 text-white"
              : "text-white hover:bg-white/10"
          }`}
        >
          Chat
        </Link>

        <Link
          to="/skills"
          className={`block p-3 rounded-xl ${
            location.pathname === "/skills"
              ? "bg-white/20 text-white"
              : "text-white hover:bg-white/10"
          }`}
        >
          Skills
        </Link>

        <Link
          to="/memory"
          className={`block p-3 rounded-xl ${
            location.pathname === "/memory"
              ? "bg-white/20 text-white"
              : "text-white hover:bg-white/10"
          }`}
        >
          Memory
        </Link>

        <Link
          to="/workflows"
          className={`block p-3 rounded-xl ${
            location.pathname === "/workflows"
              ? "bg-white/20 text-white"
              : "text-white hover:bg-white/10"
          }`}
        >
          Workflows
        </Link>

        <Link
          to="/settings"
          className={`block p-3 rounded-xl ${
            location.pathname === "/settings"
              ? "bg-white/20 text-white"
              : "text-white hover:bg-white/10"
          }`}
        >
          Settings
        </Link>

        <Link
          to="/documents"
          className={`block p-3 rounded-xl ${
            location.pathname === "/documents"
              ? "bg-white/20 text-white"
              : "text-white hover:bg-white/10"
          }`}
        >
          Documents
        </Link>
      </div>
    </div>
  );
}

export default Sidebar;
