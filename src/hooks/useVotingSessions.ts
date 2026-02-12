"use client";

import { useEffect, useRef, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  Unsubscribe,
  where,
} from "firebase/firestore";
import { db } from "@/firebase";
import type {
  Proposal,
  StoredVoteOption,
  Vote,
  VotingSession,
  HydratedVoteOption,
  Voter,
} from "@/types";
import { getAuth, onAuthStateChanged } from "firebase/auth";

type UseVotingSessionsResult = {
  openVotingSessions: VotingSession[];
  completedVotingSessions: VotingSession[];
  loading: boolean;
  error: Error | null;
};

type VotingSessionDoc = Omit<
  VotingSession,
  "votingSessionId" | "voteOptions" | "votes" | "hasVoted" | "myVoteOptionId"
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

function toDateMaybe(ts: any): Date {
  return ts?.toDate?.() ?? new Date(0);
}

function mapVote(sessionId: string, data: VoteDoc): Vote {
  return {
    votingSessionId: sessionId,
    voterUid: data.voterUid,
    voteOptionId: data.voteOptionId,
    voterName: data.voterName,
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
  for (const o of opts) {
    if (o.type === "PROPOSAL") ids.push(o.proposalId);
  }
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

type SessionBase = Omit<
  VotingSession,
  "voteOptions" | "votes" | "hasVoted" | "myVoteOptionId"
> & {
  storedVoteOptions: StoredVoteOption[];
};

type MyVoteState = { hasVoted: boolean; myVoteOptionId?: string };

function receiptKey(meetingCode: string, sessionId: string) {
  return `privateVoteReceipt:${meetingCode}:${sessionId}`;
}

/**
 * PRIVATE completed requirement "fetch what I have voted":
 * This requires a receipt id somewhere. This implementation reads it from localStorage.
 * You must set it when castVote returns { privateVoterReceipt }.
 */
function getPrivateReceiptId(meetingCode: string, sessionId: string): string | null {
  try {
    return localStorage.getItem(receiptKey(meetingCode, sessionId));
  } catch {
    return null;
  }
}

export function useVotingSessions(meetingCode: string | null | undefined): UseVotingSessionsResult {
  const [openVotingSessions, setOpenVotingSessions] = useState<VotingSession[]>([]);
  const [completedVotingSessions, setCompletedVotingSessions] = useState<VotingSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const [uid, setUid] = useState<string | null>(null);

  useEffect(() => {
    const auth = getAuth();
    const unsub = onAuthStateChanged(auth, (u) => setUid(u?.uid ?? null));
    return () => unsub();
  }, []);

  const sessionsBaseRef = useRef<SessionBase[]>([]);

  // Votes and voters for completed sessions (and votes for completed private)
  const votesBySessionRef = useRef<Map<string, Vote[]>>(new Map());
  const voteUnsubsRef = useRef<Map<string, Unsubscribe>>(new Map());

  const votersBySessionRef = useRef<Map<string, Voter[]>>(new Map());
  const voterUnsubsRef = useRef<Map<string, Unsubscribe>>(new Map());

  // My state:
  // - hasVoted always from /voters/{uid} in OPEN sessions (public + private)
  // - myVoteOptionId:
  //    - PUBLIC open/completed: query votes where voterUid == uid
  //    - PRIVATE completed: get vote by receipt id from localStorage
  const myStateBySessionRef = useRef<Map<string, MyVoteState>>(new Map());
  const myVoterDocUnsubsRef = useRef<Map<string, Unsubscribe>>(new Map());
  const myPublicVoteQueryUnsubsRef = useRef<Map<string, Unsubscribe>>(new Map());

  // Proposal hydration
  const proposalsByIdRef = useRef<Map<string, Proposal>>(new Map());
  const proposalUnsubsRef = useRef<Map<string, Unsubscribe>>(new Map());

  const cleanupAll = () => {
    voteUnsubsRef.current.forEach((u) => u());
    voteUnsubsRef.current.clear();
    votesBySessionRef.current.clear();

    voterUnsubsRef.current.forEach((u) => u());
    voterUnsubsRef.current.clear();
    votersBySessionRef.current.clear();

    myVoterDocUnsubsRef.current.forEach((u) => u());
    myVoterDocUnsubsRef.current.clear();

    myPublicVoteQueryUnsubsRef.current.forEach((u) => u());
    myPublicVoteQueryUnsubsRef.current.clear();

    myStateBySessionRef.current.clear();

    proposalUnsubsRef.current.forEach((u) => u());
    proposalUnsubsRef.current.clear();
    proposalsByIdRef.current.clear();

    sessionsBaseRef.current = [];
  };

  const rehydrateAndSet = () => {
    const sessions: VotingSession[] = sessionsBaseRef.current.map((base) => {
      const voteOptions = hydrateVoteOptions(base.storedVoteOptions, proposalsByIdRef.current);
      const my = myStateBySessionRef.current.get(base.votingSessionId) ?? { hasVoted: false };
      const votes = votesBySessionRef.current.get(base.votingSessionId) ?? [];
      const voters = votersBySessionRef.current.get(base.votingSessionId) ?? [];

      return {
        label: base.label,
        votingSessionId: base.votingSessionId,
        type: base.type,
        open: base.open,
        createdAt: base.createdAt,
        closedAt: base.closedAt,
        closedBy: base.closedBy,
        votePublicity: base.votePublicity,
        voteOptions,
        proposalIds: base.proposalIds,

        // Matrix:
        // - Public open: no all-votes list (avoid permissions + intended privacy while open)
        // - Public completed: include all votes
        // - Private open: no votes
        // - Private completed: include all votes
        votes:
          (base.votePublicity === "PUBLIC" && base.open === false) ||
            (base.votePublicity === "PRIVATE" && base.open === false)
            ? votes
            : [],

        // UI fields
        hasVoted: my.hasVoted,
        myVoteOptionId: my.myVoteOptionId,

        // Non-typed extra for completed public sessions
        voters:
          base.votePublicity === "PUBLIC" && base.open === false
            ? voters
            : [],
      };
    });

    setOpenVotingSessions(sessions.filter((s) => s.open));
    setCompletedVotingSessions(sessions.filter((s) => !s.open));
  };

  useEffect(() => {
    return () => cleanupAll();
  }, []);

  useEffect(() => {
    if (!meetingCode) {
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
      async (qs) => {
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
            proposalIds: data.proposalIds
          });
        });

        sessionsBaseRef.current = bases;

        const sessionIdsNow = new Set(bases.map((b) => b.votingSessionId));

        // Cleanup removed sessions
        voteUnsubsRef.current.forEach((unsub, sessionId) => {
          if (!sessionIdsNow.has(sessionId)) {
            unsub();
            voteUnsubsRef.current.delete(sessionId);
            votesBySessionRef.current.delete(sessionId);
          }
        });

        voterUnsubsRef.current.forEach((unsub, sessionId) => {
          if (!sessionIdsNow.has(sessionId)) {
            unsub();
            voterUnsubsRef.current.delete(sessionId);
            votersBySessionRef.current.delete(sessionId);
          }
        });

        myVoterDocUnsubsRef.current.forEach((unsub, sessionId) => {
          if (!sessionIdsNow.has(sessionId)) {
            unsub();
            myVoterDocUnsubsRef.current.delete(sessionId);
            myStateBySessionRef.current.delete(sessionId);
          }
        });

        myPublicVoteQueryUnsubsRef.current.forEach((unsub, sessionId) => {
          if (!sessionIdsNow.has(sessionId)) {
            unsub();
            myPublicVoteQueryUnsubsRef.current.delete(sessionId);
            const cur = myStateBySessionRef.current.get(sessionId);
            if (cur) myStateBySessionRef.current.set(sessionId, { hasVoted: cur.hasVoted });
          }
        });

        // Attach per-session listeners following your matrix
        for (const b of bases) {
          const sessionId = b.votingSessionId;

          const isPublic = b.votePublicity === "PUBLIC";
          const isPrivate = b.votePublicity === "PRIVATE";
          const isOpen = b.open === true;
          const isCompleted = b.open === false;

          // 1) Public + Open: fetch hasVoted and myVoteOptionId
          // 2) Private + Open: fetch hasVoted
          // We implement hasVoted for all OPEN sessions using /voters/{uid}
          if (uid && isOpen && !myVoterDocUnsubsRef.current.has(sessionId)) {
            const voterDocRef = doc(db, "meetings", meetingCode, "votingSessions", sessionId, "voters", uid);

            const unsubVoter = onSnapshot(
              voterDocRef,
              { includeMetadataChanges: true },
              (snap) => {
                const hasVoted = snap.exists();
                const prev = myStateBySessionRef.current.get(sessionId);

                myStateBySessionRef.current.set(sessionId, {
                  hasVoted,
                  myVoteOptionId: prev?.myVoteOptionId,
                });

                // Public + Open: also subscribe to my vote query when hasVoted
                if (isPublic) {
                  if (hasVoted && !myPublicVoteQueryUnsubsRef.current.has(sessionId)) {
                    const votesCol = collection(db, "meetings", meetingCode, "votingSessions", sessionId, "votes");
                    const myVoteQ = query(votesCol, where("voterUid", "==", uid));

                    const unsubMyVote = onSnapshot(
                      myVoteQ,
                      { includeMetadataChanges: true },
                      (voteSnap) => {
                        const first = voteSnap.docs[0];
                        const myVoteOptionId = first?.data()?.voteOptionId as string | undefined;

                        const cur = myStateBySessionRef.current.get(sessionId) ?? { hasVoted };
                        myStateBySessionRef.current.set(sessionId, {
                          hasVoted: cur.hasVoted,
                          myVoteOptionId,
                        });

                        rehydrateAndSet();
                      },
                      (err) => {
                        setError(err as Error);
                      }
                    );

                    myPublicVoteQueryUnsubsRef.current.set(sessionId, unsubMyVote);
                  }

                  if (!hasVoted && myPublicVoteQueryUnsubsRef.current.has(sessionId)) {
                    myPublicVoteQueryUnsubsRef.current.get(sessionId)?.();
                    myPublicVoteQueryUnsubsRef.current.delete(sessionId);
                    const cur = myStateBySessionRef.current.get(sessionId);
                    if (cur) myStateBySessionRef.current.set(sessionId, { hasVoted: cur.hasVoted });
                  }
                }

                rehydrateAndSet();
              },
              (err) => {
                setError(err as Error);
              }
            );

            myVoterDocUnsubsRef.current.set(sessionId, unsubVoter);
          }

          // Completed sessions: the open-voter-doc listener is not needed.
          // It is safe to leave it; but you asked for specific behavior. We turn it off when completed.
          if (isCompleted && myVoterDocUnsubsRef.current.has(sessionId)) {
            myVoterDocUnsubsRef.current.get(sessionId)?.();
            myVoterDocUnsubsRef.current.delete(sessionId);
          }

          // Public + Completed: fetch myVoteOptionId + all votes + all voters
          if (uid && isPublic && isCompleted) {
            // my vote (public) query, even after completion
            if (!myPublicVoteQueryUnsubsRef.current.has(sessionId)) {
              const votesCol = collection(db, "meetings", meetingCode, "votingSessions", sessionId, "votes");
              const myVoteQ = query(votesCol, where("voterUid", "==", uid));

              const unsubMyVote = onSnapshot(
                myVoteQ,
                { includeMetadataChanges: true },
                (voteSnap) => {
                  const first = voteSnap.docs[0];
                  const myVoteOptionId = first?.data()?.voteOptionId as string | undefined;

                  const cur = myStateBySessionRef.current.get(sessionId) ?? { hasVoted: false };
                  myStateBySessionRef.current.set(sessionId, {
                    hasVoted: cur.hasVoted, // hasVoted may remain false for guests; acceptable
                    myVoteOptionId,
                  });

                  rehydrateAndSet();
                },
                (err) => {
                  setError(err as Error);
                }
              );

              myPublicVoteQueryUnsubsRef.current.set(sessionId, unsubMyVote);
            }

            // all votes
            if (!voteUnsubsRef.current.has(sessionId)) {
              const votesCol = collection(db, "meetings", meetingCode, "votingSessions", sessionId, "votes");
              const votesQ = query(votesCol);

              const unsubVotes = onSnapshot(
                votesQ,
                { includeMetadataChanges: true },
                (votesSnap) => {
                  const votes: Vote[] = [];
                  votesSnap.forEach((vd) => votes.push(mapVote(sessionId, vd.data({ serverTimestamps: "estimate" }) as VoteDoc)));
                  votesBySessionRef.current.set(sessionId, votes);
                  rehydrateAndSet();
                },
                (err) => {
                  setError(err as Error);
                }
              );

              voteUnsubsRef.current.set(sessionId, unsubVotes);
            }

            // all voters
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
                (err) => {
                  setError(err as Error);
                }
              );

              voterUnsubsRef.current.set(sessionId, unsubVoters);
            }
          }

          // Private + Completed: fetch myVoteOptionId + all votes, but not voters
          if (uid && isPrivate && isCompleted) {
            // Do not subscribe voters list
            if (voterUnsubsRef.current.has(sessionId)) {
              voterUnsubsRef.current.get(sessionId)?.();
              voterUnsubsRef.current.delete(sessionId);
              votersBySessionRef.current.delete(sessionId);
            }

            // All votes
            if (!voteUnsubsRef.current.has(sessionId)) {
              const votesCol = collection(db, "meetings", meetingCode, "votingSessions", sessionId, "votes");
              const votesQ = query(votesCol);

              const unsubVotes = onSnapshot(
                votesQ,
                { includeMetadataChanges: true },
                (votesSnap) => {
                  const votes: Vote[] = [];
                  votesSnap.forEach((vd) => votes.push(mapVote(sessionId, vd.data({ serverTimestamps: "estimate" }) as VoteDoc)));
                  votesBySessionRef.current.set(sessionId, votes);
                  rehydrateAndSet();
                },
                (err) => {
                  setError(err as Error);
                }
              );

              voteUnsubsRef.current.set(sessionId, unsubVotes);
            }

            // My vote (private) by receipt id
            // This cannot be done by query if private votes do not store voterUid.
            // It requires a receipt stored locally (or some other private mapping).
            const receiptId = getPrivateReceiptId(meetingCode, sessionId);
            if (receiptId) {
              const voteDocRef = doc(db, "meetings", meetingCode, "votingSessions", sessionId, "votes", receiptId);

              // One-time read is enough (vote never changes). If you prefer live, replace with onSnapshot.
              getDoc(voteDocRef)
                .then((snap) => {
                  if (!snap.exists()) return;
                  const v = snap.data({ serverTimestamps: "estimate" }) as VoteDoc;
                  const myVoteOptionId = v?.voteOptionId as string | undefined;

                  const cur = myStateBySessionRef.current.get(sessionId) ?? { hasVoted: false };
                  myStateBySessionRef.current.set(sessionId, {
                    hasVoted: cur.hasVoted,
                    myVoteOptionId,
                  });

                  rehydrateAndSet();
                })
                .catch((err) => {
                  setError(err as Error);
                });
            } else {
              // No receipt: cannot fetch my vote for private sessions.
              const cur = myStateBySessionRef.current.get(sessionId) ?? { hasVoted: false };
              myStateBySessionRef.current.set(sessionId, { hasVoted: cur.hasVoted });
            }

            // hasVoted is not required by your matrix for private completed, but keep it if already present
          }

          // Public + Open: do NOT subscribe to all votes or all voters
          if (isPublic && isOpen) {
            if (voteUnsubsRef.current.has(sessionId)) {
              voteUnsubsRef.current.get(sessionId)?.();
              voteUnsubsRef.current.delete(sessionId);
              votesBySessionRef.current.delete(sessionId);
            }
            if (voterUnsubsRef.current.has(sessionId)) {
              voterUnsubsRef.current.get(sessionId)?.();
              voterUnsubsRef.current.delete(sessionId);
              votersBySessionRef.current.delete(sessionId);
            }
          }

          // Private + Open: do NOT subscribe to votes or voters
          if (isPrivate && isOpen) {
            if (voteUnsubsRef.current.has(sessionId)) {
              voteUnsubsRef.current.get(sessionId)?.();
              voteUnsubsRef.current.delete(sessionId);
              votesBySessionRef.current.delete(sessionId);
            }
            if (voterUnsubsRef.current.has(sessionId)) {
              voterUnsubsRef.current.get(sessionId)?.();
              voterUnsubsRef.current.delete(sessionId);
              votersBySessionRef.current.delete(sessionId);
            }
          }
        }

        // Proposal hydration listeners
        const neededProposalIds = new Set<string>();
        for (const b of bases) {
          for (const pid of collectProposalIdsFromOptions(b.storedVoteOptions)) {
            neededProposalIds.add(pid);
          }
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
            (err) => {
              setError(err as Error);
            }
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
  }, [meetingCode, uid]);

  return { openVotingSessions, completedVotingSessions, loading, error };
}
