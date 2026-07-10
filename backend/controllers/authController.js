// backend/controllers/authController.js
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const dotenv = require("dotenv");
const User = require("../models/User");
const bcrypt = require("bcryptjs");

dotenv.config(); // make sure this is at the top of your app

// Forgot Password
const forgotPassword = async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });

    const resetToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "15m",
    });

    user.resetToken = resetToken;
    user.resetTokenExpiry = Date.now() + 15 * 60 * 1000;
    await user.save();

    const CLIENT_URL =
      process.env.NODE_ENV === "production"
        ? process.env.CLIENT_URL_PROD
        : process.env.CLIENT_URL_LOCAL;

    if (!CLIENT_URL) {
      console.error(
        "CLIENT_URL is undefined. Check .env or environment settings."
      );
    }

    console.log("NODE_ENV:", process.env.NODE_ENV);
    console.log("CLIENT_URL_PROD:", process.env.CLIENT_URL_PROD);
    console.log("CLIENT_URL_LOCAL:", process.env.CLIENT_URL_LOCAL);
    console.log("CLIENT_URL resolved to:", CLIENT_URL);

    const resetUrl = `${CLIENT_URL}/reset-password?token=${resetToken}`;
    console.log("Reset URL:", resetUrl);


    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: "Password Reset",
      html: `<p>Click <a href="${resetUrl}">here</a> to reset your password. This link is valid for 15 minutes.</p>`,
    });

    res.status(200).json({ message: "Reset link sent to email" });
  } catch (err) {
    console.error("Forgot Password Error:", err);
    res.status(500).json({ error: err.message });
  }
};

// Reset Password
const resetPassword = async (req, res) => {
  const { token, newPassword } = req.body;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (
      !user ||
      user.resetToken !== token ||
      Date.now() > user.resetTokenExpiry
    ) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    user.resetToken = null;
    user.resetTokenExpiry = null;
    await user.save();

    res.status(200).json({ message: "Password reset successful" });
  } catch (err) {
    console.error("Reset Password Error:", err);
    res.status(500).json({ error: "Invalid or expired token" });
  }
};

module.exports = {
  forgotPassword,
  resetPassword,
};
