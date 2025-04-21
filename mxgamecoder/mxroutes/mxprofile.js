const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const mxdatabase = require("../mxconfig/mxdatabase");
const fetch = require("node-fetch");
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

const forbiddenDomains = ['xvideos.com', 'xnxx.com', 'pornhub.com'];

// Fast URL Validator
async function validateUrl(url) {
  try {
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      return { valid: false, message: "URL must start with http:// or https://" };
    }

    const { hostname } = new URL(url);
    if (forbiddenDomains.some(domain => hostname.includes(domain))) {
      return { valid: false, message: "Forbidden domain detected" };
    }

    // HEAD might be blocked by some servers, so use GET with small timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(url, { method: "GET", signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      return { valid: false, message: `URL returned status ${response.status}` };
    }

    return { valid: true };
  } catch (err) {
    return { valid: false, message: "Failed to reach URL" };
  }
}

router.put("/profile", verifyToken, async (req, res) => {
  const { userId } = req;
  const { username, phone_number, location, bio } = req.body;
  const now = Date.now();

  try {
    const userQuery = `
      SELECT username, phone_number, location, bio, profile_picture, last_username_change 
      FROM users WHERE id = $1
    `;
    const userResult = await mxdatabase.query(userQuery, [userId]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const currentUser = userResult.rows[0];

    // Username validation
    if (username && username !== currentUser.username) {
      const cooldown = 7 * 24 * 60 * 60 * 1000;
      const lastChange = currentUser.last_username_change || 0;

      if (now - lastChange < cooldown) {
        const secondsLeft = Math.ceil((cooldown - (now - lastChange)) / 1000);
        return res.status(400).json({ message: `You can change your username again in ${secondsLeft} seconds.` });
      }

      // Check for duplicates
      const usernameCheckQuery = `
        SELECT 1 FROM users WHERE username = $1
        UNION
        SELECT 1 FROM temp_users WHERE username = $1
      `;
      const usernameCheck = await mxdatabase.query(usernameCheckQuery, [username]);

      if (usernameCheck.rows.length > 0) {
        return res.status(409).json({ message: "Username already in use" });
      }
    } else if (username === currentUser.username) {
      return res.status(400).json({ message: "New username cannot be the same as your current username" });
    }

    // Validate URLs in bio (if any)
    if (bio) {
      const urls = bio.match(/(https?:\/\/[^\s]+)/gi) || [];
      for (const url of urls) {
        const { valid, message } = await validateUrl(url);
        if (!valid) {
          return res.status(400).json({ message: `Invalid URL in bio: ${message}` });
        }
      }
    }

    // Prepare update values
    const finalValues = {
      username: username || currentUser.username,
      phone: phone_number || currentUser.phone_number,
      location: location || currentUser.location,
      bio: bio || currentUser.bio,
      picture: req.file ? req.file.path : currentUser.profile_picture,
    };

    // Perform update
    const updateQuery = `
      UPDATE users
      SET username = $1, phone_number = $2, location = $3, bio = $4, profile_picture = $5, last_username_change = $6
      WHERE id = $7
      RETURNING username, email, phone_number, location, bio, profile_picture;
    `;

    const updateResult = await mxdatabase.query(updateQuery, [
      finalValues.username,
      finalValues.phone,
      finalValues.location,
      finalValues.bio,
      finalValues.picture,
      now,
      userId,
    ]);

    res.status(200).json({
      message: "✅ Profile updated successfully",
      user: updateResult.rows[0],
    });

  } catch (error) {
    console.error("Update error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/last-username-change", verifyToken, async (req, res) => {
  try {
    const { userId } = req;
    const result = await mxdatabase.query(
      `SELECT last_username_change FROM users WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({
      lastChangeTimestamp: result.rows[0].last_username_change || 0,
    });
  } catch (error) {
    console.error("Error getting last username change:", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/profile", verifyToken, async (req, res) => {
  try {
    const { userId } = req;

    const result = await mxdatabase.query(`
      SELECT username, email, phone_number, location, bio, profile_picture, balance
      FROM users WHERE id = $1
    `, [userId]);

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
