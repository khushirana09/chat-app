const express = require("express");
const multer = require("multer");
const { v2: cloudinary } = require("cloudinary");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
require("dotenv").config();

const router = express.Router();

// 🔧 Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// 📦 Setup Cloudinary Storage
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "chatapp_uploads", // cloud folder name
    allowed_formats: ["jpg", "jpeg", "png", "webp", "gif", "mp4"],
  },
});

const upload = multer({ storage });

// 📤 Upload Endpoint
router.post("/", upload.single("file"), (req, res) => {
  if (!req.file || !req.file.path) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  res.json({
    message: "File uploaded successfully",
    fileUrl: req.file.path, // this is the cloudinary URL
    public_id: req.file.filename, // if you want to delete later
  });
});

module.exports = router;
