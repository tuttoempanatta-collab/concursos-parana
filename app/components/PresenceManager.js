'use client';

import { useEffect, useState } from 'react';
import { db } from '../../firebase.config';
import { 
  collection, 
  doc, 
  setDoc, 
  onSnapshot, 
  query, 
  where, 
  serverTimestamp, 
  deleteDoc,
  Timestamp
} from 'firebase/firestore';

export default function PresenceManager({ onCountChange }) {
  const [sessionId] = useState(() => {
    // Generate a unique ID for this session
    return 'sess_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
  });

  useEffect(() => {
    const presenceRef = doc(db, 'presence', sessionId);

    // 1. Initial heartbeat
    const updatePresence = async () => {
      try {
        await setDoc(presenceRef, {
          lastActive: serverTimestamp(),
          id: sessionId
        }, { merge: true });
      } catch (e) {
        console.error("Error updating presence:", e);
      }
    };

    updatePresence();

    // 2. Set interval for heartbeats (every 45 seconds)
    const interval = setInterval(updatePresence, 45000);

    // 3. Cleanup: Try to delete doc when component unmounts
    const handleUnload = () => {
      // Note: deleteDoc might not finish on tab close, but it's good for SPA navigation
      deleteDoc(presenceRef).catch(() => {});
    };

    window.addEventListener('beforeunload', handleUnload);

    // 4. Listen to other active users
    // We count users active in the last 2 minutes
    const q = query(collection(db, 'presence'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const now = Date.now();
      const expirationMs = 2 * 60 * 1000; // 2 minutes
      
      let activeCount = 0;
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.lastActive) {
          const lastActiveMs = data.lastActive.seconds 
            ? data.lastActive.seconds * 1000 
            : data.lastActive.toMillis?.() || now;
            
          if (now - lastActiveMs < expirationMs) {
            activeCount++;
          }
        }
      });
      
      if (onCountChange) {
        // Ensure at least 1 (self) if snap is empty or processing
        onCountChange(Math.max(1, activeCount));
      }
    });

    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', handleUnload);
      unsubscribe();
      handleUnload();
    };
  }, [sessionId, onCountChange]);

  return null; // This is a headless logic component
}
