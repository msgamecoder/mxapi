import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// Firebase configuration object from your Firebase project setup
const firebaseConfig = {
  apiKey: "AIzaSyB-v2EELtWdQVK4q-bzsJFW9jxKakL8FvM",
  authDomain: "msworld-feedback.firebaseapp.com",
  projectId: "msworld-feedback",
  storageBucket: "msworld-feedback.appspot.com",
  messagingSenderId: "728370969195",
  appId: "1:728370969195:web:fce607fb6be4b9915b8f2e",
  measurementId: "G-XYZ123456"  // Replace with actual Measurement ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore
const db = getFirestore(app);

// Check if running in a browser environment before initializing Firebase Messaging
let messaging;

if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  import("firebase/messaging").then(({ getMessaging }) => {
    messaging = getMessaging(app);
    console.log("Firebase Messaging initialized.");
  }).catch(error => {
    console.error("Error initializing Firebase Messaging:", error);
  });
} else {
  console.log("Firebase Messaging can only be used in the browser.");
}

export { db, messaging };
