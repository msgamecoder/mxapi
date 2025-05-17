const express = require("express");
const router = express.Router();
const multer = require("multer");
const cloudinary = require("../mxconfig/mxcloudinary");
const authMiddleware = require("../mxmiddleware/authMiddleware");

const storage = multer.memoryStorage();
const upload = multer({ storage });

router.post("/sachat/upload-voice", authMiddleware, upload.single("voice"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No voice file uploaded" });

    const uploadResult = await cloudinary.uploader.upload_stream(
      {
        resource_type: "video",
        folder: "sachat/voices",
        public_id: `voice_${Date.now()}`,
        format: "mp3"
      },
      (error, result) => {
        if (error) return res.status(500).json({ error: "Cloudinary upload failed" });
        res.json({ success: true, url: result.secure_url });
      }
    );

    // Pipe the buffer to Cloudinary
    require("streamifier").createReadStream(req.file.buffer).pipe(uploadResult);
  } catch (err) {
    console.error("Voice upload error:", err.message);
    res.status(500).json({ error: "Something went wrong uploading the voice note" });
  }
});

module.exports = router;
