// hooks/useOnlineNowRtdb.ts
"use client";

import { useEffect, useState } from "react";
import { onValue, ref } from "firebase/database";
import { rtdb } from "@/firebase";

export type OnlineUser = { uid: string; name: string; lastSeenAt: number };

export function useOnlineNowRtdb(meetingCode?: string, windowMs: number = 60_000) {
  const [online, setOnline] = useState<OnlineUser[]>([]);

  useEffect(() => {
    console.log("[online] hook", { meetingCode, windowMs });

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

        console.log("[online] snapshot", {
          exists: snap.exists(),
          type: val === null ? "null" : Array.isArray(val) ? "array" : typeof val,
          keys: val && typeof val === "object" ? Object.keys(val).slice(0, 10) : [],
        });

        if (!val || typeof val !== "object") {
          console.warn("[online] empty presence tree");
          setOnline([]);
          return;
        }

        const out: OnlineUser[] = [];
        let totalSessions = 0;
        let droppedMissingFields = 0;
        let droppedStale = 0;

        // Supports both shapes:
        // A) presence/{meeting}/{uid}/{sessionId} = { name, lastSeenAt }
        // B) presence/{meeting}/{sessionId} = { name, lastSeenAt }  (fallback)
        for (const [lvl1Key, lvl1Val] of Object.entries(val as Record<string, any>)) {
          if (!lvl1Val || typeof lvl1Val !== "object") continue;

          // Detect if lvl1Val looks like a single presence object (shape B)
          const looksLikePresenceObject =
            typeof lvl1Val.name === "string" && typeof lvl1Val.lastSeenAt === "number";

          if (looksLikePresenceObject) {
            totalSessions += 1;
            const lastSeenAt = lvl1Val.lastSeenAt as number;
            const name = (lvl1Val.name as string) ?? "";
            if (!name || !lastSeenAt) {
              droppedMissingFields += 1;
              continue;
            }
            if (now - lastSeenAt > windowMs) {
              droppedStale += 1;
              continue;
            }
            out.push({ uid: lvl1Val.uid ?? lvl1Key, name, lastSeenAt });
            continue;
          }

          // Otherwise treat lvl1Key as uid and lvl1Val as sessions map (shape A)
          const uid = lvl1Key;
          const sessions = lvl1Val as Record<string, any>;

          let best: OnlineUser | null = null;

          for (const [sessionId, s] of Object.entries(sessions)) {
            totalSessions += 1;

            const lastSeenAt = typeof s?.lastSeenAt === "number" ? s.lastSeenAt : 0;
            const name = typeof s?.name === "string" ? s.name : "";
            const effectiveUid = typeof s?.uid === "string" ? s.uid : uid;

            if (!name || !lastSeenAt) {
              droppedMissingFields += 1;
              console.log("[online] drop missing fields", { uid, sessionId, s });
              continue;
            }

            const age = now - lastSeenAt;
            if (age > windowMs) {
              droppedStale += 1;
              console.log("[online] drop stale", { uid, sessionId, ageMs: age, lastSeenAt });
              continue;
            }

            if (!best || lastSeenAt > best.lastSeenAt) {
              best = { uid: effectiveUid, name, lastSeenAt };
            }
          }

          if (best) out.push(best);
        }

        out.sort((a, b) => b.lastSeenAt - a.lastSeenAt);

        console.log("[online] computed", {
          online: out.length,
          totalSessions,
          droppedMissingFields,
          droppedStale,
          sample: out.slice(0, 5),
        });

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
  }, [meetingCode, windowMs]);

  return { online };
}
