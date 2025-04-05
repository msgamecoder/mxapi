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

// Route to fetch profile picture
// Route to fetch profile picture
router.get("/mspicture", verifyToken, async (req, res) => {
  try {
    const { userId } = req;

    // Query to get the profile picture filename from the database
    const query = "SELECT profile_picture FROM users WHERE id = $1";
    const result = await mxdatabase.query(query, [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const profilePicturePath = result.rows[0].profile_picture;

    if (!profilePicturePath || profilePicturePath === '/mxfiles/avatar.png') {
      return res.status(404).json({ message: "Profile picture not found" });
    }

    // Extract the file name from the path
    const filename = profilePicturePath.split('/mxfiles/')[1];
    const filePath = path.join(__dirname, '..', '..', 'mxfiles', filename); // Absolute path to mxfiles directory

    // Check if the profile picture exists in the "mxfiles" folder
    if (fs.existsSync(filePath)) {
      return res.sendFile(filePath); // Send the file as a response
    } else {
      return res.status(404).json({ message: "Profile picture not found on the server" });
    }
  } catch (error) {
    console.error("Error fetching profile picture:", error);
    res.status(500).json({ message: "Server error" });
  }
});



module.exports = router;
