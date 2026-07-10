import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { FaLock, FaEye, FaEyeSlash } from "react-icons/fa";
import { API_BASE_URL } from "../config";
import "../styles/theme.css";
import "../styles/SimpleAuth.css";

const tips = [
  "💧 Drink some water!",
  "🌿 Take a deep breath.",
  "💪 You're doing great!",
  "🌞 Get some sunlight!",
  "🧠 Rest your eyes.",
  "😄 Smile a little!",
];

const ResetPassword = () => {
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [tipIndex, setTipIndex] = useState(0);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromURL = urlParams.get("token");

    if (!tokenFromURL) {
      setError("Invalid or missing reset link.");
      return;
    }
    setToken(tokenFromURL);
  }, []);

  useEffect(() => {
    if (!loading || success || error) return;
    setTipIndex(0);
    const interval = setInterval(() => {
      setTipIndex((prev) => (prev + 1) % tips.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [loading, success, error]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });

      const data = await res.json();

      if (res.ok) {
        setLoading(false);
        setSuccess(true);
        setMessage(data.message);
        setTimeout(() => navigate("/login"), 3000);
      } else {
        setLoading(false);
        setError(data.message || "Invalid or expired reset link.");
      }
    } catch (err) {
      setLoading(false);
      setError("Something went wrong. Please try again later.");
    }
  };

  return (
    <div className="auth-page">
      <div className="simple-auth-shell">
        <div className="bg-blob" aria-hidden="true"></div>
        <div className="bg-blob" aria-hidden="true"></div>

        <div className="simple-auth-card">
          <div className="mascot" aria-hidden="true">
            <div className="mascot-body">
              <span className="mascot-eye"></span>
              <span className="mascot-eye"></span>
            </div>
          </div>

          <h1>Set a new password</h1>
          <p className="auth-subtitle">Almost there — pick something memorable.</p>

          <form onSubmit={handleSubmit} noValidate>
            <div className="field-group">
              <label htmlFor="password">New password</label>
              <div className="input-wrap">
                <FaLock className="input-icon" />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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

            <button type="submit" className="submit-btn" disabled={loading || !token}>
              {loading ? <span className="btn-spinner" /> : "Reset password"}
            </button>
          </form>

          <p className="auth-switch">
            <Link to="/login">Back to login</Link>
          </p>
        </div>
      </div>

      {loading && !success && !error && (
        <div className="loader-overlay">
          <div className="loader-box">
            <div className="spinner"></div>
            <div className="loader-message fade-in">{tips[tipIndex]}</div>
          </div>
        </div>
      )}

      {message && !error && (
        <div className="loader-overlay">
          <div className="loader-box">
            <div className="loader-message">✅ {message}</div>
          </div>
        </div>
      )}

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

export default ResetPassword;
