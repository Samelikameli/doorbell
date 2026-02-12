// hooks/useAdminMeetings.ts
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { User } from "firebase/auth";
import {
  collectionGroup,
  doc,
  onSnapshot,
  query,
  where,
  type DocumentData,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/firebase";
import type { Meeting } from "@/types";

type UseAdminMeetingsResult = {
  meetings: Meeting[];
  loading: boolean;
  error: Error | null;
};

function isPermissionError(e: unknown): boolean {
  const anyE = e as any;
  const code = String(anyE?.code ?? "");
  const msg = String(anyE?.message ?? "").toLowerCase();
  return code.includes("permission") || msg.includes("missing or insufficient permissions");
}

function toDateMaybe(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v?.toDate === "function") return v.toDate(); // Firestore Timestamp
  return null;
}

function meetingFromDoc(id: string, data: DocumentData): Meeting {
  const createdAt = toDateMaybe(data.createdAt) ?? new Date(0);
  const code: string = String(data.code ?? id);

  const requireLogin = Boolean(data.requireLogin ?? data.requireAuth ?? false);
  const requireAuth = Boolean(data.requireAuth ?? data.requireLogin ?? false);

  return {
    code,
    name: String(data.name ?? ""),
    startsAt: toDateMaybe(data.startsAt),
    createdAt,
    createdBy: String(data.createdBy ?? ""),
    requireLogin,
    isPublic: Boolean(data.isPublic ?? false),
    defaultSpeechType: String(data.defaultSpeechType ?? ""),
    requireAuth,
  };
}

function uniqStable(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Live list of meetings where the current user is an admin.
 *
 * Fix 2 approach:
 * 1) collectionGroup(meetingAdmins) filtered by uid => meetingIds
 * 2) subscribe to each meeting doc individually via onSnapshot(doc(...))
 *
 * This avoids "list" permission requirements on /meetings and only needs "get".
 */
export function useAdminMeetings(
  user: User | null | undefined,
  userLoading: boolean
): UseAdminMeetingsResult {
  const [meetingIds, setMeetingIds] = useState<string[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  // Used to ignore late snapshots after auth changes
  const tokenRef = useRef(0);

  /* ---------------- 1) Admin markers => meetingIds ---------------- */

  useEffect(() => {
    const token = ++tokenRef.current;

    console.log("[useAdminMeetings] ADMIN effect", {
      userLoading,
      uid: user?.uid,
    });

    if (userLoading) {
      setLoading(true);
      setError(null);
      setMeetingIds([]);
      setMeetings([]);
      return;
    }

    if (!user) {
      setLoading(false);
      setError(null);
      setMeetingIds([]);
      setMeetings([]);
      return;
    }

    setLoading(true);
    setError(null);
    setMeetingIds([]);
    setMeetings([]);

    const q = query(collectionGroup(db, "meetingAdmins"), where("uid", "==", user.uid));

    const unsub = onSnapshot(
      q,
      (snap) => {
        if (tokenRef.current !== token) return;

        const ids = snap.docs
          // meetings/{meetingId}/meetingAdmins/{adminDocId}
          .map((d) => d.ref.parent.parent?.id)
          .filter((x): x is string => Boolean(x));

        const uniq = uniqStable(ids);

        console.log("[useAdminMeetings] ADMIN snapshot", {
          fromCache: snap.metadata.fromCache,
          size: snap.size,
          meetingIds: uniq,
        });

        setMeetingIds(uniq);

        // If no meetings, loading is done now.
        if (uniq.length === 0) {
          setMeetings([]);
          setLoading(false);
        }
      },
      (e) => {
        if (tokenRef.current !== token) return;

        console.error("[useAdminMeetings] ADMIN error", e);

        const err = e as Error;
        if (isPermissionError(e)) {
          (err as any).message = `Missing or insufficient permissions: ${String((e as any)?.message ?? "")}`;
        }

        setMeetingIds([]);
        setMeetings([]);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [user, userLoading]);

  // Keep stable dependency (string key) to avoid resubscribing doc listeners unnecessarily
  const meetingIdsKey = useMemo(() => meetingIds.join("|"), [meetingIds]);

  /* ---------------- 2) meetingIds => per-doc onSnapshot(get) ---------------- */

  useEffect(() => {
    const token = tokenRef.current;

    console.log("[useAdminMeetings] MEETINGS effect", {
      meetingIds,
    });

    if (meetingIds.length === 0) {
      return;
    }

    setLoading(true);
    setError(null);

    const byId = new Map<string, Meeting>();
    const unsubs: Unsubscribe[] = [];

    const recompute = () => {
      if (tokenRef.current !== token) return;

      const list = Array.from(byId.values());
      list.sort((a, b) => {
        const at = a.startsAt?.getTime() ?? Number.POSITIVE_INFINITY;
        const bt = b.startsAt?.getTime() ?? Number.POSITIVE_INFINITY;
        if (at !== bt) return at - bt;

        const ac = a.createdAt?.getTime() ?? 0;
        const bc = b.createdAt?.getTime() ?? 0;
        if (ac !== bc) return bc - ac;

        return a.code.localeCompare(b.code);
      });

      setMeetings(list);
      setLoading(false);
    };

    for (const id of meetingIds) {
      console.log("[useAdminMeetings] MEETINGS subscribe doc", id);

      const ref = doc(db, "meetings", id);

      const unsub = onSnapshot(
        ref,
        (snap) => {
          if (tokenRef.current !== token) return;

          console.log("[useAdminMeetings] MEETINGS doc snapshot", {
            id,
            exists: snap.exists(),
            fromCache: snap.metadata.fromCache,
          });

          if (snap.exists()) {
            byId.set(snap.id, meetingFromDoc(snap.id, snap.data()));
          } else {
            byId.delete(id);
          }

          recompute();
        },
        (e) => {
          if (tokenRef.current !== token) return;

          console.error("[useAdminMeetings] MEETINGS doc error", { id, error: e });

          const err = e as Error;
          if (isPermissionError(e)) {
            (err as any).message = `Missing or insufficient permissions: ${String((e as any)?.message ?? "")}`;
          }

          setMeetings([]);
          setError(err);
          setLoading(false);
        }
      );

      unsubs.push(unsub);
    }

    return () => {
      console.log("[useAdminMeetings] MEETINGS cleanup", { meetingIds });
      unsubs.forEach((u) => u());
    };
    // meetingIdsKey changes only when the ids set changes
  }, [meetingIdsKey]);

  return { meetings, loading, error };
}
