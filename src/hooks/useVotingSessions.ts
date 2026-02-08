"use client";

import { useEffect, useRef, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  Unsubscribe,
} from "firebase/firestore";
import { db } from "@/firebase";
import type { Proposal, StoredVoteOption, Vote, VotingSession, HydratedVoteOption } from "@/types";

type UseVotingSessionsResult = {
  openVotingSessions: VotingSession[];
  completedVotingSessions: VotingSession[];
  loading: boolean;
  error: Error | null;
};

type VotingSessionDoc = {
  meetingCode: string;
  type: "ONE-OF-PROPOSALS" | "FOR-AGAINST-ABSTAIN";
  open: boolean;
  createdAt?: any;
  voteOptions: StoredVoteOption[];
};

type VoteDoc = {
  voterUid: string;
  voteOptionId: string;
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
    createdAt: toDateMaybe(data.createdAt),
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
      if (!proposal) continue; // will hydrate once proposal snapshot arrives

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

type SessionBase = {
  votingSessionId: string;
  meetingCode: string;
  type: VotingSession["type"];
  open: boolean;
  createdAt: Date;
  storedVoteOptions: StoredVoteOption[];
};

export function useVotingSessions(meetingCode: string | null | undefined): UseVotingSessionsResult {
  const [openVotingSessions, setOpenVotingSessions] = useState<VotingSession[]>([]);
  const [completedVotingSessions, setCompletedVotingSessions] = useState<VotingSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const sessionsBaseRef = useRef<SessionBase[]>([]);
  const votesBySessionRef = useRef<Map<string, Vote[]>>(new Map());
  const voteUnsubsRef = useRef<Map<string, Unsubscribe>>(new Map());

  const proposalsByIdRef = useRef<Map<string, Proposal>>(new Map());
  const proposalUnsubsRef = useRef<Map<string, Unsubscribe>>(new Map());

  const cleanupAll = () => {
    voteUnsubsRef.current.forEach((u) => u());
    voteUnsubsRef.current.clear();
    votesBySessionRef.current.clear();

    proposalUnsubsRef.current.forEach((u) => u());
    proposalUnsubsRef.current.clear();
    proposalsByIdRef.current.clear();

    sessionsBaseRef.current = [];
  };

  const rehydrateAndSet = () => {
    const sessions: VotingSession[] = sessionsBaseRef.current.map((base) => {
      const votes = votesBySessionRef.current.get(base.votingSessionId) ?? [];
      const voteOptions = hydrateVoteOptions(base.storedVoteOptions, proposalsByIdRef.current);

      return {
        votingSessionId: base.votingSessionId,
        meetingCode: base.meetingCode,
        type: base.type,
        open: base.open,
        createdAt: base.createdAt,
        voteOptions,
        votes,
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
      (qs) => {
        const bases: SessionBase[] = [];

        qs.forEach((d) => {
          const data = d.data({ serverTimestamps: "estimate" }) as VotingSessionDoc;

          bases.push({
            votingSessionId: d.id,
            meetingCode: data.meetingCode,
            type: data.type,
            open: !!data.open,
            createdAt: toDateMaybe(data.createdAt),
            storedVoteOptions: Array.isArray(data.voteOptions) ? data.voteOptions : [],
          });
        });

        sessionsBaseRef.current = bases;

        // Votes listeners
        const sessionIdsNow = new Set(bases.map((b) => b.votingSessionId));

        voteUnsubsRef.current.forEach((unsub, sessionId) => {
          if (!sessionIdsNow.has(sessionId)) {
            unsub();
            voteUnsubsRef.current.delete(sessionId);
            votesBySessionRef.current.delete(sessionId);
          }
        });

        for (const b of bases) {
          const sessionId = b.votingSessionId;
          if (voteUnsubsRef.current.has(sessionId)) continue;

          const votesCol = collection(db, "meetings", meetingCode, "votingSessions", sessionId, "votes");
          const votesQ = query(votesCol, orderBy("createdAt", "asc"));

          const unsubVotes = onSnapshot(
            votesQ,
            { includeMetadataChanges: true },
            (votesSnap) => {
              const votes: Vote[] = [];
              votesSnap.forEach((vd) => {
                const vdata = vd.data({ serverTimestamps: "estimate" }) as VoteDoc;
                votes.push(mapVote(sessionId, vdata));
              });

              votesBySessionRef.current.set(sessionId, votes);
              rehydrateAndSet();
            },
            (err) => setError(err as Error)
          );

          voteUnsubsRef.current.set(sessionId, unsubVotes);
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

              const pdata = snap.data({ serverTimestamps: "estimate" }) as any;

              const proposal: Proposal = {
                meetingCode: pdata.meetingCode ?? meetingCode,
                proposerName: pdata.proposerName ?? "",
                description: pdata.description ?? "",
                createdAt: toDateMaybe(pdata.createdAt),
                id: snap.id,
                supporterUids: Array.isArray(pdata.supporterUids) ? pdata.supporterUids : [],
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
  }, [meetingCode]);

  return { openVotingSessions, completedVotingSessions, loading, error };
}
