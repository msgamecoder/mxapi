const express = require("express");
const router = express.Router();
const pool = require("../mxconfig/mxdatabase"); // PostgreSQL DB connection
const authMiddleware = require("../mxmiddleware/authMiddleware"); // JWT auth

// Route: /mx/sachat/join
router.get("/sachat", authMiddleware, async (req, res) => {
  try {
    const { user } = req; // user object from authMiddleware (decoded JWT)

    // Query user info from DB
    const result = await pool.query(
      "SELECT phone_number, phone_verified FROM users WHERE id = $1",
      [user.id]
    );

    if (result.rows.length === 0) {
      // No user found, send to signup
      return res.redirect("https://mxgamecoder.lovestoblog.com/signup.html");
    }

    const userData = result.rows[0];

    if (userData.phone_verified === true) {
      // ✅ Phone is verified
      return res.redirect("https://mxgamecoder.lovestoblog.com/mxworld/mxsuccessful.html");
    } else {
      // 🔒 Phone is not verified
      return res.redirect("https://mxgamecoder.lovestoblog.com/mxworld/mxverify.html");
    }

  } catch (error) {
    console.error("Error in SaChat join route:", error.message);
    return res.status(500).send("Internal Server Error");
  }
});

module.exports = router;
