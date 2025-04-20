const nodemailer = require("nodemailer");
require("dotenv").config({ path: "../.env" });
const { getFirestore, collection, addDoc } = require("firebase/firestore"); // Updated import for Firebase Firestore
const { db } = require("./mxfirebase-config"); // Assuming this provides the Firestore instance
const emailCooldown = new Map();

// Initialize Firestore
const firestore = getFirestore(db);

// Save notification to Firebase
async function saveNotificationToFirebase(username, notification, uid) {
  try {
    console.log("UID before saving to Firebase:", uid); // Debugging: Check UID value

    if (!uid) {
      console.error("❌ UID is undefined. Cannot save notification to Firebase.");
      return; // Exit if UID is not valid
    }

    const notificationsRef = collection(firestore, "notifications");
    await addDoc(notificationsRef, {
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
    const notification = {
      title: subject,
      message: message,
      time: new Date().toLocaleString(),
      read: false,
    };

    // 🔥 Save to Firebase
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
