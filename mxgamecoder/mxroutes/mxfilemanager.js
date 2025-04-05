const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");

// Get all files in the mxfiles folder
router.get("/files", (req, res) => {
  const uploadDir = path.join(__dirname, "../mxfiles");

  // Log the upload directory path for debugging
  console.log("Accessing directory:", uploadDir);

  fs.readdir(uploadDir, (err, files) => {
    if (err) {
      console.error("Error reading directory:", err);  // Log the error
      return res.status(500).json({ message: "Error reading directory", error: err });
    }

    // Log the files found in the directory
    console.log("Files found:", files);

    res.status(200).json({ files });
  });
});

// Optionally, create additional file operations here (delete, get info, etc.)
module.exports = router;
