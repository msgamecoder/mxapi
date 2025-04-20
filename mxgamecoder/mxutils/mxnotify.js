const fs = require("fs");
const path = require("path");
const sanitizeFilename = require("sanitize-filename");
require("dotenv").config({ path: "../.env" });

const { db, collection } = require("./mxfirebase-config");
const { addDoc } = require("firebase/firestore");
const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

const NOTIFICATION_DIR = path.join(__dirname, "../mxgamecodernot");

// 🔥 Ensure the main notification folder exists
if (!fs.existsSync(NOTIFICATION_DIR)) {
  console.log(`Creating notification directory: ${NOTIFICATION_DIR}`);
  fs.mkdirSync(NOTIFICATION_DIR, { recursive: true });
}

// 🛑 Prevent email spam (1-minute cooldown per user)
const emailCooldown = new Map();

// Get the JSON file for the user's notifications
function getUserNotificationFile(username) {
  const safeUsername = sanitizeFilename(username);
  const userFile = path.join(NOTIFICATION_DIR, `${safeUsername}_notifications.json`);

  if (!fs.existsSync(userFile)) {
    fs.writeFileSync(userFile, JSON.stringify({ notifications: [] }));
  }

  return userFile;
}

// Save or update notification JSON
function saveNotificationToJson(username, notification) {
  const userFile = getUserNotificationFile(username);
  const data = JSON.parse(fs.readFileSync(userFile, "utf-8"));
  data.notifications.push(notification);
  fs.writeFileSync(userFile, JSON.stringify(data, null, 2));
}

// Save notification to Firebase
async function saveNotificationToFirebase(username, notification, uid) {
  try {
    if (!uid) {
      console.error("❌ UID is undefined. Cannot save notification to Firebase.");
      return;
    }

    await addDoc(collection(db, "notifications"), {
      username: username,
      uid: uid,
      ...notification,
      createdAt: new Date(),
    });

    console.log("📲 Notification saved to Firebase.");
  } catch (error) {
    console.error("❌ Error saving notification to Firebase:", error);
  }
}

// MAIN FUNCTION TO SEND EMAIL AND LOG NOTIFICATION
const sendEmailNotification = async (userEmail, subject, message, username, uid) => {
  try {
    if (!uid) {
      console.error("❌ UID is undefined in sendEmailNotification.");
      return;
    }

    const now = Date.now();
    if (emailCooldown.has(userEmail)) {
      const lastSent = emailCooldown.get(userEmail);
      if (now - lastSent < 1 * 60 * 1000) {
        console.log("⏳ Email not sent (cooldown active)");
        return;
      }
    }
    emailCooldown.set(userEmail, now);

    const safeUsername = sanitizeFilename(username);
    const userFolder = path.join(NOTIFICATION_DIR, safeUsername);

    if (!fs.existsSync(userFolder)) {
      fs.mkdirSync(userFolder, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/:/g, "-");
    const filename = `${timestamp}.txt`;
    const logFile = path.join(userFolder, filename);
    const logMessage = `📩 Email sent to: ${userEmail}\nSubject: ${subject}\nMessage: ${message}\nTime: ${new Date().toLocaleString()}\n\n`;

    fs.appendFileSync(logFile, logMessage);

    const notification = {
      title: subject,
      message: message,
      time: new Date().toLocaleString(),
      read: false,
      filename: filename,
    };

    saveNotificationToJson(username, notification);
    await saveNotificationToFirebase(username, notification, uid);

    // ✅ Send Email via Resend
    await resend.emails.send({
      from: 'MSWORLD <onboarding@resend.dev>', // Replace after verifying your domain
      to: userEmail,
      subject: subject,
      html: `<div style="font-family: Arial, sans-serif; padding: 10px; background: #f4f4f4; border-radius: 5px;">
               <h2 style="color: #333;">${subject}</h2>
               <p style="color: #555;">${message}</p>
               <hr>
               <small style="color: #888;">If you didn't request this, you can ignore this email.</small>
             </div>`,
    });

    console.log(`📩 Email sent to ${userEmail}: ${subject}`);
  } catch (error) {
    console.error("❌ Email notification error:", error);
  }
};

const generateFrontendNotification = (type, message) => {
  return { type, message };
};

module.exports = { sendEmailNotification, generateFrontendNotification };
