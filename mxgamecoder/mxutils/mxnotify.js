const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: "../.env" });
const sanitizeFilename = require("sanitize-filename");

const { db, collection } = require("./mxfirebase-config");
const { addDoc } = require("firebase/firestore");

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

  console.log(`Checking for notification file: ${userFile}`);
  if (!fs.existsSync(userFile)) {
    console.log(`Notification file not found for ${username}. Creating new one.`);
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
  console.log(`Notification saved to JSON for user: ${username}`);
}

// Save notification to Firebase
async function saveNotificationToFirebase(username, notification, uid) {
  try {
    console.log("UID before saving to Firebase:", uid); // Debugging: Check UID value

    if (!uid) {
      console.error("❌ UID is undefined. Cannot save notification to Firebase.");
      return; // Exit if UID is not valid
    }

    await addDoc(collection(db, "notifications"), {
      username: username,
      uid: uid,  // Ensure UID is passed here
      ...notification,
      createdAt: new Date(),
    });
    console.log("📲 Notification saved to Firebase.");
  } catch (error) {
    console.error("❌ Error saving notification to Firebase:", error);
  }
}

// MAIN FUNCTION TO SEND EMAIL AND LOG NOTIFICATION
const emailjs = require('emailjs-com');
emailjs.init("QaqIhozzJLcyGORgz"); // Public Key

const sendEmailNotification = async (userEmail, subject, message, username, uid) => {
  try {
    if (!uid) {
      console.error("❌ UID is undefined.");
      return;
    }

    const now = Date.now();
    if (emailCooldown.has(userEmail)) {
      const lastSent = emailCooldown.get(userEmail);
      if (now - lastSent < 1 * 60 * 1000) return;
    }
    emailCooldown.set(userEmail, now);

    const safeUsername = sanitizeFilename(username);
    const userFolder = path.join(NOTIFICATION_DIR, safeUsername);
    if (!fs.existsSync(userFolder)) fs.mkdirSync(userFolder, { recursive: true });

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

    // 🚀 Send with EmailJS
    const emailParams = {
      subject: subject,
      message: message,
      email: userEmail
    };

    await emailjs.send("service_3w7fink", "template_0v6tyoa", emailParams);
    console.log(`📩 EmailJS sent to ${userEmail}`);
  } catch (error) {
    console.error("❌ EmailJS error:", error);
  }
};

const generateFrontendNotification = (type, message) => {
  return { type, message };
};

module.exports = { sendEmailNotification, generateFrontendNotification };
