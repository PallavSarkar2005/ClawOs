import { Link } from "react-router-dom";

function SignupPage() {
  return (
    <div className="min-h-screen bg-[#2C3D73] flex items-center justify-center px-6">
      <div className="w-full max-w-md bg-white rounded-3xl p-8 shadow-2xl">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-[#2C3D73]">Create Account</h1>

          <p className="text-gray-500 mt-2">Join ClawOS today</p>
        </div>

        <form className="space-y-5">
          <input
            type="text"
            placeholder="Full Name"
            className="w-full px-4 py-3 border border-gray-300 rounded-xl"
          />

          <input
            type="email"
            placeholder="Email"
            className="w-full px-4 py-3 border border-gray-300 rounded-xl"
          />

          <input
            type="password"
            placeholder="Password"
            className="w-full px-4 py-3 border border-gray-300 rounded-xl"
          />

          <button
            type="submit"
            className="w-full bg-[#F15B42] hover:bg-[#e24f37] text-white py-3 rounded-xl font-semibold transition"
          >
            Create Account
          </button>
        </form>

        <div className="my-6 flex items-center">
          <div className="flex-1 h-px bg-gray-300"></div>
          <span className="px-4 text-gray-500 text-sm">OR</span>
          <div className="flex-1 h-px bg-gray-300"></div>
        </div>

        <button className="w-full border border-gray-300 py-3 rounded-xl font-medium hover:bg-gray-50 transition">
          Continue with GitHub
        </button>

        <p className="text-center mt-6 text-gray-600">
          Already have an account?{" "}
          <Link to="/login" className="text-[#F15B42] font-semibold">
            Login
          </Link>
        </p>
      </div>
    </div>
  );
}

export default SignupPage;
