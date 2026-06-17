import { useEffect, useState } from "react";

import Sidebar from "../components/Sidebar";

import { getMemories, createMemory, deleteMemory } from "../api/memoryApi";

function MemoryPage() {
  // =========================
  // STATES
  // =========================

  const [memories, setMemories] = useState([]);

  const [content, setContent] = useState("");

  const [loading, setLoading] = useState(false);

  // =========================
  // LOAD MEMORIES
  // =========================

  const loadMemories = async () => {
    try {
      const data = await getMemories();

      setMemories(data);
    } catch (error) {
      console.error("Load memories error:", error);
    }
  };

  // =========================
  // CREATE MEMORY
  // =========================

  const handleCreateMemory = async () => {
    if (!content.trim()) return;

    try {
      setLoading(true);

      await createMemory(content);

      setContent("");

      await loadMemories();
    } catch (error) {
      console.error("Create memory error:", error);
    } finally {
      setLoading(false);
    }
  };

  // =========================
  // DELETE MEMORY
  // =========================

  const handleDeleteMemory = async (id) => {
    try {
      await deleteMemory(id);

      await loadMemories();
    } catch (error) {
      console.error("Delete memory error:", error);
    }
  };

  // =========================
  // EFFECTS
  // =========================

  useEffect(() => {
    loadMemories();
  }, []);

  // =========================
  // UI
  // =========================

  return (
    <div className="flex h-screen bg-[#1B2748]">
      <Sidebar />

      <div className="flex-1 overflow-y-auto p-8">
        {/* Header */}

        <h1 className="text-3xl font-bold text-white mb-6">Memory</h1>

        {/* Create Memory */}

        <div className="bg-[#24335f] rounded-2xl p-6 mb-8">
          <h2 className="text-white text-xl font-semibold mb-4">Add Memory</h2>

          <textarea
            rows={4}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Example: I am learning React and Node.js"
            className="w-full rounded-xl p-4 outline-none mb-4"
          />

          <button
            onClick={handleCreateMemory}
            disabled={loading}
            className="bg-[#F15B42] hover:bg-[#e14d35] disabled:opacity-50 text-white px-6 py-3 rounded-xl"
          >
            {loading ? "Saving..." : "Save Memory"}
          </button>
        </div>

        {/* Memory List */}

        <div className="grid gap-4">
          {memories.length === 0 ? (
            <div className="bg-[#24335f] rounded-xl p-6 text-white/60">
              No memories found.
            </div>
          ) : (
            memories.map((memory) => (
              <div key={memory.id} className="bg-[#24335f] rounded-xl p-5">
                <p className="text-white mb-4">{memory.content}</p>

                <button
                  onClick={() => handleDeleteMemory(memory.id)}
                  className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg"
                >
                  Delete
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default MemoryPage;
