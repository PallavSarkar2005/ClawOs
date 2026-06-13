import Sidebar from "../components/Sidebar";

function DashboardLayout({ children }) {
  return (
    <div className="flex bg-[#2C3D73] min-h-screen">
      <Sidebar />

      <main className="flex-1 p-8 text-white">
        {children}
      </main>
    </div>
  );
}

export default DashboardLayout;