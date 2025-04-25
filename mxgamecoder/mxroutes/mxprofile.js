const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const mxdatabase = require("../mxconfig/mxdatabase");
const fetch = require("node-fetch");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
require("dotenv").config();
const { v4: uuidv4 } = require('uuid');
const nodemailer = require("nodemailer");
const bcrypt = require("bcryptjs");
//const crypto = require("crypto");
const { getWorkingAPI } = require("../mxconfig/mxapi");
const mxcooldown = require("./mxcooldown"); // Cooldown logic

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
  const cooldownCheck = await mxcooldown.checkAndUpdateCooldown(req.userId, "update-profile-picture");
  if (cooldownCheck.cooldown) {
    return res.status(429).json({ message: `🚫 Too many attempts. Try again in ${cooldownCheck.remaining}s.` });
  }
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
  const cooldownCheck = await mxcooldown.checkAndUpdateCooldown(req.userId, "change-username");
  if (cooldownCheck.cooldown) {
    return res.status(429).json({ message: `🚫 Too many attempts. Try again in ${cooldownCheck.remaining}s.` });
  }
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
  const cooldownCheck = await mxcooldown.checkAndUpdateCooldown(req.userId, "change-email");
  if (cooldownCheck.cooldown) {
    return res.status(429).json({ message: `🚫 Too many attempts. Try again in ${cooldownCheck.remaining}s.` });
  }
  try {
    const { userId } = req;
    const { email } = req.body;
    const now = Date.now();

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const userQuery = `SELECT email, last_email_change, username FROM users WHERE id = $1`;
    const result = await mxdatabase.query(userQuery, [userId]);
    const user = result.rows[0];

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (email === user.email) {
      return res.status(400).json({ message: "New email is the same as the current one" });
    }

    // 🛑 20-day cooldown check
    const COOLDOWN_MS = 20 * 24 * 60 * 60 * 1000; // 20 days
    if (user.last_email_change) {
      const lastChange = new Date(user.last_email_change).getTime();
      const timeSinceChange = now - lastChange;

      if (timeSinceChange < COOLDOWN_MS) {
        const daysLeft = Math.ceil((COOLDOWN_MS - timeSinceChange) / (1000 * 60 * 60 * 24));
        return res.status(429).json({ message: `⏳ You can only change your email once every 20 days. Try again in ${daysLeft} day(s).` });
      }
    }

    const emailCheckQuery = `SELECT 1 FROM users WHERE email = $1 UNION SELECT 1 FROM temp_users WHERE email = $1`;
    const emailCheck = await mxdatabase.query(emailCheckQuery, [email]);

    if (emailCheck.rows.length > 0) {
      return res.status(409).json({ message: "Email already in use" });
    }

    const verificationToken = uuidv4();

    // Update user with temp email, token, and set last_email_change timestamp
    const updateQuery = `
      UPDATE users
      SET temp_email = $1, verification_token = $2, last_email_change = NOW()
      WHERE id = $3
      RETURNING temp_email;
    `;
    const updateResult = await mxdatabase.query(updateQuery, [email, verificationToken, userId]);

    // Create verification URL
    const apiUrl = await getWorkingAPI();
    const verificationUrl = `${apiUrl}/mx/verify-email?token=${verificationToken}`;
    const subject = "Verify your new email on MSWORLD";
    const message = `Please click the following link to verify your new email address: <a href="${verificationUrl}">${verificationUrl}</a>`;

    // Send email
    let transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.SMTP_EMAIL,
        pass: process.env.SMTP_PASSWORD,
      },
      secure: true,
      tls: {
        rejectUnauthorized: false,
      },
    });

    const mailOptions = {
      from: `"MSWORLD Support Team 📧" <${process.env.SMTP_EMAIL}>`,
      to: email,
      subject: "📨 Verify Your New Email on MSWORLD",
      html: `
        <div style="font-family: Arial, sans-serif; font-size: 1.1rem; color: #333; background: #f9f9f9; padding: 20px; border-radius: 10px;">
          <p>👋 Hi there!</p>
          <p>We received a request to update your email on <strong>MSWORLD</strong>.</p>
          <p>To verify and complete this change, just click the button below:</p>
          <a href="${verificationUrl}" style="
            display: inline-block;
            margin-top: 1rem;
            padding: 0.75rem 1.5rem;
            background-color: #007bff;
            color: white;
            text-decoration: none;
            border-radius: 8px;
            font-weight: bold;
            font-size: 1rem;
          ">📩 Verify New Email</a>
          <p style="margin-top: 2rem;">Didn't request this change? You can safely ignore this email.</p>
          <p>🔐 Stay safe,<br/>Team MSWORLD 🌍</p>
        </div>
      `,
      headers: {
        "X-Priority": "1 (Highest)",
        "X-MSMail-Priority": "High",
        "Importance": "High",
      },
    };    

    await transporter.sendMail(mailOptions);

    res.status(200).json({ message: "✅ A verification link has been sent to your new email address." });
  } catch (err) {
    console.error("Change email error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /verify-email
router.get("/verify-email", async (req, res) => {
  try {
      const { token } = req.query;

      if (!token) {
          return res.status(400).json({ message: "Verification token is missing" });
      }

      const userQuery = `SELECT id, temp_email, verification_token FROM users WHERE verification_token = $1`;
      const result = await mxdatabase.query(userQuery, [token]);

      if (result.rows.length === 0) {
          return res.status(400).json({ message: "Invalid or expired token" });
      }

      const user = result.rows[0];

      // Update the email to the temporary email and confirm email verification
      const updateQuery = `
          UPDATE users
          SET email = $1, temp_email = NULL, verification_token = NULL, email_verified = TRUE
          WHERE id = $2
          RETURNING email;
      `;
      const updateResult = await mxdatabase.query(updateQuery, [user.temp_email, user.id]);

      res.redirect("http://mxgamecoder.lovestoblog.com/mxverify.html");
  } catch (err) {
      console.error("Email verification error:", err);
      res.status(500).json({ message: "Server error" });
  }
});

// PUT /change-phone
router.put("/change-phone", verifyToken, async (req, res) => {
  const cooldownCheck = await mxcooldown.checkAndUpdateCooldown(req.userId, "change-phone");
  if (cooldownCheck.cooldown) {
    return res.status(429).json({ message: `🚫 Too many attempts. Try again in ${cooldownCheck.remaining}s.` });
  }
  try {
    const { userId } = req;
    const { phone_number } = req.body;

    // Updated validation: phone number must be between 11 and 13 digits
    if (!phone_number || !/^\d{11,13}$/.test(phone_number)) {
      return res.status(400).json({ message: "Invalid phone number format. Must be between 11 and 13 digits." });
    }

    const userQuery = `SELECT phone_number, email, phone_change_cooldown_end FROM users WHERE id = $1`;
    const result = await mxdatabase.query(userQuery, [userId]);
    const user = result.rows[0];

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if cooldown has passed
    const currentDate = new Date();
    if (user.phone_change_cooldown_end && new Date(user.phone_change_cooldown_end) > currentDate) {
      const remainingTime = new Date(user.phone_change_cooldown_end) - currentDate;
      const remainingDays = Math.ceil(remainingTime / (1000 * 3600 * 24));
      return res.status(400).json({ message: `🔒 You must wait ${remainingDays} more day(s) to change your phone number.` });
    }

    if (phone_number === user.phone_number) {
      return res.status(400).json({ message: "New number is same as current" });
    }

    const phoneCheckQuery = `SELECT 1 FROM users WHERE phone_number = $1`;
    const phoneCheck = await mxdatabase.query(phoneCheckQuery, [phone_number]);

    if (phoneCheck.rows.length > 0) {
      return res.status(409).json({ message: "Phone number already in use" });
    }

    const verificationToken = uuidv4();

    // Update temp phone + token
    const updateQuery = `
      UPDATE users
      SET temp_phone = $1, verification_token = $2, phone_change_requested_at = NOW(), phone_change_cooldown_end = NOW() + INTERVAL '14 days'
      WHERE id = $3
    `;
    await mxdatabase.query(updateQuery, [phone_number, verificationToken, userId]);

    const apiUrl = await getWorkingAPI();
    const verificationUrl = `${apiUrl}/mx/verify-phone?token=${verificationToken}`;
    const subject = "Verify your new phone number on MSWORLD";
    const message = `Click this link to confirm your new number: <a href="${verificationUrl}">${verificationUrl}</a>`;

    // Email it
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.SMTP_EMAIL,
        pass: process.env.SMTP_PASSWORD,
      },
      secure: true,
      tls: { rejectUnauthorized: false },
    });

    const mailOptions = {
      from: `"MSWORLD Support 📱" <${process.env.SMTP_EMAIL}>`,
      to: user.email,
      subject: "📞 Verify Your New Phone Number on MSWORLD",
      html: `
        <div style="font-family: Arial, sans-serif; font-size: 1.1rem; color: #333; background: #f9f9f9; padding: 20px; border-radius: 10px;">
          <p>👋 Hello!</p>
          <p>You requested to change your phone number on <strong>MSWORLD</strong>.</p>
          <p>To confirm this change, click the button below:</p>
          <a href="${verificationUrl}" style="
            display: inline-block;
            margin-top: 1rem;
            padding: 0.75rem 1.5rem;
            background-color: #28a745;
            color: white;
            text-decoration: none;
            border-radius: 8px;
            font-weight: bold;
            font-size: 1rem;
          ">✅ Confirm Phone Number</a>
          <p style="margin-top: 2rem;">If this wasn’t you, feel free to ignore this email.</p>
          <p>🔐 Stay secure,<br>Team MSWORLD 🌍</p>
        </div>
      `,
      headers: {
        "X-Priority": "1 (Highest)",
        "X-MSMail-Priority": "High",
        "Importance": "High"
      }
    };    

    await transporter.sendMail(mailOptions);

    res.status(200).json({ message: "✅ Verification link sent to your email." });

  } catch (err) {
    console.error("Change phone error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /verify-phone
router.get("/verify-phone", async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ message: "Token missing" });
    }

    const result = await mxdatabase.query(`SELECT id, temp_phone FROM users WHERE verification_token = $1`, [token]);
    const user = result.rows[0];

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }

    await mxdatabase.query(`
      UPDATE users
      SET phone_number = $1, temp_phone = NULL, verification_token = NULL
      WHERE id = $2
    `, [user.temp_phone, user.id]);

    res.redirect("http://mxgamecoder.lovestoblog.com/mxverify.html");
  } catch (err) {
    console.error("Phone verify error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// PUT /change-password
router.put("/change-password", verifyToken, async (req, res) => { 
  const cooldownCheck = await mxcooldown.checkAndUpdateCooldown(req.userId, "change-password");
  if (cooldownCheck.cooldown) {
    return res.status(429).json({ message: `🚫 Too many attempts. Try again in ${cooldownCheck.remaining}s.` });
  }
  try {
      const { userId } = req;
      const { currentPassword, newPassword } = req.body;
      const now = Date.now();
      const COOLDOWN_MS = 5 * 24 * 60 * 60 * 1000; // 5 days cooldown

      // Check if both current and new password are provided
      if (!currentPassword || !newPassword) {
          return res.status(400).json({ message: "Both current and new password required" });
      }

      // Query to get user details from the database
      const query = `SELECT password_hash, last_password_change, username, email FROM users WHERE id = $1`;
      const userResult = await mxdatabase.query(query, [userId]);

      if (userResult.rows.length === 0) return res.status(404).json({ message: "User not found" });

      const user = userResult.rows[0];
      const recipientEmail = user.email; // Get email from the DB

      // Compare current password with stored hash
      const match = await bcrypt.compare(currentPassword, user.password_hash);
      if (!match) return res.status(401).json({ message: "Current password incorrect" });

      // Compare new password with current password
      const newMatch = await bcrypt.compare(newPassword, user.password_hash);
      if (newMatch) return res.status(400).json({ message: "New password cannot be the same as current one" });

      // Check if password change is within cooldown period
      if (user.last_password_change) {
          const lastChange = new Date(user.last_password_change).getTime();
          if (now - lastChange < COOLDOWN_MS) {
              const daysLeft = Math.ceil((COOLDOWN_MS - (now - lastChange)) / (1000 * 60 * 60 * 24));
              return res.status(429).json({ message: `⏳ Wait ${daysLeft} day(s) to change password again.` });
          }
      }

      // Hash the new password
      const hash = await bcrypt.hash(newPassword, 12);
      const verificationToken = uuidv4();

      // Update user record with temp password and verification token
      await mxdatabase.query(`
          UPDATE users
          SET temp_password = $1, verification_token = $2, last_password_change = NOW()
          WHERE id = $3
      `, [hash, verificationToken, userId]);

      // Generate verification link
      const apiUrl = await getWorkingAPI();
      const verificationLink = `${apiUrl}/mx/verify-password?token=${verificationToken}`;

      // Send verification email
      let transporter = nodemailer.createTransport({
          service: "gmail",
          auth: {
              user: process.env.SMTP_EMAIL,
              pass: process.env.SMTP_PASSWORD,
          },
      });

      await transporter.sendMail({
        from: `"MSWORLD Security 🔐" <${process.env.SMTP_EMAIL}>`,
        to: recipientEmail,
        subject: "🛡️ Confirm Your New Password on MSWORLD",
        html: `
          <div style="font-family: Arial, sans-serif; font-size: 1.1rem; color: #333;">
            <p>👋 Hey there!</p>
            <p>You recently requested to change your password on <strong>MSWORLD</strong>.</p>
            <p>To confirm this change, please click the button below:</p>
            <a href="${verificationLink}" style="
              display: inline-block;
              margin-top: 1rem;
              padding: 0.75rem 1.5rem;
              background-color: #007BFF;
              color: white;
              text-decoration: none;
              border-radius: 8px;
              font-weight: bold;
              font-size: 1rem;
            ">✅ Confirm Password</a>
            <p style="margin-top: 2rem;">If you didn't request this, you can safely ignore this email.</p>
            <p>🌀 Stay secure,<br>Team MSWORLD 🌍</p>
          </div>
        `,
      });      

      return res.status(200).json({ message: "✅ A verification link has been sent to your email." });
  } catch (err) {
      console.error("Password change error:", err);
      res.status(500).json({ message: "Server error" });
  }
});

// GET /verify-password
router.get("/verify-password", async (req, res) => {
    const { token } = req.query;

    if (!token) return res.status(400).json({ message: "Missing token" });

    const result = await mxdatabase.query(`SELECT id, temp_password FROM users WHERE verification_token = $1`, [token]);

    if (result.rows.length === 0) {
        return res.status(400).json({ message: "Invalid or expired token" });
    }

    const user = result.rows[0];

    // Update the user's password with the temporary password and reset fields
    await mxdatabase.query(`
        UPDATE users
        SET password_hash = $1, temp_password = NULL, verification_token = NULL
        WHERE id = $2
    `, [user.temp_password, user.id]);

    // Redirect user after successful password verification
    res.redirect("http://mxgamecoder.lovestoblog.com/mxverify.html");
});


module.exports = router;
