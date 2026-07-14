import Sidebar from "../components/Sidebar";
import { Outlet } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { useLocation } from "react-router-dom";

export default function DashboardLayout() {
  const location = useLocation();

  return (
    <div className="flex h-screen w-screen overflow-hidden" style={{ background: "#0F172A" }}>
      {/* Ambient background */}
      <div className="orb orb-orange w-[600px] h-[600px] -top-48 -left-32 fixed pointer-events-none" />
      <div className="orb orb-blue w-[500px] h-[500px] -bottom-48 -right-32 fixed pointer-events-none" />

      {/* Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <AnimatePresence mode="wait">
          <Outlet key={location.pathname} />
        </AnimatePresence>
      </div>
    </div>
  );
}