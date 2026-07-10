const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");
const User = require("../models/User");
require("dotenv").config();

const router = express.Router();

const {
  forgotPassword,
  resetPassword,
} = require("../controllers/authController");

// Login: the classic brute-force target — limit attempts per IP, not per
// account, so an attacker can't just spread guesses across many usernames.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many login attempts. Please try again in a few minutes." },
});

// Register: cheap to abuse for mass fake-account creation without a limit.
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many accounts created from this location. Please try again later." },
});

// Forgot-password: without a limit, this becomes a free tool for spamming
// someone's inbox with reset emails.
const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many reset requests. Please try again in a few minutes." },
});

//TEMP TEST ROUTE
router.get("/test", (req, res) => {
  res.send("Auth route working!");
});

router.post("/forgot-password", forgotPasswordLimiter, forgotPassword);
router.post("/reset-password", resetPassword);

// REGISTER
router.post("/register", registerLimiter, async (req, res) => {
  try {
    console.log("Register request body:", req.body); // log incoming data

    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      console.log("User already exists:", existingUser.email);
      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, email, password: hashedPassword });
    await user.save();

    res
      .status(201)
      .json({ message: "User registered", username: user.username });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// LOGIN
router.post("/login", loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "User not found" });

    const ismatch = await bcrypt.compare(password, user.password);
    if (!ismatch)
      return res.status(401).json({ message: "Invalid credentials" });

    const token = jwt.sign(
      { id: user._id, username: user.username },
      process.env.JWT_SECRET,
      {
        expiresIn: "5h",
      }
    );

    res.json({ token, username: user.username });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
