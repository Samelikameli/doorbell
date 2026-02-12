// hooks/useMeetingAdmin.ts
"use client";

import { useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/firebase";

type UseMeetingAdminResult = {
  isAdmin: boolean;
  loading: boolean;
  error: Error | null;
};

export function useMeetingAdmin(
  meetingId: string | null | undefined,
  user: User | null | undefined,
  userLoading: boolean
): UseMeetingAdminResult {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Prevent stale snapshot updates
  const tokenRef = useRef(0);

  useEffect(() => {
    const token = ++tokenRef.current;

    if (userLoading) {
      setLoading(true);
      setIsAdmin(false);
      setError(null);
      return;
    }

    if (!user || !meetingId) {
      setLoading(false);
      setIsAdmin(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    const ref = doc(db, "meetings", meetingId, "meetingAdmins", user.uid);

    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        if (tokenRef.current !== token) return;
        setIsAdmin(snap.exists());
        setLoading(false);
      },
      (e) => {
        if (tokenRef.current !== token) return;
        setIsAdmin(false);
        setError(e as Error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [meetingId, user, userLoading]);

  return { isAdmin, loading, error };
}
