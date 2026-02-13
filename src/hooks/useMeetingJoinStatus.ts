// hooks/useMeetingJoinStatus.ts
"use client";

import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/firebase";

export function useMeetingJoinStatus(meetingCode?: string, user?: User | null, userLoading?: boolean, userName?: string) {
  const [joined, setJoined] = useState(false);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState<string | null>(null);


  useEffect(() => {
    if (!meetingCode) {
      setJoined(false);
      setLoading(false);
      setDisplayName(null);
      return;
    }
    if (userLoading) {
      setJoined(false);
      setLoading(true);
      setDisplayName(null);
      return;
    }
    if (!user) {
      setJoined(false);
      setLoading(false);
      setDisplayName(null);
      return;
    }

    setLoading(true);
    const ref = doc(db, "meetings", meetingCode, "participants", user.uid);

    const unsub = onSnapshot(
      ref,
      (snap) => {
        setJoined(snap.exists());
        setDisplayName(snap.data()?.name ?? null);
        setLoading(false);
      },
      () => {
        // If rules deny until joined, treat as not joined (do not spam errors)
        setJoined(false);
        setLoading(false);
        setDisplayName(null);
      }
    );

    return () => unsub();
  }, [meetingCode, user?.uid, userLoading, userName]);

  return { joined, loading, displayName };
}
