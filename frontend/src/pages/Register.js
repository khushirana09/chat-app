import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  FaUser,
  FaEnvelope,
  FaLock,
  FaEye,
  FaEyeSlash,
  FaCheckCircle,
  FaComments,
} from "react-icons/fa";
import { API_BASE_URL } from "../config";
import "../styles/Register.css";

const waitingMessages = [
  "Setting up your account…",
  "Almost there…",
  "Getting things ready…",
];

// ---- Validation helpers -------------------------------------------------
// Kept outside the component so they're pure functions: same input always
// gives the same output, easy to test, and not recreated on every render.

function validateUsername(value) {
  if (!value) return "Username is required.";
  if (value.length < 3) return "Must be at least 3 characters.";
  if (value.length > 20) return "Must be 20 characters or fewer.";
  if (!/^[a-zA-Z0-9_]+$/.test(value))
    return "Only letters, numbers, and underscores.";
  return "";
}

function validateEmail(value) {
  if (!value) return "Email is required.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
    return "Enter a valid email address.";
  return "";
}

function validatePassword(value) {
  if (!value) return "Password is required.";
  if (value.length < 6) return "Must be at least 6 characters.";
  return "";
}

// Simple 0-4 strength score based on length + character variety.
// Not a substitute for backend enforcement — just user guidance.
function getPasswordStrength(value) {
  if (!value) return { score: 0, label: "" };

  let score = 0;
  if (value.length >= 8) score++;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score++;
  if (/\d/.test(value)) score++;
  if (/[^a-zA-Z0-9]/.test(value)) score++;

  const labels = ["weak", "weak", "fair", "good", "strong"];
  const displayLabels = ["Weak", "Weak", "Fair", "Good", "Strong"];
  return { score, label: displayLabels[score], className: labels[score] };
}

const Register = () => {
  const [form, setForm] = useState({ username: "", email: "", password: "" });
  const [touched, setTouched] = useState({});
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [serverError, setServerError] = useState("");
  const [waitingMsg, setWaitingMsg] = useState(waitingMessages[0]);

  const navigate = useNavigate();

  // Cycle a friendly message while the request is in flight.
  useEffect(() => {
    if (!loading) return;
    let i = 0;
    const interval = setInterval(() => {
      i = (i + 1) % waitingMessages.length;
      setWaitingMsg(waitingMessages[i]);
    }, 1800);
    return () => clearInterval(interval);
  }, [loading]);

  const errors = useMemo(
    () => ({
      username: validateUsername(form.username),
      email: validateEmail(form.email),
      password: validatePassword(form.password),
    }),
    [form]
  );

  const isFormValid = !errors.username && !errors.email && !errors.password;
  const strength = getPasswordStrength(form.password);

  const handleChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleBlur = (field) => () => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const fieldState = (field) => {
    if (!touched[field]) return "";
    return errors[field] ? "invalid" : "valid";
  };

  const handleRegister = async (e) => {
    e.preventDefault();

    // Mark everything touched so any remaining errors surface on submit,
    // even if the user never blurred a field (e.g. pasted + hit enter).
    setTouched({ username: true, email: true, password: true });
    if (!isFormValid) return;

    setLoading(true);
    setServerError("");
    setSuccess(false);

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await response.json();

      if (response.ok) {
        setLoading(false);
        setSuccess(true);
        setTimeout(() => navigate("/login"), 2200);
      } else {
        setLoading(false);
        setServerError(data.message || "Registration failed.");
      }
    } catch (err) {
      setLoading(false);
      setServerError("Couldn't reach the server. Please try again.");
      console.error("Error during registration:", err);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-shell">
        <div className="bg-blob" aria-hidden="true"></div>
        <div className="bg-blob" aria-hidden="true"></div>

        {/* ---------------- Brand panel ---------------- */}
        <aside className="auth-brand">
          <div className="auth-brand-top">
            <div className="brand-mark">
              <FaComments />
            </div>
            <span className="brand-eyebrow">Private · Instant · Yours</span>
          </div>

          <div className="auth-conversation" aria-hidden="true">
            <div className="bubble bubble-in b1">Hey! Did you see the redesign?</div>
            <div className="bubble bubble-out b2">Yeah, it feels so much faster 🔥</div>
            <div className="bubble bubble-in b3">Signing up takes like 10 seconds now</div>
            <div className="bubble bubble-typing b4">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>

          <div className="auth-brand-bottom">
            <h2>Conversations that feel instant.</h2>
            <p>Real-time delivery, a clean inbox, and nothing standing between you and the people you talk to.</p>
          </div>
        </aside>

        {/* ---------------- Form panel ---------------- */}
        <main className="auth-form-panel">
          <div className="auth-form-card">
            <h1>Create your account</h1>
            <p className="auth-subtitle">Join in — it takes less than a minute.</p>

            <form onSubmit={handleRegister} noValidate>
              <div className="field-group">
                <label htmlFor="username">Username</label>
                <div className={`input-wrap ${fieldState("username")}`}>
                  <FaUser className="input-icon" />
                  <input
                    id="username"
                    type="text"
                    placeholder="e.g. khushi_dev"
                    value={form.username}
                    onChange={handleChange("username")}
                    onBlur={handleBlur("username")}
                    autoComplete="username"
                  />
                  {fieldState("username") === "valid" && (
                    <FaCheckCircle className="valid-icon" />
                  )}
                </div>
                {touched.username && errors.username && (
                  <span className="field-error">{errors.username}</span>
                )}
              </div>

              <div className="field-group">
                <label htmlFor="email">Email</label>
                <div className={`input-wrap ${fieldState("email")}`}>
                  <FaEnvelope className="input-icon" />
                  <input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={form.email}
                    onChange={handleChange("email")}
                    onBlur={handleBlur("email")}
                    autoComplete="email"
                  />
                  {fieldState("email") === "valid" && (
                    <FaCheckCircle className="valid-icon" />
                  )}
                </div>
                {touched.email && errors.email && (
                  <span className="field-error">{errors.email}</span>
                )}
              </div>

              <div className="field-group">
                <label htmlFor="password">Password</label>
                <div className={`input-wrap ${fieldState("password")}`}>
                  <FaLock className="input-icon" />
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="At least 6 characters"
                    value={form.password}
                    onChange={handleChange("password")}
                    onBlur={handleBlur("password")}
                    autoComplete="new-password"
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

                {form.password && (
                  <div className="strength-meter">
                    <div className="strength-bars">
                      {[0, 1, 2, 3].map((i) => (
                        <span
                          key={i}
                          className={
                            i < strength.score ? `filled s-${strength.className}` : ""
                          }
                        />
                      ))}
                    </div>
                    <span className="strength-label">{strength.label}</span>
                  </div>
                )}

                {touched.password && errors.password && (
                  <span className="field-error">{errors.password}</span>
                )}
              </div>

              <button type="submit" className="submit-btn" disabled={loading}>
                {loading ? (
                  <>
                    <span className="btn-spinner" />
                    <span className="btn-loading-text">{waitingMsg}</span>
                  </>
                ) : (
                  "Create account"
                )}
              </button>
            </form>

            <p className="auth-switch">
              Already have an account? <Link to="/login">Log in</Link>
            </p>
            <p className="auth-terms">
              By creating an account, you agree to our Terms and Privacy Policy.
            </p>
          </div>
        </main>
      </div>

      {/* Full-screen states reserved for moments worth interrupting the user for */}
      {success && (
        <div className="loader-overlay">
          <div className="loader-box">
            <div className="loader-message">🎉 Account created — taking you to login…</div>
          </div>
        </div>
      )}

      {serverError && (
        <div className="loader-overlay" onClick={() => setServerError("")}>
          <div className="loader-box">
            <div className="loader-message" style={{ color: "#ff6b6b" }}>
              {serverError}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Register;
