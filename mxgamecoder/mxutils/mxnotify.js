const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: "../.env" });
const sanitizeFilename = require("sanitize-filename");

const { db, collection } = require("./mxfirebase-config");
const { addDoc } = require("firebase/firestore");

const NOTIFICATION_DIR = path.join(__dirname, "../mxgamecodernot");

// Ensure the main notification folder exists
if (!fs.existsSync(NOTIFICATION_DIR)) {
  console.log(`Creating notification directory: ${NOTIFICATION_DIR}`);
  fs.mkdirSync(NOTIFICATION_DIR, { recursive: true });
}

// Prevent email spam (1-minute cooldown per user)
const emailCooldown = new Map();

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
const sendEmailNotification = async (userEmail, subject, message, username, uid) => {
  try {
    // Debugging: Check UID value before proceeding
    console.log("Inside sendEmailNotification - UID:", uid);

    if (!uid) {
      console.error("❌ UID is undefined in sendEmailNotification.");
      return; // Exit early if UID is undefined
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

    // 🔐 Safe username and paths
    const safeUsername = sanitizeFilename(username);
    const userFolder = path.join(NOTIFICATION_DIR, safeUsername);

    if (!fs.existsSync(userFolder)) {
      console.log(`Creating folder for user notifications: ${userFolder}`);
      fs.mkdirSync(userFolder, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/:/g, "-");
    const filename = `${timestamp}.txt`;
    const logFile = path.join(userFolder, filename);
    const logMessage = `📩 Email sent to: ${userEmail}\nSubject: ${subject}\nMessage: ${message}\nTime: ${new Date().toLocaleString()}\n\n`;

    // 🔥 Save TXT version
    fs.appendFileSync(logFile, logMessage);
    console.log(`📄 Notification saved: ${logFile}`);

    // 🔥 Save notification to Firebase
    const notification = {
      title: subject,
      message: message,
      time: new Date().toLocaleString(),
      read: false,
      filename: filename,
    };

    // Save to Firebase
    await saveNotificationToFirebase(username, notification, uid);

    // 🔐 Send email using Gmail
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
      from: `"MSWORLD Support Team" <${process.env.SMTP_EMAIL}>`,
      to: userEmail,
      replyTo: process.env.SMTP_EMAIL,
      subject: subject,
      html: `<div style="font-family: Arial, sans-serif; padding: 10px; background: #f4f4f4; border-radius: 5px;">
               <h2 style="color: #333;">${subject}</h2>
               <p style="color: #555;">${message}</p>
               <hr>
               <small style="color: #888;">If you didn't request this, you can ignore this email.</small>
             </div>`,
      headers: {
        "X-Priority": "1 (Highest)",
        "X-MSMail-Priority": "High",
        "Importance": "High",
      },
    };

    await transporter.sendMail(mailOptions);
    console.log(`📩 Email sent to ${userEmail}: ${subject}`);
  } catch (error) {
    console.error("❌ Email notification error:", error);
  }
};

module.exports = { sendEmailNotification };
