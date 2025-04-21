const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const mxdatabase = require("../mxconfig/mxdatabase");
const fetch = require("node-fetch");  // Add this to make HTTP requests for URL validation
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

// Forbidden domains to block
const forbiddenDomains = ['xvideos.com', 'xnxx.com', 'pornhub.com']; // Add any domains you want to block

// Function to validate URL
async function validateUrl(url) {
  try {
    // Check if URL is http/https
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      return { valid: false, message: "URL must start with http:// or https://" };
    }

    // Get the domain from the URL
    const { hostname } = new URL(url);

    // Check if the domain is forbidden
    if (forbiddenDomains.some(domain => hostname.includes(domain))) {
      return { valid: false, message: "Forbidden domain detected" };
    }

    // Send a HEAD request to the URL to check if it's reachable
    const response = await fetch(url, { method: "HEAD", mode: "no-cors" });

    if (!response.ok) {
      return { valid: false, message: `URL returned status ${response.status}` };
    }

    return { valid: true };
  } catch (err) {
    return { valid: false, message: "Failed to reach URL" };
  }
}

// PUT /mx/profile - Update profile or picture
router.put("/profile", verifyToken, async (req, res) => {
  try {
    const { userId } = req;
    const { username, phone, location, bio } = req.body;

    // If bio is provided along with other fields (username, phone, etc.)
    if (bio) {
      // Validate links in bio
      const urlRegex = /(https?:\/\/[^\s]+)/gi;
      const urls = bio.match(urlRegex) || [];
      for (const url of urls) {
        const { valid, message } = await validateUrl(url);
        if (!valid) {
          return res.status(400).json({ message: `Invalid URL: ${message}` });
        }
      }

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
