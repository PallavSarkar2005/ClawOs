import { BrowserRouter, Routes, Route } from "react-router-dom";
import SkillsPage from "../pages/SkillsPage";
import LandingPage from "../pages/LandingPage";
import LoginPage from "../pages/LoginPage";
import SignupPage from "../pages/SignupPage";
import DashboardPage from "../pages/DashboardPage";
import ChatPage from "../pages/ChatPage";
import MemoryPage from "../pages/MemoryPage";
import WorkflowsPage from "../pages/WorkflowsPage";
import SettingsPage from "../pages/SettingsPage";
import ProtectedRoute from "./ProtectedRoute";

function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />

        <Route path="/login" element={<LoginPage />} />

        <Route path="/signup" element={<SignupPage />} />

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />

        <Route path="/chat" element={<ChatPage />} />

        <Route path="/skills" element={<SkillsPage />} />

        <Route path="/memory" element={<MemoryPage />} />

        <Route path="/workflows" element={<WorkflowsPage />} />

        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default AppRoutes;
