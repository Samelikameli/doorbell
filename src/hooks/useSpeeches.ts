// hooks/useSpeeches.ts
"use client";

import { useEffect, useState } from "react";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  Query,
  DocumentData,
} from "firebase/firestore";
import { db } from "@/firebase";
import type { Speech } from "@/types";

type UseSpeechesResult = {
  upcomingSpeeches: Speech[];
  ongoingSpeeches: Speech[];
  completedSpeeches: Speech[];
  loading: boolean;
  error: Error | null;
};

function mapSpeech(docSnap: any): Speech {
  const data = docSnap.data({ serverTimestamps: "estimate" });

  return {
    ...data,
    id: docSnap.id,
    createdAt: data.createdAt?.toDate?.() ?? new Date(0),
    startedAt: data.startedAt?.toDate?.() ?? null,
    completedAt: data.completedAt?.toDate?.() ?? null,
  } as Speech;
}

export function useSpeeches(meetingCode: string | null | undefined, enabled: boolean): UseSpeechesResult {
  const [upcomingSpeeches, setUpcomingSpeeches] = useState<Speech[]>([]);
  const [ongoingSpeeches, setOngoingSpeeches] = useState<Speech[]>([]);
  const [completedSpeeches, setCompletedSpeeches] = useState<Speech[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!meetingCode || !enabled) {
      setUpcomingSpeeches([]);
      setOngoingSpeeches([]);
      setCompletedSpeeches([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    const speechesCol = collection(db, "meetings", meetingCode, "speeches");

    const upcomingQ = query(
      speechesCol,
      where("completed", "==", false),
      where("started", "==", false),
      orderBy("priority"),
      orderBy("createdAt", "asc")
    );

    const ongoingQ = query(
      speechesCol,
      where("completed", "==", false),
      where("started", "==", true),
      orderBy("startedAt", "desc")
    );

    const completedQ = query(
      speechesCol,
      where("completed", "==", true),
      orderBy("completedAt", "desc"),
      limit(50)
    );

    const unsubUpcoming = onSnapshot(
      upcomingQ,
      { includeMetadataChanges: true },
      (qs) => {
        const items: Speech[] = [];
        qs.forEach((d) => items.push(mapSpeech(d)));
        setUpcomingSpeeches(items);
      },
      (err) => setError(err as Error)
    );

    const unsubOngoing = onSnapshot(
      ongoingQ,
      { includeMetadataChanges: true },
      (qs) => {
        const items: Speech[] = [];
        qs.forEach((d) => items.push(mapSpeech(d)));
        setOngoingSpeeches(items);
      },
      (err) => setError(err as Error)
    );

    const unsubCompleted = onSnapshot(
      completedQ,
      { includeMetadataChanges: true },
      (qs) => {
        const items: Speech[] = [];
        qs.forEach((d) => items.push(mapSpeech(d)));
        setCompletedSpeeches(items);
      },
      (err) => setError(err as Error)
    );

    // Once at least one subscription is active, treat as "loaded".
    // If you want stricter loading (wait for first snapshots), track flags per listener.
    setLoading(false);

    return () => {
      unsubUpcoming();
      unsubOngoing();
      unsubCompleted();
    };
  }, [meetingCode, enabled]);

  return {
    upcomingSpeeches,
    ongoingSpeeches,
    completedSpeeches,
    loading,
    error,
  };
}
