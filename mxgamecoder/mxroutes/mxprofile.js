const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const mxdatabase = require("../mxconfig/mxdatabase");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
require("dotenv").config();

// JWT Middleware
function verifyToken(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(403).json({ message: "No token provided" });

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ message: "Invalid token" });
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

// Multer + Cloudinary
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "profile_pictures",
    allowed_formats: ["jpg", "jpeg", "png"],
  },
});
const upload = multer({ storage });

// PUT /mx/profile - Update profile or picture
router.put("/profile", verifyToken, async (req, res) => {
  try {
    const { userId } = req;
    const { username, phone, location, bio } = req.body;

    // If bio is provided along with other fields (username, phone, etc.)
    if (bio) {
      const updateQuery = `
        UPDATE users
        SET bio = $1
        WHERE id = $2
        RETURNING username, email, phone_number AS phone, location, bio, profile_picture;
      `;

      const result = await mxdatabase.query(updateQuery, [bio, userId]);

      return res.status(200).json({
        message: "✅ Bio updated successfully",
        user: result.rows[0],
      });
    }

    // If any required field (username, phone, location) is missing
    if (!username || !phone || !location || !bio) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Continue updating other fields like username, phone, etc.
    let cloudinaryUrl = req.file ? req.file.path : "/mxfiles/avatar.png";

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
      cloudinaryUrl,
      userId,
    ]);

    res.status(200).json({
      message: "✅ Profile updated",
      user: result.rows[0],
    });
  } catch (error) {
    console.error("Update error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// GET user profile data
router.get("/profile", verifyToken, async (req, res) => {
  try {
    const { userId } = req;

    const query = `
      SELECT username, email, phone_number AS phone, location, bio, profile_picture, balance
      FROM users
      WHERE id = $1
    `;

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

module.exports = router;
