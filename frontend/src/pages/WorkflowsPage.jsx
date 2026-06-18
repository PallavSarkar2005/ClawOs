import { useEffect, useState } from "react";

import Sidebar from "../components/Sidebar";

import {
  getWorkflows,
  createWorkflow,
  deleteWorkflow,
} from "../api/workflowApi";

function WorkflowsPage() {
  const [workflows, setWorkflows] = useState([]);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [prompt, setPrompt] = useState("");

  const loadWorkflows = async () => {
    try {
      const data = await getWorkflows();

      setWorkflows(data);
    } catch (error) {
      console.error(error);
    }
  };

  const handleCreate = async () => {
    if (!name || !prompt) return;

    try {
      await createWorkflow({
        name,
        description,
        prompt,
      });

      setName("");
      setDescription("");
      setPrompt("");

      loadWorkflows();
    } catch (error) {
      console.error(error);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteWorkflow(id);

      loadWorkflows();
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    loadWorkflows();
  }, []);

  return (
    <div className="flex h-screen bg-[#1B2748]">
      <Sidebar />

      <div className="flex-1 p-8 overflow-y-auto">
        <h1 className="text-3xl text-white font-bold mb-6">Workflows</h1>

        {/* CREATE WORKFLOW */}

        <div className="bg-[#24335f] p-6 rounded-xl mb-8">
          <input
            placeholder="Workflow Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full mb-3 p-3 rounded"
          />

          <input
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full mb-3 p-3 rounded"
          />

          <textarea
            placeholder="Workflow Prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={6}
            className="w-full mb-3 p-3 rounded"
          />

          <button
            onClick={handleCreate}
            className="bg-[#F15B42] text-white px-5 py-3 rounded-xl"
          >
            Create Workflow
          </button>
        </div>

        {/* WORKFLOW LIST */}

        <div className="grid md:grid-cols-2 gap-4">
          {workflows.map((workflow) => (
            <div key={workflow.id} className="bg-[#24335f] p-5 rounded-xl">
              <h2 className="text-white text-xl font-bold">{workflow.name}</h2>

              <p className="text-white/70 my-2">{workflow.description}</p>

              <button
                onClick={() => handleDelete(workflow.id)}
                className="bg-red-500 px-4 py-2 rounded text-white"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default WorkflowsPage;
