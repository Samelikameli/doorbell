"use client";

import { useEffect, useMemo, useState } from "react";
import { db } from "@/firebase";
import { collection, onSnapshot, query } from "firebase/firestore";

export type OnlineNowUser = {
  sessionId: string;
  name: string;
  uid: string | null;
  lastSeenMs: number;
};

export function useOnlineNow(meetingCode: string | null | undefined, timeoutMs = 60_000) {
  const [raw, setRaw] = useState<OnlineNowUser[]>([]);
  const [now, setNow] = useState(() => Date.now());

  // Local tick so users drop offline without any extra writes
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 5_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!meetingCode) {
      setRaw([]);
      return;
    }

    const q = query(collection(db, "meetings", meetingCode, "presence"));

    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map((d) => {
        const data = d.data() as any;
        const lastSeenMs =
          typeof data.lastSeen?.toMillis === "function" ? data.lastSeen.toMillis() : 0;

        return {
          sessionId: d.id,
          name: String(data.name ?? ""),
          uid: data.uid ?? null,
          lastSeenMs,
        };
      });

      setRaw(items);
    });

    return () => unsub();
  }, [meetingCode]);

  const online = useMemo(() => {
    const cutoff = now - timeoutMs;
    return raw
      .filter((u) => u.name.trim() && u.lastSeenMs >= cutoff)
      .sort((a, b) => b.lastSeenMs - a.lastSeenMs);
  }, [raw, now, timeoutMs]);

  return { online };
}
