const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const mxdatabase = require("../mxconfig/mxdatabase");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
require("dotenv").config();

// Middleware to verify JWT and extract user ID
function verifyToken(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(403).json({ message: "No token provided" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).json({ message: "Invalid token" });
    }

    req.userId = decoded.id;
    next();
  });
}

// Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_API_SECRET,
});

// Setup multer with Cloudinary Storage
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "profile_pictures", // Optional folder name in Cloudinary
    allowedFormats: ["jpg", "jpeg", "png"],
  },
});

const upload = multer({ storage });

// Fetch user profile
router.get("/profile", verifyToken, async (req, res) => {
  try {
    const { userId } = req;

    const query =
      "SELECT username, email, phone_number AS phone, location, bio, profile_picture, balance FROM users WHERE id = $1";
    const result = await mxdatabase.query(query, [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching profile:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Update user profile including profile picture
router.put("/profile", verifyToken, upload.single("profile_picture"), async (req, res) => {
  try {
    const { userId } = req;
    const { username, phone, location, bio } = req.body;

    if (!username || !phone || !location || !bio) {
      return res.status(400).json({ message: "All fields are required" });
    }

    let cloudinaryUrl = "/mxfiles/avatar.png"; // Default avatar
    if (req.file) {
      cloudinaryUrl = req.file.path; // The URL returned by Cloudinary after uploading the file
    }

    const updateQuery = `
      UPDATE users 
      SET username = $1, phone_number = $2, location = $3, bio = $4, profile_picture = $5 
      WHERE id = $6
      RETURNING username, email, phone_number AS phone, location, bio, profile_picture;
    `;

    const result = await mxdatabase.query(updateQuery, [
      username,
      phone,
      location,
      bio,
      cloudinaryUrl, // Cloudinary URL saved in the database
      userId,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({
      message: "Profile updated successfully",
      user: result.rows[0],
    });
  } catch (error) {
    console.error("Error updating profile:", error);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
