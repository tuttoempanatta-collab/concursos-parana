import { initializeApp } from "firebase/app";
import { initializeFirestore, getFirestore } from "firebase/firestore";
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
// Forzamos Auto-Detect Long Polling y desactivamos streams de fetch para garantizar 100% de compatibilidad en Android WebView
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
  useFetchStreams: false
});
export const auth = getAuth(app);
export default app;
