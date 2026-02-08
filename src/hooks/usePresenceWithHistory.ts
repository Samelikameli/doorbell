// usePresenceWithHistory.ts
"use client";

import { useEffect, useRef } from "react";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/firebase";

function getOrCreateSessionId(meetingCode: string) {
  const key = `presenceSession:${meetingCode}`;
  const existing = sessionStorage.getItem(key);
  if (existing) return existing;

  const id = crypto.randomUUID();
  sessionStorage.setItem(key, id);
  return id;
}

export function usePresenceWithHistory({
  meetingCode,
  enabled,
  name,
  uid,
  heartbeatMs,
}: {
  meetingCode: string | null | undefined;
  enabled: boolean;
  name: string;
  uid: string | null;
  heartbeatMs: number;
}) {
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!meetingCode || !enabled) return;

    if (!sessionIdRef.current) {
      sessionIdRef.current = getOrCreateSessionId(meetingCode);
    }

    const sessionId = sessionIdRef.current;
    const presenceRef = doc(db, "meetings", meetingCode, "presence", sessionId);

    const write = async () => {
      const trimmed = name.trim();
      if (!trimmed) return;

      await setDoc(
        presenceRef,
        {
          sessionId,
          uid: uid ?? null,
          name: trimmed,
          lastSeen: serverTimestamp(),
          lastSeenMs: Date.now(),
          active: true,
        },
        { merge: true }
      );
    };

    // write immediately, then heartbeat
    void write();
    const t = window.setInterval(() => void write(), heartbeatMs);

    // mark inactive on unload (best effort)
    const onUnload = () => {
      navigator.sendBeacon?.(
        "/api/presence-inactive",
        JSON.stringify({ meetingCode, sessionId })
      );
    };
    window.addEventListener("beforeunload", onUnload);

    return () => {
      window.clearInterval(t);
      window.removeEventListener("beforeunload", onUnload);
      // optional: mark inactive when hook unmounts
      void setDoc(presenceRef, { active: false, lastSeenMs: Date.now() }, { merge: true });
    };
  }, [meetingCode, enabled, name, uid, heartbeatMs]);
}
