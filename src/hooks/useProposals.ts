// hooks/useProposals.ts
"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "@/firebase";
import type { Proposal } from "@/types";

type UseProposalsResult = {
  openProposals: Proposal[];
  loading: boolean;
  error: Error | null;
};

function mapProposal(docSnap: any): Proposal {
  const data = docSnap.data({ serverTimestamps: "estimate" });

  return {
    ...data,
    id: docSnap.id,
    createdAt: data.createdAt?.toDate?.() ?? new Date(0),
  } as Proposal;
}

export function useProposals(meetingCode: string | null | undefined): UseProposalsResult {
  const [openProposals, setOpenProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!meetingCode) {
      setOpenProposals([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    const proposalsCol = collection(db, "meetings", meetingCode, "proposals");

    const openQ = query(
      proposalsCol,
      where("open", "==", true),
      orderBy("createdAt", "asc")
    );

    const unsubscribe = onSnapshot(
      openQ,
      { includeMetadataChanges: true },
      (qs) => {
        const items: Proposal[] = [];
        qs.forEach((d) => items.push(mapProposal(d)));
        setOpenProposals(items);
        setLoading(false);
      },
      (err) => {
        setError(err as Error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [meetingCode]);

  return { openProposals, loading, error };
}
