import { Link } from "react-router-dom";

function Navbar() {
  return (
    <nav className="bg-[#2C3D73] border-b border-[#7CAADC]/20">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">
          ClawOS 🚀
        </h1>

        <div className="flex items-center gap-4">
          <Link
            to="/login"
            className="text-white hover:text-[#FFD372] transition"
          >
            Login
          </Link>

          <Link
            to="/signup"
            className="bg-[#F15B42] hover:bg-[#e44c33] px-5 py-2 rounded-xl text-white font-semibold transition"
          >
            Get Started
          </Link>
        </div>
      </div>
    </nav>
  );
}

export default Navbar;