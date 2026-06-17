import { useEffect, useState } from "react";

import Sidebar from "../components/Sidebar";

import { getSkills, createSkill, deleteSkill } from "../api/skillApi";

function SkillsPage() {
  const [skills, setSkills] = useState([]);

  const [name, setName] = useState("");

  const [description, setDescription] = useState("");

  const [prompt, setPrompt] = useState("");

  const loadSkills = async () => {
    const data = await getSkills();

    setSkills(data);
  };

  const handleCreate = async () => {
    if (!name || !prompt) return;

    await createSkill({
      name,
      description,
      prompt,
    });

    setName("");
    setDescription("");
    setPrompt("");

    loadSkills();
  };

  const handleDelete = async (id) => {
    await deleteSkill(id);

    loadSkills();
  };

  useEffect(() => {
    loadSkills();
  }, []);

  return (
    <div className="flex h-screen bg-[#1B2748]">
      <Sidebar />

      <div className="flex-1 p-8 overflow-y-auto">
        <h1 className="text-3xl text-white font-bold mb-6">Skills</h1>

        <div className="bg-[#24335f] p-6 rounded-xl mb-8">
          <input
            placeholder="Skill Name"
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
            placeholder="System Prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="w-full mb-3 p-3 rounded"
            rows={5}
          />

          <button
            onClick={handleCreate}
            className="bg-[#F15B42] px-5 py-3 rounded-xl text-white"
          >
            Create Skill
          </button>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {skills.map((skill) => (
            <div key={skill.id} className="bg-[#24335f] p-5 rounded-xl">
              <h2 className="text-white text-xl font-bold">{skill.name}</h2>

              <p className="text-white/70 my-2">{skill.description}</p>

              <button
                onClick={() => handleDelete(skill.id)}
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

export default SkillsPage;
