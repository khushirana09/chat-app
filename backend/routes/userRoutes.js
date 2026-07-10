const express = require("express");
const User = require("../models/User");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// GET /api/users/all — list every user except the requester.
// Previously unauthenticated (anyone could hit this with no token) and
// returned everyone's email address. Now requires a valid JWT, derives
// "who's asking" from that verified token instead of a client-supplied
// query param, and only exposes username + profilePicture + lastSeen.
router.get("/all", requireAuth, async (req, res) => {
  try {
    const users = await User.find(
      { username: { $ne: req.user.username } }, // exclude current
      "username profilePicture lastSeen"
    );

    res.status(200).json(users);
  } catch (err) {
    console.error("Error fetching users:", err);
    res.status(500).json({ message: "Failed to fetch users" });
  }
});

// GET /api/users/me — the logged-in user's own profile.
router.get("/me", requireAuth, async (req, res) => {
  try {
    const user = await User.findOne(
      { username: req.user.username },
      "username profilePicture about lastSeen"
    );
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (err) {
    console.error("Error fetching profile:", err);
    res.status(500).json({ message: "Failed to fetch profile" });
  }
});

// PATCH /api/users/me — update your own profile picture (and/or about text).
// Only ever updates the caller's own document — identity comes from the
// verified JWT, never from the request body, so there's no way to edit
// someone else's profile.
router.patch("/me", requireAuth, async (req, res) => {
  try {
    const { profilePicture, about } = req.body;
    const update = {};
    if (typeof profilePicture === "string" && profilePicture.trim()) {
      update.profilePicture = profilePicture.trim();
    }
    if (typeof about === "string") {
      update.about = about.slice(0, 140);
    }
    if (Object.keys(update).length === 0) {
      return res.status(400).json({ message: "Nothing to update" });
    }

    const user = await User.findOneAndUpdate(
      { username: req.user.username },
      update,
      { new: true, fields: "username profilePicture about lastSeen" }
    );
    res.json(user);
  } catch (err) {
    console.error("Error updating profile:", err);
    res.status(500).json({ message: "Failed to update profile" });
  }
});

module.exports = router;

