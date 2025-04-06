const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");

// Get all files in the mxfiles folder
router.get("/files", (req, res) => {
  const uploadDir = path.join(__dirname, "../mxfiles");

  fs.readdir(uploadDir, (err, files) => {
    if (err) {
      return res.status(500).json({ message: "Error reading directory", error: err });
    }

    res.status(200).json({ files });
  });
});

// Optionally, create additional file operations here (delete, get info, etc.)
module.exports = router;