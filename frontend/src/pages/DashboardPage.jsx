import DashboardLayout from "../layouts/DashboardLayout";

function DashboardPage() {
  return (
    <DashboardLayout>
      <h1 className="text-4xl font-bold">
        Dashboard
      </h1>

      <p className="mt-4 text-white/70">
        Welcome to ClawOS.
      </p>
    </DashboardLayout>
  );
}

export default DashboardPage;