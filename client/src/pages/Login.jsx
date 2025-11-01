// Login.jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSocket } from "../socket/socket";

const Login = () => {
  const [username, setUsername] = useState("");
  const navigate = useNavigate();
  const { connect } = useSocket(); // useSocket hook handles socket connection

  const handleJoin = (e) => {
    e.preventDefault();
    if (!username.trim()) return;

    console.log(`User ${username} is joining the chat`);
    localStorage.setItem("username", username);
    connect(username); // trigger connection + emit user_join
    navigate("/chat");
  };

  return (
    <div className="flex h-screen items-center justify-center bg-gray-100">
      <form
        onSubmit={handleJoin}
        className="bg-white p-8 rounded-2xl shadow-md w-80 text-center"
      >
        <h2 className="text-xl font-semibold mb-4">Join Chat</h2>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Enter username"
          className="w-full p-2 border rounded mb-4"
        />
        <button
          type="submit"
          className="w-full bg-blue-500 text-white py-2 rounded hover:bg-blue-600"
        >
          Join
        </button>
      </form>
    </div>
  );
};

export default Login;
