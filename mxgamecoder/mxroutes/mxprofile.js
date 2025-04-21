const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const mxdatabase = require("../mxconfig/mxdatabase");
const fetch = require("node-fetch");
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

// Multer Cloudinary Storage
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "profile_pictures",
    allowedFormats: ["jpg", "jpeg", "png"],
  },
});
const upload = multer({ storage });

const forbiddenDomains = ['xvideos.com', 'xnxx.com', 'pornhub.com'];

async function validateUrl(url) {
  try {
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      return { valid: false, message: "URL must start with http:// or https://" };
    }

    const { hostname } = new URL(url);
    if (forbiddenDomains.some(domain => hostname.includes(domain))) {
      return { valid: false, message: "Forbidden domain detected" };
    }

    const response = await fetch(url, { method: "HEAD", mode: "no-cors" });
    if (!response.ok) {
      return { valid: false, message: `URL returned status ${response.status}` };
    }

    return { valid: true };
  } catch (err) {
    return { valid: false, message: "Failed to reach URL" };
  }
}

// PUT /profile with image upload
router.put("/profile", verifyToken, upload.single("profile_picture"), async (req, res) => {
  try {
    const { userId } = req;
    const { username, phone_number, location, bio } = req.body;
    const now = Date.now();

    const userQuery = `SELECT username, phone_number, location, bio, profile_picture, last_username_change FROM users WHERE id = $1`;
    const userResult = await mxdatabase.query(userQuery, [userId]);
    const currentUser = userResult.rows[0];

    if (!currentUser) {
      return res.status(404).json({ message: "User not found" });
    }

    if (username && username !== currentUser.username) {
      const cooldownTime = 7 * 24 * 60 * 60 * 1000;
      if (currentUser.last_username_change && now - currentUser.last_username_change < cooldownTime) {
        const secondsLeft = Math.ceil((cooldownTime - (now - currentUser.last_username_change)) / 1000);
        return res.status(400).json({ message: `You can change your username again in ${secondsLeft} seconds.` });
      }

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

    if (bio) {
      const urlRegex = /(https?:\/\/[^\s]+)/gi;
      const urls = bio.match(urlRegex) || [];
      for (const url of urls) {
        const { valid, message } = await validateUrl(url);
        if (!valid) {
          return res.status(400).json({ message: `Invalid URL in bio: ${message}` });
        }
      }
    }

    const finalUsername = username || currentUser.username;
    const finalPhone = phone_number || currentUser.phone_number;
    const finalLocation = location || currentUser.location;
    const finalBio = bio || currentUser.bio;
    const finalPicture = req.file ? req.file.path : currentUser.profile_picture || "/mxfiles/avatar.png";

    const updateQuery = `
      UPDATE users
      SET username = $1, phone_number = $2, location = $3, bio = $4, profile_picture = $5, last_username_change = $6
      WHERE id = $7
      RETURNING username, email, phone_number, location, bio, profile_picture;
    `;

    const updateResult = await mxdatabase.query(updateQuery, [
      finalUsername,
      finalPhone,
      finalLocation,
      finalBio,
      finalPicture,
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

// Get last username change timestamp
router.get("/last-username-change", verifyToken, async (req, res) => {
  try {
    const { userId } = req;

    const query = `SELECT last_username_change FROM users WHERE id = $1`;
    const result = await mxdatabase.query(query, [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const lastChangeTimestamp = result.rows[0].last_username_change || 0;

    res.status(200).json({ lastChangeTimestamp });
  } catch (error) {
    console.error("Error getting last username change:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Get profile
router.get("/profile", verifyToken, async (req, res) => {
  try {
    const { userId } = req;

    const query = `
      SELECT username, email, phone_number, location, bio, profile_picture, balance
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

// PUT /change-name
// PUT /change-name
router.put("/change-name", verifyToken, async (req, res) => {
  try {
    const { userId } = req;
    const { name } = req.body;
    const now = Date.now();

    if (!name) {
      return res.status(400).json({ message: "Name is required" });
    }

    const userQuery = `SELECT full_name, last_name_change FROM users WHERE id = $1`;
    const result = await mxdatabase.query(userQuery, [userId]);
    const user = result.rows[0];

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (name === user.full_name) {
      return res.status(400).json({ message: "New name is the same as current one" });
    }

    const cooldownTime = 14 * 24 * 60 * 60 * 1000; // 14 days
    if (user.last_name_change && now - user.last_name_change < cooldownTime) {
      const secondsLeft = Math.ceil((cooldownTime - (now - user.last_name_change)) / 1000);
      return res.status(400).json({ message: `Wait ${secondsLeft}s before changing your name again.` });
    }

    const updateQuery = `
      UPDATE users
      SET full_name = $1, last_name_change = $2
      WHERE id = $3
      RETURNING full_name;
    `;
    const updateResult = await mxdatabase.query(updateQuery, [name, now, userId]);

    res.status(200).json({ message: "✅ Name updated", full_name: updateResult.rows[0].full_name });
  } catch (err) {
    console.error("Change name error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /last-name-change
router.get("/last-name-change", verifyToken, async (req, res) => {
  try {
    const { userId } = req;
    const query = `SELECT last_name_change FROM users WHERE id = $1`;
    const result = await mxdatabase.query(query, [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({ lastChangeTimestamp: result.rows[0].last_name_change || 0 });
  } catch (err) {
    console.error("Get last name change error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// PUT /change-email
router.put("/change-email", verifyToken, async (req, res) => {
    try {
        const { userId } = req;
        const { email } = req.body;
        const now = Date.now();

        if (!email) {
            return res.status(400).json({ message: "Email is required" });
        }

        const userQuery = `SELECT email, last_email_change FROM users WHERE id = $1`;
        const result = await mxdatabase.query(userQuery, [userId]);
        const user = result.rows[0];

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        if (email === user.email) {
            return res.status(400).json({ message: "New email is the same as the current one" });
        }

        const cooldownTime = 30 * 24 * 60 * 60 * 1000; // 30 days
        if (user.last_email_change && now - user.last_email_change < cooldownTime) {
          const msLeft = cooldownTime - (now - user.last_username_change);
          const seconds = Math.floor((msLeft / 1000) % 60);
          const minutes = Math.floor((msLeft / (1000 * 60)) % 60);
          const hours = Math.floor((msLeft / (1000 * 60 * 60)) % 24);
          const days = Math.floor(msLeft / (1000 * 60 * 60 * 24));
          
          let timeLeft = '';
          if (days > 0) timeLeft += `${days}d `;
          if (hours > 0 || days > 0) timeLeft += `${hours}h `;
          if (minutes > 0 || hours > 0 || days > 0) timeLeft += `${minutes}m `;
          timeLeft += `${seconds}s`;
          
          return res.status(400).json({ message: `⏳ You can change your username again in ${timeLeft.trim()}.` });          
        }

        const emailCheckQuery = `
            SELECT 1 FROM users WHERE email = $1
            UNION
            SELECT 1 FROM temp_users WHERE email = $1
        `;
        const emailCheck = await mxdatabase.query(emailCheckQuery, [email]);

        if (emailCheck.rows.length > 0) {
            return res.status(409).json({ message: "Email already in use" });
        }

        const updateQuery = `
            UPDATE users
            SET email = $1, last_email_change = $2
            WHERE id = $3
            RETURNING email;
        `;
        const updateResult = await mxdatabase.query(updateQuery, [email, now, userId]);

        res.status(200).json({ message: "✅ Email updated successfully", email: updateResult.rows[0].email });
    } catch (err) {
        console.error("Change email error:", err);
        res.status(500).json({ message: "Server error" });
    }
});

// POST /check-email
router.post("/check-email", verifyToken, async (req, res) => {
    try {
        const { email } = req.body;

        const emailCheckQuery = `
            SELECT 1 FROM users WHERE email = $1
            UNION
            SELECT 1 FROM temp_users WHERE email = $1
        `;
        const emailCheck = await mxdatabase.query(emailCheckQuery, [email]);

        if (emailCheck.rows.length > 0) {
            return res.status(409).json({ message: "Email already in use" });
        }

        res.status(200).json({ message: "Email is available" });
    } catch (err) {
        console.error("Check email error:", err);
        res.status(500).json({ message: "Server error" });
    }
});



module.exports = router;
