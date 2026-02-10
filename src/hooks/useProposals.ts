// hooks/useProposals.ts
"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "@/firebase";
import type { Proposal } from "@/types";

type UseProposalsResult = {
  openProposals: Proposal[];
  acceptedProposals: Proposal[];
  rejectedProposals: Proposal[];
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
  const [acceptedProposals, setAcceptedProposals] = useState<Proposal[]>([]);
  const [rejectedProposals, setRejectedProposals] = useState<Proposal[]>([]);
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

    const unsubscribeOpen = onSnapshot(
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

    const closedQ = query(
      proposalsCol,
      where("open", "==", false),
      orderBy("createdAt", "asc")
    );

    const unsubscribeClosed = onSnapshot(
      closedQ,
      { includeMetadataChanges: true },
      (qs) => {
        const accepted: Proposal[] = [];
        const rejected: Proposal[] = [];
        qs.forEach((d) => {
          const p = mapProposal(d);
          if (p.closedAs === "ACCEPTED") accepted.push(p);
          else if (p.closedAs === "REJECTED") rejected.push(p);
        });
        setAcceptedProposals(accepted);
        setRejectedProposals(rejected);
      },
      (err) => {
        setError(err as Error);
      }
    );

    return () => {
      unsubscribeOpen();
      unsubscribeClosed();
    };

  }, [meetingCode]);

  return { openProposals, acceptedProposals, rejectedProposals, loading, error };
}
