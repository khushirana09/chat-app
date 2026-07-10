const express = require("express");
const Group = require("../models/Group");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// POST /api/groups — create a group. The creator is always added as a
// member automatically, even if they forgot to include themselves.
router.post("/", requireAuth, async (req, res) => {
  try {
    const { name, members } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Group name is required" });
    }
    if (!Array.isArray(members) || members.length === 0) {
      return res.status(400).json({ message: "Select at least one member" });
    }

    const uniqueMembers = Array.from(new Set([...members, req.user.username]));

    const group = await Group.create({
      name: name.trim(),
      members: uniqueMembers,
      createdBy: req.user.username,
    });

    res.status(201).json(group);
  } catch (err) {
    console.error("Error creating group:", err);
    res.status(500).json({ message: "Failed to create group" });
  }
});

// GET /api/groups/mine — only groups the requesting user actually belongs to.
router.get("/mine", requireAuth, async (req, res) => {
  try {
    const groups = await Group.find({ members: req.user.username }).sort({
      createdAt: -1,
    });
    res.json(groups);
  } catch (err) {
    console.error("Error fetching groups:", err);
    res.status(500).json({ message: "Failed to fetch groups" });
  }
});

module.exports = router;
