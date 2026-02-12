// hooks/useMeeting.ts
"use client";

import { useEffect, useRef, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/firebase";
import type { Meeting } from "@/types";

type UseMeetingResult = {
  meeting: Meeting | null;
  loading: boolean;
  error: Error | null;
  exists: boolean | null; // null = unknown, true/false after first snapshot
};

function mapMeeting(docSnap: any): Meeting {
  const data = docSnap.data({ serverTimestamps: "estimate" });

  return {
    ...data,
    code: docSnap.id, // ensure code is present even if not stored in doc
    createdAt: data.createdAt?.toDate?.() ?? new Date(0),
  } as Meeting;
}

export function useMeeting(meetingCode: string | null | undefined): UseMeetingResult {
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [exists, setExists] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Prevent older listeners from writing after meetingCode changes quickly.
  const subTokenRef = useRef(0);

  useEffect(() => {
    if (!meetingCode) {
      setMeeting(null);
      setExists(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    setExists(null);
    setMeeting(null);

    const token = ++subTokenRef.current;
    const meetingRef = doc(db, "meetings", meetingCode);

    const unsub = onSnapshot(
      meetingRef,
      { includeMetadataChanges: true },
      (snap) => {
        if (subTokenRef.current !== token) return;

        if (!snap.exists()) {
          setMeeting(null);
          setExists(false);
          setLoading(false);
          return;
        }

        setMeeting(mapMeeting(snap));
        setExists(true);
        setLoading(false);
      },
      (err) => {
        if (subTokenRef.current !== token) return;
        setError(err as Error);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [meetingCode]);

  return { meeting, loading, error, exists };
}
