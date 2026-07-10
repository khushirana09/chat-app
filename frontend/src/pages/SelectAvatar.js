import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaCamera } from "react-icons/fa";
import "../styles/theme.css";
import "../styles/SelectAvatar.css";

function SelectAvatar() {
  const [avatar, setAvatar] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const savedAvatar = localStorage.getItem("tempAvatar");
    if (savedAvatar) setAvatar(savedAvatar);
  }, []);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result;
      setAvatar(base64);
      localStorage.setItem("tempAvatar", base64);
    };
    reader.readAsDataURL(file);
  };

  const handleNext = () => navigate("/login");
  const handleBack = () => navigate("/welcome");
  const handleSkip = () => {
    localStorage.setItem("tempAvatar", "");
    navigate("/login");
  };

  return (
    <div className="auth-page">
      <div className="avatar-shell">
        <div className="bg-blob" aria-hidden="true"></div>
        <div className="bg-blob" aria-hidden="true"></div>

        <div className="avatar-card">
          <div className="avatar-skip-row">
            <button type="button" onClick={handleSkip}>
              Skip for now
            </button>
          </div>

          <div className="step-dots">
            <span></span>
            <span className="active"></span>
          </div>

          <h1>Pick a profile photo</h1>
          <p className="auth-subtitle">
            Helps your friends recognize you in chats.
          </p>

          {avatar ? (
            <img src={avatar} alt="Your avatar preview" className="avatar-preview" />
          ) : (
            <div className="avatar-placeholder" aria-hidden="true">
              🙂
            </div>
          )}

          <label className="avatar-upload-label">
            <FaCamera style={{ marginRight: 8 }} />
            {avatar ? "Choose a different photo" : "Upload a photo"}
            <input type="file" accept="image/*" onChange={handleFileChange} />
          </label>

          <div className="avatar-actions">
            <button type="button" className="btn-secondary" onClick={handleBack}>
              Back
            </button>
            <button type="button" className="submit-btn" onClick={handleNext}>
              Continue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SelectAvatar;
