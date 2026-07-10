import React, { useState } from "react";
import { Link } from "react-router-dom";
import { FaEnvelope } from "react-icons/fa";
import axios from "axios";
import { API_BASE_URL } from "../config";
import "../styles/theme.css";
import "../styles/SimpleAuth.css";

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    setError("");

    try {
      const res = await axios.post(`${API_BASE_URL}/api/auth/forgot-password`, {
        email,
      });
      setMessage(res.data.message);
    } catch (err) {
      setError(
        err.response?.data?.message || "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
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

          <h1>Forgot your password?</h1>
          <p className="auth-subtitle">
            No worries — we'll email you a reset link.
          </p>

          <form onSubmit={handleSubmit} noValidate>
            <div className="field-group">
              <label htmlFor="email">Email</label>
              <div className="input-wrap">
                <FaEnvelope className="input-icon" />
                <input
                  id="email"
                  type="email"
                  placeholder="Your registered email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <button type="submit" className="submit-btn" disabled={loading}>
              {loading ? <span className="btn-spinner" /> : "Send reset link"}
            </button>
          </form>

          <p className="auth-switch">
            <Link to="/login">Back to login</Link>
          </p>
        </div>
      </div>

      {message && !error && (
        <div className="loader-overlay" onClick={() => setMessage("")}>
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

export default ForgotPassword;
