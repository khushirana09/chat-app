import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaUser, FaCheckCircle } from "react-icons/fa";
import "../styles/theme.css";
import "../styles/WelcomeName.css";

function validateName(value) {
  const trimmed = value.trim();
  if (!trimmed) return "Tell us what to call you.";
  if (trimmed.length < 2) return "Must be at least 2 characters.";
  if (trimmed.length > 30) return "Must be 30 characters or fewer.";
  if (!/^[a-zA-Z\s'-]+$/.test(trimmed))
    return "Letters, spaces, hyphens, and apostrophes only.";
  return "";
}

function WelcomeName() {
  const navigate = useNavigate();
  const [name, setName] = useState(() => localStorage.getItem("tempName") || "");
  const [touched, setTouched] = useState(false);

  const error = validateName(name);

  const handleChange = (e) => {
    const value = e.target.value;
    setName(value);
    localStorage.setItem("tempName", value);
  };

  const handleNext = (e) => {
    e.preventDefault();
    setTouched(true);
    if (error) return;

    localStorage.setItem("tempName", name.trim());
    navigate("/select-avatar");
  };

  return (
    <div className="auth-page welcome-page">
      <div className="welcome-shell auth-split">
        <div className="bg-blob" aria-hidden="true"></div>
        <div className="bg-blob" aria-hidden="true"></div>

        <div className="auth-split-info">
          <div className="mascot" aria-hidden="true">
            <div className="mascot-body">
              <span className="mascot-eye"></span>
              <span className="mascot-eye"></span>
            </div>
          </div>
          <span className="brand-eyebrow">Private · Instant · Yours</span>
          <h2>Let's get you set up.</h2>
          <p>Just a couple of quick steps and you'll be chatting in no time.</p>
        </div>

        <div className="welcome-card">
          <div className="welcome-brand">
            <div className="mascot" aria-hidden="true">
              <div className="mascot-body">
                <span className="mascot-eye"></span>
                <span className="mascot-eye"></span>
              </div>
            </div>
            <span className="brand-eyebrow">Private · Instant · Yours</span>
          </div>

          <div className="step-dots">
            <span className="active"></span>
            <span></span>
          </div>

          <span className="welcome-greeting" role="img" aria-label="waving hand">
            👋
          </span>

          <h1>What should we call you?</h1>
          <p className="auth-subtitle">
            This is the name your friends will see in chats.
          </p>

          <form onSubmit={handleNext} noValidate>
            <div className="field-group">
              <label htmlFor="name">Your name</label>
              <div className={`input-wrap ${touched ? (error ? "invalid" : "valid") : ""}`}>
                <FaUser className="input-icon" />
                <input
                  id="name"
                  type="text"
                  placeholder="e.g. Khushi"
                  value={name}
                  onChange={handleChange}
                  onBlur={() => setTouched(true)}
                  autoFocus
                />
                {touched && !error && <FaCheckCircle className="valid-icon" />}
              </div>
              {touched && error && <span className="field-error">{error}</span>}
            </div>

            <button type="submit" className="submit-btn">
              Continue
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default WelcomeName;