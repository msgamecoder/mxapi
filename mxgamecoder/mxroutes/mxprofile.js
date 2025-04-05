const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const mxdatabase = require("../mxconfig/mxdatabase");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

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

// Ensure the "mxfiles" folder exists or create it
const uploadDir = "./mxfiles";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// Setup multer for profile picture upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir); // Folder to store images
  },
  filename: (req, file, cb) => {
    cb(null, `${req.userId}-${Date.now()}${path.extname(file.originalname)}`);
  },
});

const upload = multer({ storage });

// Fetch user profile
router.get("/profile", verifyToken, async (req, res) => {
  try {
    const { userId } = req;

    const query =
      "SELECT username, email, phone_number AS phone, location, bio, profile_picture FROM users WHERE id = $1";
    const result = await mxdatabase.query(query, [userId]);

    if (result.rows.length === 0) {
      console.log(`User not found: ${userId}`);  // Log if user is not found
      return res.status(404).json({ message: "User not found" });
    }

    const userProfile = result.rows[0];
    console.log("User profile fetched:", userProfile);  // Log the fetched profile data

    res.status(200).json(userProfile);
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

    // Log the incoming data for debugging
    console.log("Incoming request data:", { username, phone, location, bio });
    console.log("Uploaded profile picture:", req.file ? req.file.filename : "No file");

    const profile_picture = req.file ? `/mxfiles/${req.file.filename}` : null;

    if (!username || !phone || !location || !bio) {
      return res.status(400).json({ message: "All fields are required" });
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
      profile_picture || '/mxfiles/avatar.png', // Default avatar if no new picture
      userId,
    ]);

    if (result.rows.length === 0) {
      console.log(`User not found during update: ${userId}`);  // Log if user is not found during update
      return res.status(404).json({ message: "User not found" });
    }

    const updatedUser = result.rows[0];
    console.log("Profile updated:", updatedUser);  // Log the updated user data

    res.status(200).json({
      message: "Profile updated successfully",
      user: updatedUser,
    });
  } catch (error) {
    console.error("Error updating profile:", error);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
