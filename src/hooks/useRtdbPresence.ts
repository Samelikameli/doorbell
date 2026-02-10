"use client";

import { useEffect, useMemo, useState } from "react";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { onDisconnect, onValue, ref, serverTimestamp, set, update } from "firebase/database";
import { rtdb } from "@/firebase";

function uuid() {
  return crypto.randomUUID();
}

export function useRtdbPresence(meetingCode?: string, name?: string, enabled: boolean = true) {
  const sessionId = useMemo(() => uuid(), []);
  const [uid, setUid] = useState<string | null>(null);

  useEffect(() => {
    const auth = getAuth();
    return onAuthStateChanged(auth, (u) => setUid(u?.uid ?? null));
  }, []);

  useEffect(() => {
    console.log("[presence] hook", { meetingCode, name, enabled, sessionId, uid });

    if (!enabled || !meetingCode) return;
    if (!uid) {
      console.warn("[presence] no auth user yet");
      return;
    }
    if (!name || !name.trim()) {
      console.warn("[presence] missing name");
      return;
    }

    const path = `presence/${meetingCode}/${uid}/${sessionId}`;
    const sessionRef = ref(rtdb, path);

    const connRef = ref(rtdb, ".info/connected");
    const unsubConn = onValue(connRef, async (snap) => {
      const connected = snap.val() === true;
      if (!connected) return;

      try {
        await onDisconnect(sessionRef).remove();
      } catch (e) {
        console.error("[presence] onDisconnect error", e);
      }

      try {
        // Important: only write fields your rules validate
        await set(sessionRef, {
          uid,
          name: name.trim(),
          lastSeenAt: Date.now(),
        });
        console.log("[presence] initial set OK");
      } catch (e) {
        console.error("[presence] initial set FAIL", e);
      }
    });

    const heartbeat = window.setInterval(async () => {
      try {
        await update(sessionRef, { lastSeenAt: Date.now() });
      } catch (e) {
        console.error("[presence] heartbeat FAIL", e);
      }
    }, 25_000);

    return () => {
      window.clearInterval(heartbeat);
      unsubConn();
      setTimeout(() => {
        onDisconnect(sessionRef).cancel().catch(() => {});
      }, 0);
    };
  }, [meetingCode, name, enabled, sessionId, uid]);
}
