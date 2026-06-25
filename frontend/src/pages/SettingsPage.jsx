import { useEffect, useState } from "react";

import Sidebar from "../components/Sidebar";

import { getSettings, updateSettings } from "../api/settingsApi";

function SettingsPage() {
  const [settings, setSettings] = useState({
    defaultProvider: "openrouter",
    autoMemorySave: true,
    autoSkillRouting: true,
    webSearchDefault: false,
    temperature: 0.7,
    maxContext: 20,
  });

  const [saving, setSaving] = useState(false);

  // ======================================
  // LOAD SETTINGS
  // ======================================

  async function loadSettings() {
    try {
      const data = await getSettings();

      setSettings(data);
    } catch (error) {
      console.error(error);
    }
  }

  // ======================================
  // SAVE SETTINGS
  // ======================================

  async function handleSave() {
    try {
      setSaving(true);

      await updateSettings(settings);

      alert("Settings Saved!");
    } catch (error) {
      console.error(error);

      alert("Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    loadSettings();
  }, []);

  return (
    <div className="flex h-screen bg-[#1B2748]">
      <Sidebar />

      <div className="flex-1 p-8 overflow-y-auto">
        <h1 className="text-4xl font-bold text-white mb-8">Settings</h1>

        <div className="bg-[#24335f] rounded-2xl p-8 space-y-8">
          {/* Provider */}

          <div>
            <label className="text-white font-semibold block mb-2">
              Default AI Provider
            </label>

            <select
              value={settings.defaultProvider}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  defaultProvider: e.target.value,
                })
              }
              className="bg-[#1B2748] text-white rounded-xl p-3 w-full"
            >
              <option value="openrouter">OpenRouter</option>

              <option value="groq">Groq</option>

              <option value="ollama">Ollama</option>
            </select>
          </div>

          {/* Auto Memory */}

          <div className="flex justify-between items-center">
            <span className="text-white">Auto Memory Save</span>

            <input
              type="checkbox"
              checked={settings.autoMemorySave}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  autoMemorySave: e.target.checked,
                })
              }
            />
          </div>

          {/* Skill */}

          <div className="flex justify-between items-center">
            <span className="text-white">Auto Skill Routing</span>

            <input
              type="checkbox"
              checked={settings.autoSkillRouting}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  autoSkillRouting: e.target.checked,
                })
              }
            />
          </div>

          {/* Search */}

          <div className="flex justify-between items-center">
            <span className="text-white">Enable Web Search by Default</span>

            <input
              type="checkbox"
              checked={settings.webSearchDefault}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  webSearchDefault: e.target.checked,
                })
              }
            />
          </div>

          {/* Temperature */}

          <div>
            <label className="text-white block mb-2">
              Temperature : {settings.temperature}
            </label>

            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={settings.temperature}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  temperature: Number(e.target.value),
                })
              }
              className="w-full"
            />
          </div>

          {/* Context */}

          <div>
            <label className="text-white block mb-2">
              Max Context Messages
            </label>

            <input
              type="number"
              value={settings.maxContext}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  maxContext: Number(e.target.value),
                })
              }
              className="bg-[#1B2748] text-white rounded-xl p-3 w-full"
            />
          </div>

          {/* Save */}

          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-[#F15B42] hover:bg-[#e14d35] px-8 py-3 rounded-xl text-white font-semibold"
          >
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default SettingsPage;
