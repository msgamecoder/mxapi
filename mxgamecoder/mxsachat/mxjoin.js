const express = require("express");
const router = express.Router();
const pool = require("../mxconfig/mxdatabase"); // PostgreSQL DB connection
const authMiddleware = require("../mxmiddleware/authMiddleware"); // JWT auth

// Route: /mx/sachat
router.get("/sachat", authMiddleware, async (req, res) => {
  try {
    const { user } = req; // user object from authMiddleware (decoded JWT)

    // Query user info from DB
    const result = await pool.query(
      "SELECT phone_number, phone_verified FROM users WHERE id = $1",
      [user.id]
    );

    if (result.rows.length === 0) {
      // No user found
      console.log("User not found");
      return res.json({ success: false, message: "Account not found" });
    }

    const userData = result.rows[0];

    if (userData.phone_verified === true) {
      // ✅ Phone is verified
      console.log("Phone verified");
      return res.json({ success: true, userVerified: true });
    } else {
      // 🔒 Phone is not verified
      console.log("Phone not verified");
      return res.json({ success: true, userVerified: false });
    }

  } catch (error) {
    console.error("Error in SaChat join route:", error.message);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;
