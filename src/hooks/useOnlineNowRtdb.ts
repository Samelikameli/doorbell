// hooks/useOnlineNowRtdb.ts
"use client";

import { useEffect, useState } from "react";
import { onValue, ref } from "firebase/database";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { rtdb } from "@/firebase";

export type OnlineUser = { uid: string; name: string; lastSeenAt: number };

export function useOnlineNowRtdb(
  meetingCode?: string,
  windowMs: number = 60_000,
  enabled: boolean = true
) {
  const [online, setOnline] = useState<OnlineUser[]>([]);
  const [uidReady, setUidReady] = useState(false);

  useEffect(() => {
    const auth = getAuth();
    return onAuthStateChanged(auth, (u) => setUidReady(!!u));
  }, []);

  useEffect(() => {
    console.log("[online] hook", { meetingCode, windowMs, enabled, uidReady });

    if (!enabled || !uidReady) {
      setOnline([]);
      return;
    }

    if (!meetingCode) {
      console.warn("[online] missing meetingCode");
      setOnline([]);
      return;
    }

    const path = `presence/${meetingCode}`;
    const rootRef = ref(rtdb, path);

    console.log("[online] subscribe", { path });

    const unsub = onValue(
      rootRef,
      (snap) => {
        const now = Date.now();
        const val = snap.val();

        if (!val || typeof val !== "object") {
          setOnline([]);
          return;
        }

        const out: OnlineUser[] = [];

        // Shape A only (recommended). If you truly need shape B, keep it.
        for (const [uid, sessions] of Object.entries(val as Record<string, any>)) {
          if (!sessions || typeof sessions !== "object") continue;

          let best: OnlineUser | null = null;

          for (const s of Object.values(sessions as Record<string, any>)) {
            const lastSeenAt = typeof s?.lastSeenAt === "number" ? s.lastSeenAt : 0;
            const name = typeof s?.name === "string" ? s.name : "";
            const effectiveUid = typeof s?.uid === "string" ? s.uid : uid;

            if (!name || !lastSeenAt) continue;
            if (now - lastSeenAt > windowMs) continue;

            if (!best || lastSeenAt > best.lastSeenAt) {
              best = { uid: effectiveUid, name, lastSeenAt };
            }
          }

          if (best) out.push(best);
        }

        out.sort((a, b) => b.lastSeenAt - a.lastSeenAt);
        setOnline(out);
      },
      (err) => {
        console.error("[online] subscription error", err);
        setOnline([]);
      }
    );

    return () => {
      console.log("[online] unsubscribe", { path });
      unsub();
    };
  }, [meetingCode, windowMs, enabled, uidReady]);

  return { online };
}
