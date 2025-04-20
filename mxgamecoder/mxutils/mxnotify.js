const fs = require("fs");
const path = require("path");
const sanitizeFilename = require("sanitize-filename");
require("dotenv").config({ path: "../.env" });

const { db, collection } = require("./mxfirebase-config");
const { addDoc } = require("firebase/firestore");
const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

const NOTIFICATION_DIR = path.join(__dirname, "../mxgamecodernot");

if (!fs.existsSync(NOTIFICATION_DIR)) {
  console.log(`📁 Creating main notification directory: ${NOTIFICATION_DIR}`);
  fs.mkdirSync(NOTIFICATION_DIR, { recursive: true });
}

const emailCooldown = new Map();

function getUserNotificationFile(username) {
  const safeUsername = sanitizeFilename(username);
  const userFile = path.join(NOTIFICATION_DIR, `${safeUsername}_notifications.json`);
  console.log(`📂 Checking user JSON: ${userFile}`);

  if (!fs.existsSync(userFile)) {
    console.log(`🆕 Creating new JSON for user: ${username}`);
    fs.writeFileSync(userFile, JSON.stringify({ notifications: [] }));
  }

  return userFile;
}

function saveNotificationToJson(username, notification) {
  const userFile = getUserNotificationFile(username);
  const data = JSON.parse(fs.readFileSync(userFile, "utf-8"));
  data.notifications.push(notification);
  fs.writeFileSync(userFile, JSON.stringify(data, null, 2));
  console.log(`✅ Saved to JSON: ${userFile}`);
}

async function saveNotificationToFirebase(username, notification, uid) {
  try {
    if (!uid) {
      console.error("⚠️ UID is missing. Skipping Firebase save.");
      return;
    }

    await addDoc(collection(db, "notifications"), {
      username,
      uid,
      ...notification,
      createdAt: new Date(),
    });

    console.log("🔥 Notification saved to Firebase.");
  } catch (err) {
    console.error("❌ Firebase error:", err.message);
  }
}

const sendEmailNotification = async (userEmail, subject, message, username, uid) => {
  try {
    console.log("🚀 Preparing to send email...");
    console.log("➡️ User Email:", userEmail);
    console.log("➡️ Subject:", subject);
    console.log("➡️ UID:", uid);

    if (!uid) {
      console.error("❌ UID is undefined.");
      return;
    }

    const now = Date.now();
    if (emailCooldown.has(userEmail)) {
      const lastSent = emailCooldown.get(userEmail);
      if (now - lastSent < 60 * 1000) {
        console.log("⏳ Cooldown active, skipping email.");
        return;
      }
    }
    emailCooldown.set(userEmail, now);

    const safeUsername = sanitizeFilename(username);
    const userFolder = path.join(NOTIFICATION_DIR, safeUsername);

    if (!fs.existsSync(userFolder)) {
      console.log(`📁 Creating folder for ${username}: ${userFolder}`);
      fs.mkdirSync(userFolder, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/:/g, "-");
    const filename = `${timestamp}.txt`;
    const logFile = path.join(userFolder, filename);
    const logMessage = `📧 Email sent to: ${userEmail}\nSubject: ${subject}\nMessage: ${message}\nTime: ${new Date().toLocaleString()}\n\n`;

    fs.appendFileSync(logFile, logMessage);
    console.log(`📝 Log file saved: ${logFile}`);

    const notification = {
      title: subject,
      message,
      time: new Date().toLocaleString(),
      read: false,
      filename,
    };

    saveNotificationToJson(username, notification);
    await saveNotificationToFirebase(username, notification, uid);

    console.log("📨 Sending email through Resend...");

    const response = await resend.emails.send({
      from: 'MSWORLD <onboarding@resend.dev>', // Update this to your verified sender later
      to: userEmail,
      subject: subject,
      html: `<div style="font-family: Arial, sans-serif; padding: 10px; background: #f4f4f4; border-radius: 5px;">
               <h2 style="color: #333;">${subject}</h2>
               <p style="color: #555;">${message}</p>
               <hr>
               <small style="color: #888;">If you didn't request this, you can ignore this email.</small>
             </div>`,
    });

    console.log("📬 Resend API response:", response);
    console.log("✅ Email sent to:", userEmail);
  } catch (error) {
    console.error("❌ sendEmailNotification error:", error);
  }
};

const generateFrontendNotification = (type, message) => {
  return { type, message };
};

module.exports = { sendEmailNotification, generateFrontendNotification };
