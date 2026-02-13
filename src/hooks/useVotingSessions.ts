// hooks/useVotingSessions.ts
"use client";

import { useEffect, useRef, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  Unsubscribe,
  where,
} from "firebase/firestore";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { db } from "@/firebase";

import type {
  Proposal,
  StoredVoteOption,
  Vote,
  VotingSession,
  HydratedVoteOption,
  Voter,
} from "@/types";

type UseVotingSessionsResult = {
  openVotingSessions: VotingSession[];
  completedVotingSessions: VotingSession[];
  loading: boolean;
  error: Error | null;
};

type VotingSessionDoc = Omit<
  VotingSession,
  "votingSessionId" | "voteOptions" | "votes" | "hasVoted" | "myVoteOptionId" | "voters"
> & {
  voteOptions: StoredVoteOption[];
};

type VoteDoc = {
  voteOptionId: string;
  voterUid?: string;
  voterName?: string;
  createdAt?: any;
};

type VoterDoc = {
  voterUid?: string;
  voterName?: string;
  createdAt?: any;
};

type SessionBase = Omit<
  VotingSession,
  "voteOptions" | "votes" | "hasVoted" | "myVoteOptionId" | "voters"
> & {
  storedVoteOptions: StoredVoteOption[];
};

function toDateMaybe(ts: any): Date {
  return ts?.toDate?.() ?? new Date(0);
}

function mapVote(sessionId: string, data: VoteDoc): Vote {
  return {
    votingSessionId: sessionId,
    voterUid: data.voterUid, // PUBLIC: set, PRIVATE: undefined by design
    voteOptionId: data.voteOptionId,
    voterName: data.voterName, // PUBLIC: set, PRIVATE: undefined by design
  };
}

function mapVoter(sessionId: string, voterId: string, data: VoterDoc): Voter {
  return {
    votingSessionId: sessionId,
    voterUid: data.voterUid ?? voterId,
    voterName: data.voterName ?? "",
  };
}

function collectProposalIdsFromOptions(opts: StoredVoteOption[]): string[] {
  const ids: string[] = [];
  for (const o of opts) if (o.type === "PROPOSAL") ids.push(o.proposalId);
  return Array.from(new Set(ids));
}

function hydrateVoteOptions(
  stored: StoredVoteOption[],
  proposalsById: Map<string, Proposal>
): HydratedVoteOption[] {
  const result: HydratedVoteOption[] = [];

  for (const opt of stored) {
    if (opt.type === "PROPOSAL") {
      const proposal = proposalsById.get(opt.proposalId);
      if (!proposal) continue;

      result.push({
        id: opt.id,
        type: "PROPOSAL",
        proposalId: opt.proposalId,
        proposal,
        label: opt.label,
      });
      continue;
    }

    result.push({
      id: opt.id,
      type: "FOR-AGAINST-ABSTAIN",
      vote: opt.vote,
      label: opt.label,
    });
  }

  return result;
}

function receiptKey(meetingCode: string, sessionId: string) {
  return `privateVoteReceipt:${meetingCode}:${sessionId}`;
}

function getPrivateReceiptId(meetingCode: string, sessionId: string): string | null {
  try {
    return localStorage.getItem(receiptKey(meetingCode, sessionId));
  } catch {
    return null;
  }
}

export function useVotingSessions(
  meetingCode: string | null | undefined,
  enabled: boolean
): UseVotingSessionsResult {
  const [openVotingSessions, setOpenVotingSessions] = useState<VotingSession[]>([]);
  const [completedVotingSessions, setCompletedVotingSessions] = useState<VotingSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const [uid, setUid] = useState<string | null>(null);

  const sessionsBaseRef = useRef<SessionBase[]>([]);
  const votesBySessionRef = useRef<Map<string, Vote[]>>(new Map());
  const votersBySessionRef = useRef<Map<string, Voter[]>>(new Map());

  const voteUnsubsRef = useRef<Map<string, Unsubscribe>>(new Map());
  const voterUnsubsRef = useRef<Map<string, Unsubscribe>>(new Map());

  const proposalsByIdRef = useRef<Map<string, Proposal>>(new Map());
  const proposalUnsubsRef = useRef<Map<string, Unsubscribe>>(new Map());

  // Used for:
  // - PUBLIC + OPEN: myVoteOptionId via query (voterUid == uid)
  // - PRIVATE (open or closed): myVoteOptionId via receipt doc id
  const myVoteOptionIdRef = useRef<Map<string, string | undefined>>(new Map());
  const myVoteUnsubsRef = useRef<Map<string, Unsubscribe>>(new Map());

  useEffect(() => {
    if (!enabled) {
      setUid(null);
      return;
    }
    const auth = getAuth();
    return onAuthStateChanged(auth, (u) => setUid(u?.uid ?? null));
  }, [enabled]);

  const cleanupAll = () => {
    voteUnsubsRef.current.forEach((u) => u());
    voteUnsubsRef.current.clear();
    votesBySessionRef.current.clear();

    voterUnsubsRef.current.forEach((u) => u());
    voterUnsubsRef.current.clear();
    votersBySessionRef.current.clear();

    myVoteUnsubsRef.current.forEach((u) => u());
    myVoteUnsubsRef.current.clear();
    myVoteOptionIdRef.current.clear();

    proposalUnsubsRef.current.forEach((u) => u());
    proposalUnsubsRef.current.clear();
    proposalsByIdRef.current.clear();

    sessionsBaseRef.current = [];
  };

  const rehydrateAndSet = () => {
    const sessions: VotingSession[] = sessionsBaseRef.current.map((base) => {
      const voteOptions = hydrateVoteOptions(base.storedVoteOptions, proposalsByIdRef.current);

      const voters = votersBySessionRef.current.get(base.votingSessionId) ?? [];
      const votes = votesBySessionRef.current.get(base.votingSessionId) ?? [];

      const hasVoted = !!uid && voters.some((v) => String(v.voterUid ?? "").trim() === uid);

      // myVoteOptionId rules:
      // - PUBLIC + OPEN: from myVoteOptionIdRef (query)
      // - PUBLIC + CLOSED: derive from full votes list (no extra query)
      // - PRIVATE: from receipt doc id (myVoteOptionIdRef), if available
      let myVoteOptionId: string | undefined;

      if (base.votePublicity === "PUBLIC") {
        if (base.open === false && uid) {
          myVoteOptionId = votes.find((v) => v.voterUid === uid)?.voteOptionId;
        } else {
          myVoteOptionId = myVoteOptionIdRef.current.get(base.votingSessionId);
        }
      } else {
        myVoteOptionId = myVoteOptionIdRef.current.get(base.votingSessionId);
      }

      // Access model:
      // - OPEN: voters visible, votes hidden (except "my own vote" for PUBLIC via query)
      // - CLOSED: voters + votes visible for everyone
      const includeVotes = base.open === false;
      const includeVoters = true;

      return {
        label: base.label,
        votingSessionId: base.votingSessionId,
        type: base.type,
        open: base.open,
        createdAt: base.createdAt,
        closedAt: base.closedAt,
        closedBy: base.closedBy,
        votePublicity: base.votePublicity,
        proposalIds: base.proposalIds,
        voteOptions,

        votes: includeVotes ? votes : [],
        voters: includeVoters ? voters : [],

        hasVoted,
        myVoteOptionId,
      };
    });

    setOpenVotingSessions(sessions.filter((s) => s.open));
    setCompletedVotingSessions(sessions.filter((s) => !s.open));
  };

  useEffect(() => {
    return () => cleanupAll();
  }, []);

  useEffect(() => {
    if (!meetingCode || !enabled) {
      setOpenVotingSessions([]);
      setCompletedVotingSessions([]);
      setLoading(false);
      setError(null);
      cleanupAll();
      return;
    }

    setLoading(true);
    setError(null);
    cleanupAll();

    const sessionsCol = collection(db, "meetings", meetingCode, "votingSessions");
    const sessionsQ = query(sessionsCol, orderBy("createdAt", "desc"));

    const unsubscribeSessions = onSnapshot(
      sessionsQ,
      { includeMetadataChanges: true },
      (qs) => {
        const bases: SessionBase[] = [];

        qs.forEach((d) => {
          const data = d.data({ serverTimestamps: "estimate" }) as VotingSessionDoc;

          bases.push({
            label: data.label ?? "",
            votingSessionId: d.id,
            type: data.type,
            open: !!data.open,
            createdAt: toDateMaybe(data.createdAt),
            closedAt: data.closedAt ? toDateMaybe(data.closedAt) : undefined,
            closedBy: data.closedBy,
            storedVoteOptions: Array.isArray(data.voteOptions) ? data.voteOptions : [],
            votePublicity: data.votePublicity ?? "PUBLIC",
            proposalIds: data.proposalIds,
          });
        });

        sessionsBaseRef.current = bases;

        const sessionIdsNow = new Set(bases.map((b) => b.votingSessionId));

        const cleanupMissing = (
          unsubs: Map<string, Unsubscribe>,
          dataMap?: Map<string, any>,
          extraCleanup?: (sessionId: string) => void
        ) => {
          unsubs.forEach((unsub, sessionId) => {
            if (!sessionIdsNow.has(sessionId)) {
              unsub();
              unsubs.delete(sessionId);
              dataMap?.delete(sessionId);
              extraCleanup?.(sessionId);
            }
          });
        };

        cleanupMissing(voteUnsubsRef.current, votesBySessionRef.current);
        cleanupMissing(voterUnsubsRef.current, votersBySessionRef.current);
        cleanupMissing(myVoteUnsubsRef.current, undefined, (sessionId) => {
          myVoteOptionIdRef.current.delete(sessionId);
        });

        // Ensure per-session listeners using the access model
        for (const b of bases) {
          const sessionId = b.votingSessionId;
          const isOpen = b.open === true;
          const isClosed = b.open === false;

          // VOTERS: always subscribe (open and closed), for everyone
          if (!voterUnsubsRef.current.has(sessionId)) {
            const votersCol = collection(db, "meetings", meetingCode, "votingSessions", sessionId, "voters");
            const votersQ = query(votersCol);

            const unsubVoters = onSnapshot(
              votersQ,
              { includeMetadataChanges: true },
              (votersSnap) => {
                const voters: Voter[] = [];
                votersSnap.forEach((vd) => {
                  voters.push(mapVoter(sessionId, vd.id, vd.data({ serverTimestamps: "estimate" })));
                });
                votersBySessionRef.current.set(sessionId, voters);
                rehydrateAndSet();
              },
              (err) => setError(err as Error)
            );

            voterUnsubsRef.current.set(sessionId, unsubVoters);
          }

          // PUBLIC + OPEN: allow user to read their own vote (query voterUid == uid)
          if (isOpen) {
            // Ensure we never subscribe to ALL votes while open
            if (voteUnsubsRef.current.has(sessionId)) {
              voteUnsubsRef.current.get(sessionId)?.();
              voteUnsubsRef.current.delete(sessionId);
              votesBySessionRef.current.delete(sessionId);
            }

            const isPublic = b.votePublicity === "PUBLIC";
            if (isPublic && uid) {
              if (!myVoteUnsubsRef.current.has(sessionId)) {
                const votesCol = collection(db, "meetings", meetingCode, "votingSessions", sessionId, "votes");
                const myVoteQ = query(votesCol, where("voterUid", "==", uid), limit(1));

                const unsubMyVote = onSnapshot(
                  myVoteQ,
                  { includeMetadataChanges: true },
                  (snap) => {
                    const first = snap.docs[0];
                    const myVoteOptionId = first?.data()?.voteOptionId as string | undefined;
                    myVoteOptionIdRef.current.set(sessionId, myVoteOptionId);
                    rehydrateAndSet();
                  },
                  (err) => setError(err as Error)
                );

                myVoteUnsubsRef.current.set(sessionId, unsubMyVote);
              }
            } else {
              // Not public or no uid: ensure no myVote query is active
              if (myVoteUnsubsRef.current.has(sessionId)) {
                myVoteUnsubsRef.current.get(sessionId)?.();
                myVoteUnsubsRef.current.delete(sessionId);
              }
              myVoteOptionIdRef.current.delete(sessionId);
            }

            // PRIVATE + OPEN: optional my vote by receipt (works with your CF return)
            if (b.votePublicity === "PRIVATE") {
              const receiptId = getPrivateReceiptId(meetingCode, sessionId);
              if (receiptId) {
                const voteDocRef = doc(db, "meetings", meetingCode, "votingSessions", sessionId, "votes", receiptId);
                getDoc(voteDocRef)
                  .then((snap) => {
                    if (!snap.exists()) return;
                    const v = snap.data({ serverTimestamps: "estimate" }) as VoteDoc;
                    myVoteOptionIdRef.current.set(sessionId, v?.voteOptionId);
                    rehydrateAndSet();
                  })
                  .catch((err) => setError(err as Error));
              }
            }
          }

          // CLOSED: subscribe to ALL votes for everyone
          if (isClosed) {
            // No need for the open-only myVote query once closed (we derive from full votes)
            if (myVoteUnsubsRef.current.has(sessionId)) {
              myVoteUnsubsRef.current.get(sessionId)?.();
              myVoteUnsubsRef.current.delete(sessionId);
            }

            if (!voteUnsubsRef.current.has(sessionId)) {
              const votesCol = collection(db, "meetings", meetingCode, "votingSessions", sessionId, "votes");
              const votesQ = query(votesCol);

              const unsubVotes = onSnapshot(
                votesQ,
                { includeMetadataChanges: true },
                (votesSnap) => {
                  const votes: Vote[] = [];
                  votesSnap.forEach((vd) => {
                    votes.push(mapVote(sessionId, vd.data({ serverTimestamps: "estimate" }) as VoteDoc));
                  });
                  votesBySessionRef.current.set(sessionId, votes);
                  rehydrateAndSet();
                },
                (err) => setError(err as Error)
              );

              voteUnsubsRef.current.set(sessionId, unsubVotes);
            }

            // PRIVATE (closed): keep receipt-based "myVoteOptionId" (votes do not contain voterUid)
            if (b.votePublicity === "PRIVATE") {
              const receiptId = getPrivateReceiptId(meetingCode, sessionId);
              if (receiptId) {
                const voteDocRef = doc(db, "meetings", meetingCode, "votingSessions", sessionId, "votes", receiptId);
                getDoc(voteDocRef)
                  .then((snap) => {
                    if (!snap.exists()) return;
                    const v = snap.data({ serverTimestamps: "estimate" }) as VoteDoc;
                    myVoteOptionIdRef.current.set(sessionId, v?.voteOptionId);
                    rehydrateAndSet();
                  })
                  .catch((err) => setError(err as Error));
              } else {
                // No receipt means "myVoteOptionId" is unknown for PRIVATE
                myVoteOptionIdRef.current.delete(sessionId);
              }
            } else {
              // PUBLIC (closed): derived from votes list, no need to store
              myVoteOptionIdRef.current.delete(sessionId);
            }
          }
        }

        // Proposal hydration
        const neededProposalIds = new Set<string>();
        for (const b of bases) {
          for (const pid of collectProposalIdsFromOptions(b.storedVoteOptions)) neededProposalIds.add(pid);
        }

        proposalUnsubsRef.current.forEach((unsub, proposalId) => {
          if (!neededProposalIds.has(proposalId)) {
            unsub();
            proposalUnsubsRef.current.delete(proposalId);
            proposalsByIdRef.current.delete(proposalId);
          }
        });

        for (const proposalId of neededProposalIds) {
          if (proposalUnsubsRef.current.has(proposalId)) continue;

          const proposalRef = doc(db, "meetings", meetingCode, "proposals", proposalId);

          const unsubProposal = onSnapshot(
            proposalRef,
            { includeMetadataChanges: true },
            (snap) => {
              if (!snap.exists()) {
                proposalsByIdRef.current.delete(proposalId);
                rehydrateAndSet();
                return;
              }

              const pdata = snap.data({ serverTimestamps: "estimate" });

              const proposal: Proposal = {
                proposerUid: pdata.proposerUid ?? "",
                proposerName: pdata.proposerName ?? "",
                description: pdata.description ?? "",
                createdAt: toDateMaybe(pdata.createdAt),
                id: snap.id,
                supporterUids: Array.isArray(pdata.supporterUids) ? pdata.supporterUids : [],
                supporterNames: Array.isArray(pdata.supporterNames) ? pdata.supporterNames : [],
                open: !!pdata.open,
                baseProposal: !!pdata.baseProposal,
              };

              proposalsByIdRef.current.set(proposalId, proposal);
              rehydrateAndSet();
            },
            (err) => setError(err as Error)
          );

          proposalUnsubsRef.current.set(proposalId, unsubProposal);
        }

        rehydrateAndSet();
        setLoading(false);
      },
      (err) => {
        setError(err as Error);
        setLoading(false);
      }
    );

    return () => {
      unsubscribeSessions();
      cleanupAll();
    };
  }, [meetingCode, enabled, uid]);

  return { openVotingSessions, completedVotingSessions, loading, error };
}
