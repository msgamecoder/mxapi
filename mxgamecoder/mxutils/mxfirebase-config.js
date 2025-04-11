// mxfirebase-config.js (CommonJS version)
const firebase = require("firebase/compat/app");
require("firebase/compat/firestore");

const firebaseConfig = {
  apiKey: "AIzaSyB-v2EELtWdQVK4q-bzsJFW9jxKakL8FvM",
  authDomain: "msworld-feedback.firebaseapp.com",
  projectId: "msworld-feedback",
  storageBucket: "msworld-feedback.appspot.com",
  messagingSenderId: "728370969195",
  appId: "1:728370969195:web:fce607fb6be4b9915b8f2e",
  measurementId: "G-XYZ123456"
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);

// Initialize Firestore
const db = firebase.firestore();

module.exports = { db };
