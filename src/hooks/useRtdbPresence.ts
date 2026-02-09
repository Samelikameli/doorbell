// hooks/useRtdbPresence.ts
"use client";

import { useEffect, useMemo } from "react";
import { getAuth } from "firebase/auth";
import { onDisconnect, onValue, ref, serverTimestamp, set, update } from "firebase/database";
import { rtdb } from "@/firebase";

function uuid() {
  return crypto.randomUUID();
}

export function useRtdbPresence(meetingCode?: string, name?: string, enabled: boolean = true) {
  const sessionId = useMemo(() => uuid(), []);

  useEffect(() => {
    console.log("[presence] hook", { meetingCode, name, enabled, sessionId });

    if (!enabled || !meetingCode) return;

    const auth = getAuth();
    const uid = auth.currentUser?.uid;

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

    console.log("[presence] start", { path, uid, sessionId });

    const connRef = ref(rtdb, ".info/connected");
    const unsubConn = onValue(connRef, async (snap) => {
      const connected = snap.val() === true;
      console.log("[presence] .info/connected", { connected });

      if (!connected) return;

      try {
        await onDisconnect(sessionRef).remove();
        console.log("[presence] onDisconnect(remove) set");
      } catch (e) {
        console.error("[presence] onDisconnect error", e);
      }

      try {
        await set(sessionRef, {
          uid,
          name: name.trim(),
          lastSeenAt: Date.now(),
          connectedAt: serverTimestamp(),
        });
        console.log("[presence] initial set OK");
      } catch (e) {
        console.error("[presence] initial set FAIL", e);
      }
    });

    const heartbeat = window.setInterval(async () => {
      try {
        await update(sessionRef, { lastSeenAt: Date.now() });
        console.log("[presence] heartbeat OK", { lastSeenAt: Date.now() });
      } catch (e) {
        console.error("[presence] heartbeat FAIL", e);
      }
    }, 25_000);

    return () => {
      console.log("[presence] cleanup", { path });
      window.clearInterval(heartbeat);
      unsubConn();

      // Best-effort cleanup
      setTimeout(() => {
        onDisconnect(sessionRef).cancel().catch(() => {});
      }, 0);
    };
  }, [meetingCode, name, enabled, sessionId]);
}
