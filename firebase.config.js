import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyB5urg3Z7uDOmyHvCyRdL9ZZcwRayoldaI",
  authDomain: "concursos-entre-rios.firebaseapp.com",
  projectId: "concursos-entre-rios",
  storageBucket: "concursos-entre-rios.firebasestorage.app",
  messagingSenderId: "183882688670",
  appId: "1:183882688670:web:2fb736f63582296fffb38f",
  measurementId: "G-6BREN3H35G"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export default app;
