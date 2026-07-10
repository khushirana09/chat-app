import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { FaEnvelope, FaLock, FaEye, FaEyeSlash } from "react-icons/fa";
import { useAuth } from "../context/AuthContext";
import { API_BASE_URL } from "../config";
import "../styles/theme.css";
import "../styles/Login.css";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [greetName, setGreetName] = useState("");
  const [avatar, setAvatar] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const navigate = useNavigate();
  const { login } = useAuth();

  useEffect(() => {
    const name = localStorage.getItem("tempName") || "";
    const profile = localStorage.getItem("tempAvatar") || "";
    setGreetName(name);
    setAvatar(profile);
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (response.ok) {
        login({
          token: data.token,
          username: data.username,
          avatar: avatar || "",
        });
        navigate("/chat");
      } else {
        setLoading(false);
        setError(data.message || "Login failed");
      }
    } catch (err) {
      setLoading(false);
      setError("Couldn't reach the server. Please try again.");
      console.error("Login request failed:", err);
    }
  };

  return (
    <div className="auth-page">
      <div className="login-shell">
        <div className="bg-blob" aria-hidden="true"></div>
        <div className="bg-blob" aria-hidden="true"></div>

        <div className="login-card">
          {avatar ? (
            <img src={avatar} alt="Your avatar" className="login-avatar" />
          ) : (
            <div className="mascot" aria-hidden="true">
              <div className="mascot-body">
                <span className="mascot-eye"></span>
                <span className="mascot-eye"></span>
              </div>
            </div>
          )}

          <h1>{greetName ? `Welcome back, ${greetName}!` : "Welcome back!"}</h1>
          <p className="auth-subtitle">Log in to jump back into the conversation.</p>

          <form onSubmit={handleLogin} noValidate>
            <div className="field-group">
              <label htmlFor="email">Email</label>
              <div className="input-wrap">
                <FaEnvelope className="input-icon" />
                <input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            <div className="field-group">
              <label htmlFor="password">Password</label>
              <div className="input-wrap">
                <FaLock className="input-icon" />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="toggle-visibility"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <FaEyeSlash /> : <FaEye />}
                </button>
              </div>
            </div>

            <button type="submit" className="submit-btn" disabled={loading}>
              {loading ? <span className="btn-spinner" /> : "Log in"}
            </button>
          </form>

          <p className="auth-switch">
            <Link to="/forgot-password">Forgot password?</Link>
          </p>
          <p className="auth-switch">
            No account? <Link to="/register">Sign up</Link>
          </p>
        </div>
      </div>

      {error && (
        <div className="loader-overlay" onClick={() => setError("")}>
          <div className="loader-box">
            <div className="loader-message" style={{ color: "#ff5768" }}>
              {error}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Login;
