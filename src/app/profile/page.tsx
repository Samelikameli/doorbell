"use client";

import { useUser } from "@/context/UserContext";
import { Button } from "@heroui/react";
import { collectionGroup, documentId, onSnapshot, query, where } from "firebase/firestore";
import { useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";
import { db } from "@/firebase";

function isPermissionError(e: unknown): boolean {
  const anyE = e as any;
  const code = String(anyE?.code ?? "");
  const msg = String(anyE?.message ?? "").toLowerCase();
  return code.includes("permission") || msg.includes("missing or insufficient permissions");
}

export default function Profile() {
  const { user, loading: userLoading } = useUser();
  const router = useRouter();

  const [meetingIds, setMeetingIds] = useState<string[]>([]);
  const [err, setErr] = useState<string>("");

  useEffect(() => {
    if (!userLoading && user && user.isAnonymous) {
      router.push("/login?redirect=/profile");
    }
  }, [user, userLoading, router]);

  useEffect(() => {
    if (!user) return;

    setErr("");
    setMeetingIds([]);

    // This matches rules that allow listing meetingAdmins when resource.data.uid == request.auth.uid.
    // Each admin marker doc should contain: { uid: "<same uid as doc id>" }.

    const q = query(
      collectionGroup(db, "meetingAdmins"),
      where("uid", "==", user.uid)
    );


    // eslint-disable-next-line no-console
    console.debug("[Profile] subscribe meetingAdmins group", { uid: user.uid });

    const unsub = onSnapshot(
      q,
      (snap) => {
        console.log("fromCache", snap.metadata.fromCache, "size", snap.size);
        console.log("paths", snap.docs.map(d => d.ref.path));
      },
      (e) => console.error("listener error", e)
    );


    return () => unsub();
  }, [user]);

  return (
    <div className="h-dvh flex flex-col bg-background text-foreground overflow-hidden">
      <div className="flex flex-row px-4 py-3 border-b border-border shrink-0 gap-4">
        <div>Oma profiili</div>
      </div>

      <div className="flex flex-1 min-w-0 min-h-0 flex-col border border-border overflow-hidden">
        <div className="flex flex-col">
          <h1 className="text-2xl font-bold">Kokoukset</h1>

          <div className="w-full max-w-2xl border border-border rounded p-4">
            <div className="font-semibold mb-2">Kokoukset, joissa olet ylläpitäjä</div>

            {err ? (
              <p className="text-sm text-danger">{err}</p>
            ) : meetingIds.length === 0 ? (
              <p className="text-sm opacity-70">Ei ylläpidettäviä kokouksia.</p>
            ) : (
              <ul className="text-sm space-y-1">
                {meetingIds.map((id) => (
                  <li key={id} className="flex items-center justify-between gap-3">
                    <span className="font-medium">{id}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onPress={() => router.push(`/meetings/${id}`)}
                    >
                      Avaa
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
