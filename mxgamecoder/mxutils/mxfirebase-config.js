// mxfirebase-config.js
const { initializeApp } = require("firebase/app");
const { getFirestore, collection, addDoc, getDocs } = require("firebase/firestore");

const firebaseConfig = {
  apiKey: "AIzaSyBgWWvy7KoJF9txCZeQh9VZiyKBst4zRLw",
  authDomain: "mxgamecoder-50b0a.firebaseapp.com",
  projectId: "mxgamecoder-50b0a",
  storageBucket: "mxgamecoder-50b0a.firebasestorage.app",
  messagingSenderId: "354711909248",
  appId: "1:354711909248:android:915b02958ca0c9751f4765"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Firestore
const db = getFirestore(app);

module.exports = { db, collection, addDoc, getDocs };
