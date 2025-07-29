import { initializeApp } from 'firebase/app';
import { getAnalytics } from "firebase/analytics";
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// Your Firebase configuration
// Replace with your actual Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyBIWYLdAcR7aw_p9WFkYx8o6ORQ2wre6mg",
  authDomain: "deckadence.online",
  projectId: "deckadence-2646d",
  storageBucket: "deckadence-2646d.firebasestorage.app",
  messagingSenderId: "173466998948",
  appId: "1:173466998948:web:acd883773ea9b2683fae31",
  measurementId: "G-ZRE3TFJ2RW"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// Initialize Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Initialize Google Auth Provider
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

export default app; 